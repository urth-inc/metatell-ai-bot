import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { createBlackboard } from './blackboard.js'
import { buildTree, tickTree } from './engine.js'
import { registerAction, registerCondition } from './registry.js'
import type { Blackboard, BotApi, ChatInbox, TickContext, TreeDef } from './types.js'

/* Engine semantics tests: composite nodes, RUNNING memory, decorators,
   exception-to-FAILURE conversion, and async actions. */

const inboxStub: ChatInbox = {
  peekMention: () => undefined,
  takeMention: () => undefined,
  recentChat: () => [],
}

const apiStub: BotApi = {
  botName: 'test',
  persona: '',
  llm: null,
  log: () => {},
  say: async () => true,
  moveTowards: () => 'arrived',
  lookAt: () => {},
  emote: () => {},
  patrolTarget: () => undefined,
  patrolLength: () => 0,
  expand: (text) => text,
}

function makeCtx(bb: Blackboard, now: number): TickContext {
  return { bb, inbox: inboxStub, api: apiStub, now, trace: [] }
}

// テスト用ノード。フラグとカウンタは外部状態で観察する
const flags: { [key: string]: boolean } = {}
const counters: { [key: string]: number } = {}

registerCondition('test_flag', (_ctx, params) => flags[String(params.key)] === true)
registerAction('test_count', (_ctx, params) => {
  const key = String(params.key)
  counters[key] = (counters[key] ?? 0) + 1
  return 'SUCCESS'
})
registerAction('test_running_until', (_ctx, params) => {
  const key = String(params.key)
  counters[key] = (counters[key] ?? 0) + 1
  return counters[key] >= Number(params.calls) ? 'SUCCESS' : 'RUNNING'
})
registerAction('test_fail', () => 'FAILURE')
registerAction('test_throw', () => {
  throw new Error('boom')
})
registerAction('test_async', async () => {
  await new Promise((resolve) => setTimeout(resolve, 5))
  return 'SUCCESS'
})

beforeEach(() => {
  for (const key of Object.keys(flags)) delete flags[key]
  for (const key of Object.keys(counters)) delete counters[key]
})

test('selectorは上から試して最初にSUCCESSした子で止まる', () => {
  const tree: TreeDef = {
    root: {
      type: 'selector',
      children: [
        {
          type: 'sequence',
          children: [
            { type: 'condition', name: 'test_flag', params: { key: 'a' } },
            { type: 'action', name: 'test_count', params: { key: 'first' } },
          ],
        },
        { type: 'action', name: 'test_count', params: { key: 'fallback' } },
      ],
    },
  }
  const bb = createBlackboard()

  flags.a = false
  assert.equal(tickTree(buildTree(tree), makeCtx(bb, 0)), 'SUCCESS')
  assert.equal(counters.first ?? 0, 0)
  assert.equal(counters.fallback, 1)

  flags.a = true
  assert.equal(tickTree(buildTree(tree), makeCtx(bb, 0)), 'SUCCESS')
  assert.equal(counters.first, 1)
  assert.equal(counters.fallback, 1)
})

test('sequenceは子を順に実行し、FAILUREで止まる', () => {
  const tree: TreeDef = {
    root: {
      type: 'sequence',
      children: [
        { type: 'action', name: 'test_count', params: { key: 'one' } },
        { type: 'action', name: 'test_fail' },
        { type: 'action', name: 'test_count', params: { key: 'two' } },
      ],
    },
  }
  assert.equal(tickTree(buildTree(tree), makeCtx(createBlackboard(), 0)), 'FAILURE')
  assert.equal(counters.one, 1)
  assert.equal(counters.two ?? 0, 0)
})

test('RUNNINGの子を記憶し、前の兄弟条件を再評価せずに再開する', () => {
  const tree: TreeDef = {
    root: {
      type: 'selector',
      children: [
        {
          type: 'sequence',
          children: [
            { type: 'condition', name: 'test_flag', params: { key: 'gate' } },
            { type: 'action', name: 'test_running_until', params: { key: 'work', calls: 3 } },
          ],
        },
        { type: 'action', name: 'test_count', params: { key: 'fallback' } },
      ],
    },
  }
  const root = buildTree(tree)
  const bb = createBlackboard()

  flags.gate = true
  assert.equal(tickTree(root, makeCtx(bb, 0)), 'RUNNING')
  // 実行中はゲート条件が変わっても、実行中の分岐を続ける（メモリつきBT）
  flags.gate = false
  assert.equal(tickTree(root, makeCtx(bb, 500)), 'RUNNING')
  assert.equal(tickTree(root, makeCtx(bb, 1000)), 'SUCCESS')
  assert.equal(counters.work, 3)
  assert.equal(counters.fallback ?? 0, 0)
})

test('cooldownデコレータはツリー完了後も時計を保持する', () => {
  const tree: TreeDef = {
    root: {
      type: 'cooldown',
      params: { sec: 30 },
      child: { type: 'action', name: 'test_count', params: { key: 'c' } },
    },
  }
  const root = buildTree(tree)
  const bb = createBlackboard()
  assert.equal(tickTree(root, makeCtx(bb, 0)), 'SUCCESS')
  assert.equal(tickTree(root, makeCtx(bb, 10_000)), 'FAILURE')
  assert.equal(counters.c, 1)
  assert.equal(tickTree(root, makeCtx(bb, 31_000)), 'SUCCESS')
  assert.equal(counters.c, 2)
})

test('inverterはSUCCESSとFAILUREを反転する', () => {
  const tree: TreeDef = {
    root: { type: 'inverter', child: { type: 'action', name: 'test_fail' } },
  }
  assert.equal(tickTree(buildTree(tree), makeCtx(createBlackboard(), 0)), 'SUCCESS')
})

test('repeatは指定回数成功するまで子を繰り返す', () => {
  const tree: TreeDef = {
    root: {
      type: 'repeat',
      params: { times: 3 },
      child: { type: 'action', name: 'test_count', params: { key: 'r' } },
    },
  }
  assert.equal(tickTree(buildTree(tree), makeCtx(createBlackboard(), 0)), 'SUCCESS')
  assert.equal(counters.r, 3)
})

test('ノード内の例外はFAILUREに変換され、ツリーは動き続ける', () => {
  const tree: TreeDef = {
    root: {
      type: 'selector',
      children: [
        { type: 'action', name: 'test_throw' },
        { type: 'action', name: 'test_count', params: { key: 'after' } },
      ],
    },
  }
  assert.equal(tickTree(buildTree(tree), makeCtx(createBlackboard(), 0)), 'SUCCESS')
  assert.equal(counters.after, 1)
})

test('Promiseを返す行動は解決までRUNNINGになる', async () => {
  const tree: TreeDef = {
    root: { type: 'action', name: 'test_async' },
  }
  const root = buildTree(tree)
  const bb = createBlackboard()
  assert.equal(tickTree(root, makeCtx(bb, 0)), 'RUNNING')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(tickTree(root, makeCtx(bb, 500)), 'SUCCESS')
})

test('未登録のノード名はビルド時にエラーになる', () => {
  const tree: TreeDef = {
    root: { type: 'action', name: 'no_such_action' },
  }
  assert.throws(() => buildTree(tree), /登録されていません/)
})
