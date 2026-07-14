import type { ActionFn, ConditionFn, ParamSpec } from './types.js'

/**
 * Node registry: the official extension point of the engine.
 * Built-in nodes and my-bot/custom-nodes.ts both register through this API.
 */

export interface RegisteredCondition {
  fn: ConditionFn
  paramSpec: ParamSpec
  description: string
}

export interface RegisteredAction {
  fn: ActionFn
  paramSpec: ParamSpec
  description: string
}

const conditions = new Map<string, RegisteredCondition>()
const actions = new Map<string, RegisteredAction>()

export interface RegisterOptions {
  params?: ParamSpec
  description?: string
}

/** Registers a condition node usable from tree.json as {"type": "condition", "name": ...}. */
export function registerCondition(name: string, fn: ConditionFn, options?: RegisterOptions): void {
  if (conditions.has(name)) {
    throw new Error(`条件ノード「${name}」はすでに登録されています`)
  }
  conditions.set(name, {
    fn,
    paramSpec: options?.params ?? {},
    description: options?.description ?? '',
  })
}

/** Registers an action node usable from tree.json as {"type": "action", "name": ...}. */
export function registerAction(name: string, fn: ActionFn, options?: RegisterOptions): void {
  if (actions.has(name)) {
    throw new Error(`行動ノード「${name}」はすでに登録されています`)
  }
  actions.set(name, {
    fn,
    paramSpec: options?.params ?? {},
    description: options?.description ?? '',
  })
}

export function getCondition(name: string): RegisteredCondition | undefined {
  return conditions.get(name)
}

export function getAction(name: string): RegisteredAction | undefined {
  return actions.get(name)
}

export function conditionNames(): string[] {
  return [...conditions.keys()]
}

export function actionNames(): string[] {
  return [...actions.keys()]
}
