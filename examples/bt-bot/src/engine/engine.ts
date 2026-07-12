import { getAction, getCondition } from './registry.js'
import type { BTNode, NodeDef, Status, TickContext, TreeDef } from './types.js'

/**
 * Behavior tree engine.
 *
 * - Tick-driven: the runtime calls tickTree() on a fixed interval.
 * - Three states: SUCCESS / FAILURE / RUNNING.
 * - Sequence / selector remember a RUNNING child and resume from it
 *   on the next tick (memory semantics). Earlier siblings are not
 *   re-evaluated until the running child completes.
 * - reset() clears execution state only. Cooldown timestamps survive a
 *   reset on purpose: a finished tree must not re-arm its cooldowns.
 */

// ノード実装内の例外はツリー全体を落とさずFAILUREに変換する（安全装置）
function guard(ctx: TickContext, label: string, run: () => Status): Status {
  try {
    return run()
  } catch (error) {
    ctx.api.log(`ノード「${label}」で例外が発生したためFAILUREにしました: ${String(error)}`)
    return 'FAILURE'
  }
}

function traced(ctx: TickContext, depth: number, label: string, compute: () => Status): Status {
  const index = ctx.trace.length
  ctx.trace.push({ depth, label, status: 'RUNNING' })
  const status = compute()
  ctx.trace[index].status = status
  return status
}

function makeComposite(kind: 'sequence' | 'selector', def: NodeDef, depth: number): BTNode {
  const children = (def.children ?? []).map((child) => makeNode(child, depth + 1))
  // RUNNINGを返した子を記憶し、次のtickでそこから再開する
  let runningIndex = 0
  const stopOn: Status = kind === 'sequence' ? 'FAILURE' : 'SUCCESS'
  const label = def.name ?? kind
  return {
    label,
    tick(ctx) {
      return traced(ctx, depth, label, () => {
        while (runningIndex < children.length) {
          const status = children[runningIndex].tick(ctx)
          if (status === 'RUNNING') return 'RUNNING'
          if (status === stopOn) {
            this.reset()
            return stopOn
          }
          runningIndex += 1
        }
        this.reset()
        return kind === 'sequence' ? 'SUCCESS' : 'FAILURE'
      })
    },
    reset() {
      runningIndex = 0
      for (const child of children) child.reset()
    },
  }
}

function makeInverter(def: NodeDef, depth: number): BTNode {
  const child = makeNode(def.child as NodeDef, depth + 1)
  const label = def.name ?? 'inverter'
  return {
    label,
    tick(ctx) {
      return traced(ctx, depth, label, () => {
        const status = child.tick(ctx)
        if (status === 'SUCCESS') return 'FAILURE'
        if (status === 'FAILURE') return 'SUCCESS'
        return 'RUNNING'
      })
    },
    reset() {
      child.reset()
    },
  }
}

function makeCooldown(def: NodeDef, depth: number): BTNode {
  const child = makeNode(def.child as NodeDef, depth + 1)
  const sec = Number(def.params?.sec ?? 0)
  const label = def.name ?? `cooldown(${sec}s)`
  // クールダウンの時計はreset()では消えない。ツリー完了のたびに再武装させないため
  let lastSuccessMs = Number.NEGATIVE_INFINITY
  let childRunning = false
  return {
    label,
    tick(ctx) {
      return traced(ctx, depth, label, () => {
        if (!childRunning && ctx.now - lastSuccessMs < sec * 1000) return 'FAILURE'
        const status = child.tick(ctx)
        childRunning = status === 'RUNNING'
        if (status === 'SUCCESS') lastSuccessMs = ctx.now
        return status
      })
    },
    reset() {
      childRunning = false
      child.reset()
    },
  }
}

function makeRepeat(def: NodeDef, depth: number): BTNode {
  const child = makeNode(def.child as NodeDef, depth + 1)
  const times = Number(def.params?.times ?? 1)
  const label = def.name ?? `repeat(${times})`
  let completed = 0
  return {
    label,
    tick(ctx) {
      return traced(ctx, depth, label, () => {
        while (completed < times) {
          const status = child.tick(ctx)
          if (status === 'RUNNING') return 'RUNNING'
          if (status === 'FAILURE') {
            this.reset()
            return 'FAILURE'
          }
          completed += 1
          child.reset()
        }
        this.reset()
        return 'SUCCESS'
      })
    },
    reset() {
      completed = 0
      child.reset()
    },
  }
}

function makeCondition(def: NodeDef, depth: number): BTNode {
  const name = def.name ?? ''
  const registered = getCondition(name)
  if (!registered) throw new Error(`条件ノード「${name}」は登録されていません`)
  const params = def.params ?? {}
  const label = `condition:${name}`
  return {
    label,
    tick(ctx) {
      return traced(ctx, depth, label, () =>
        guard(ctx, label, () => (registered.fn(ctx, params) ? 'SUCCESS' : 'FAILURE')),
      )
    },
    reset() {},
  }
}

function makeAction(def: NodeDef, depth: number): BTNode {
  const name = def.name ?? ''
  const registered = getAction(name)
  if (!registered) throw new Error(`行動ノード「${name}」は登録されていません`)
  const params = def.params ?? {}
  const label = `action:${name}`
  // 非同期の行動は一度だけ起動し、解決までRUNNINGを返す。
  // reset後に古いPromiseの結果を拾わないよう世代番号で無効化する
  let generation = 0
  let inflight = false
  let settled: Status | null = null
  return {
    label,
    tick(ctx) {
      return traced(ctx, depth, label, () => {
        if (inflight) return 'RUNNING'
        if (settled !== null) {
          const result = settled
          settled = null
          return result
        }
        return guard(ctx, label, () => {
          const result = registered.fn(ctx, params)
          if (result === 'SUCCESS' || result === 'FAILURE' || result === 'RUNNING') {
            return result
          }
          const startedGeneration = generation
          inflight = true
          result
            .then((status) => {
              if (generation !== startedGeneration) return
              inflight = false
              settled = status
            })
            .catch((error) => {
              if (generation !== startedGeneration) return
              inflight = false
              settled = 'FAILURE'
              ctx.api.log(
                `ノード「${label}」で例外が発生したためFAILUREにしました: ${String(error)}`,
              )
            })
          return 'RUNNING'
        })
      })
    },
    reset() {
      generation += 1
      inflight = false
      settled = null
    },
  }
}

function makeNode(def: NodeDef, depth: number): BTNode {
  switch (def.type) {
    case 'sequence':
    case 'selector':
      return makeComposite(def.type, def, depth)
    case 'inverter':
      return makeInverter(def, depth)
    case 'cooldown':
      return makeCooldown(def, depth)
    case 'repeat':
      return makeRepeat(def, depth)
    case 'condition':
      return makeCondition(def, depth)
    case 'action':
      return makeAction(def, depth)
    default:
      throw new Error(`未知のノード種別「${def.type}」です`)
  }
}

/** Builds an executable tree from a validated tree.json document. */
export function buildTree(def: TreeDef): BTNode {
  return makeNode(def.root, 0)
}

/**
 * Ticks the tree once. When the root completes (SUCCESS or FAILURE) the
 * execution state is reset so the next tick re-evaluates from the top.
 */
export function tickTree(root: BTNode, ctx: TickContext): Status {
  const status = root.tick(ctx)
  if (status !== 'RUNNING') root.reset()
  return status
}
