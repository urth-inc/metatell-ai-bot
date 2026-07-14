import { actionNames, conditionNames, getAction, getCondition } from './registry.js'
import type { JsonObject, JsonValue, NodeDef, ParamSpec, TreeDef } from './types.js'

/**
 * Structural validation of a tree.json document with Japanese messages.
 * Shared by the loader, `pnpm check`, and `pnpm design`.
 * Register all nodes (built-ins and custom nodes) before calling.
 */

export type JsonPath = (string | number)[]

export interface ValidationIssue {
  path: JsonPath
  message: string
  level: 'error' | 'warning'
}

const COMPOSITE_TYPES = ['sequence', 'selector']
const DECORATOR_TYPES = ['inverter', 'cooldown', 'repeat']
const LEAF_TYPES = ['condition', 'action']
const ALL_TYPES = [...COMPOSITE_TYPES, ...DECORATOR_TYPES, ...LEAF_TYPES]

const ALLOWED_KEYS: { [type: string]: string[] } = {
  sequence: ['type', 'name', 'children'],
  selector: ['type', 'name', 'children'],
  inverter: ['type', 'name', 'child'],
  cooldown: ['type', 'name', 'params', 'child'],
  repeat: ['type', 'name', 'params', 'child'],
  condition: ['type', 'name', 'params'],
  action: ['type', 'name', 'params'],
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// タイプミス支援のための簡易編集距離
function editDistance(a: string, b: string): number {
  const rows: number[][] = []
  for (let i = 0; i <= a.length; i += 1) {
    rows.push([i])
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] =
        i === 0
          ? j
          : Math.min(
              rows[i - 1][j] + 1,
              rows[i][j - 1] + 1,
              rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
            )
    }
  }
  return rows[a.length][b.length]
}

function suggest(name: string, candidates: string[]): string {
  const nearest = candidates
    .map((candidate) => ({ candidate, distance: editDistance(name, candidate) }))
    .filter((entry) => entry.distance <= 2)
    .sort((a, b) => a.distance - b.distance)[0]
  return nearest ? `もしかして「${nearest.candidate}」ですか?` : ''
}

function validateParams(
  params: JsonObject,
  spec: ParamSpec,
  path: JsonPath,
  issues: ValidationIssue[],
): void {
  for (const [key, rule] of Object.entries(spec)) {
    const value = params[key]
    if (value === undefined) {
      if (rule.required) {
        issues.push({
          path,
          message: `paramsに「${key}」（${rule.type}）が必要です`,
          level: 'error',
        })
      }
      continue
    }
    if (rule.type !== 'json' && typeof value !== rule.type) {
      issues.push({
        path: [...path, key],
        message: `params.${key}は${rule.type}型で指定してください`,
        level: 'error',
      })
    }
  }
  for (const key of Object.keys(params)) {
    if (!(key in spec)) {
      issues.push({
        path: [...path, key],
        message:
          `params.${key}はこのノードでは使いません。${suggest(key, Object.keys(spec))}`.trim(),
        level: 'warning',
      })
    }
  }
}

function validateNode(
  node: JsonValue | undefined,
  path: JsonPath,
  issues: ValidationIssue[],
  underCooldown: boolean,
): void {
  if (!isObject(node)) {
    issues.push({
      path,
      message: 'ノードは{ "type": ... }形式のオブジェクトで書いてください',
      level: 'error',
    })
    return
  }
  const type = node.type
  if (typeof type !== 'string') {
    issues.push({
      path,
      message: '「type」が必要です（sequence / selector / condition / actionなど）',
      level: 'error',
    })
    return
  }
  if (!ALL_TYPES.includes(type)) {
    issues.push({
      path: [...path, 'type'],
      message: `未知のノード種別「${type}」です。${suggest(type, ALL_TYPES)}`.trim(),
      level: 'error',
    })
    return
  }

  for (const key of Object.keys(node)) {
    if (!ALLOWED_KEYS[type].includes(key)) {
      issues.push({
        path: [...path, key],
        message:
          `「${key}」は${type}ノードでは使いません。${suggest(key, ALLOWED_KEYS[type])}`.trim(),
        level: 'error',
      })
    }
  }

  if (COMPOSITE_TYPES.includes(type)) {
    const children = node.children
    if (!Array.isArray(children) || children.length === 0) {
      issues.push({
        path,
        message: `${type}には1つ以上の子を持つ「children」配列が必要です`,
        level: 'error',
      })
      return
    }
    children.forEach((child, index) => {
      validateNode(child, [...path, 'children', index], issues, underCooldown)
    })
    return
  }

  if (DECORATOR_TYPES.includes(type)) {
    if (type === 'cooldown') {
      const params = isObject(node.params) ? node.params : {}
      const sec = params.sec
      if (typeof sec !== 'number' || sec <= 0) {
        issues.push({
          path,
          message: 'cooldownにはparams.sec（正の数値）が必要です。例: "params": { "sec": 30 }',
          level: 'error',
        })
      }
    }
    if (type === 'repeat') {
      const params = isObject(node.params) ? node.params : {}
      const times = params.times
      if (typeof times !== 'number' || !Number.isInteger(times) || times < 1) {
        issues.push({
          path,
          message: 'repeatにはparams.times（1以上の整数）が必要です。例: "params": { "times": 3 }',
          level: 'error',
        })
      }
    }
    if (node.child === undefined) {
      issues.push({
        path,
        message: `${type}には「child」（子ノード1つ）が必要です`,
        level: 'error',
      })
      return
    }
    validateNode(node.child, [...path, 'child'], issues, underCooldown || type === 'cooldown')
    return
  }

  // 条件と行動: 登録済みの名前とparamsを検証する
  const name = node.name
  if (typeof name !== 'string' || name === '') {
    issues.push({
      path,
      message: `${type}には「name」（ノード名の文字列）が必要です`,
      level: 'error',
    })
    return
  }
  const registered = type === 'condition' ? getCondition(name) : getAction(name)
  if (!registered) {
    const known = type === 'condition' ? conditionNames() : actionNames()
    issues.push({
      path: [...path, 'name'],
      message:
        `${type === 'condition' ? '条件' : '行動'}ノード「${name}」は登録されていません。${suggest(name, known)}`.trim(),
      level: 'error',
    })
    return
  }
  const params = isObject(node.params) ? node.params : {}
  validateParams(params, registered.paramSpec, [...path, 'params'], issues)

  // llm_sayは自発発話なのでcooldownで頻度を絞るのがこのテンプレートの前提
  if (name === 'llm_say' && !underCooldown) {
    issues.push({
      path,
      message: 'llm_sayはcooldownノードの中に置いてください（自発発話が止まらなくなります）',
      level: 'warning',
    })
  }
}

/** Validates a parsed tree.json document. Returns all issues found (empty = valid). */
export function validateTreeDoc(doc: JsonValue): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isObject(doc)) {
    issues.push({
      path: [],
      message: 'tree.jsonは{ "root": ... }形式のオブジェクトで書いてください',
      level: 'error',
    })
    return issues
  }
  if (doc.root === undefined) {
    issues.push({
      path: [],
      message: '「root」が必要です。例: { "root": { "type": "selector", ... } }',
      level: 'error',
    })
    return issues
  }
  for (const key of Object.keys(doc)) {
    if (key !== 'root' && key !== '$schema') {
      issues.push({
        path: [key],
        message: `「${key}」はtree.jsonの最上位では使いません`,
        level: 'error',
      })
    }
  }
  validateNode(doc.root, ['root'], issues, false)
  return issues
}

// 検証済みのJSONオブジェクトをキャストなしでNodeDefに組み立て直す
function toNodeDef(value: JsonObject): NodeDef {
  const def: NodeDef = { type: typeof value.type === 'string' ? value.type : '' }
  if (typeof value.name === 'string') def.name = value.name
  if (isObject(value.params)) def.params = value.params
  if (Array.isArray(value.children)) def.children = value.children.filter(isObject).map(toNodeDef)
  if (isObject(value.child)) def.child = toNodeDef(value.child)
  return def
}

/** Converts a validated document to TreeDef. Call only after validateTreeDoc returns no errors. */
export function asTreeDef(doc: JsonValue): TreeDef {
  if (!isObject(doc) || !isObject(doc.root)) {
    throw new Error('検証を通過していないtree.jsonをasTreeDefに渡さないでください')
  }
  return { root: toNodeDef(doc.root) }
}
