import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBlackboard } from '../engine/blackboard.js'
import { getCondition } from '../engine/registry.js'
import type { BotApi, ChatInbox, TickContext } from '../engine/types.js'
import { registerBuiltinConditions } from './conditions.js'

registerBuiltinConditions()

const inbox: ChatInbox = {
  peekMention: () => undefined,
  takeMention: () => undefined,
  recentChat: () => [],
}

const api: BotApi = {
  botName: 'Test Bot',
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

function createContext(): TickContext {
  return { bb: createBlackboard(), inbox, api, now: 0, trace: [] }
}

test('blackboard_equalsはキー順に依存せずJSONオブジェクトを構造比較する', () => {
  const condition = getCondition('blackboard_equals')
  assert.ok(condition)
  const ctx = createContext()
  ctx.bb.set('state', { first: 1, nested: { enabled: true }, list: ['a', 2] })

  const equal = condition.fn(ctx, {
    key: 'state',
    value: { list: ['a', 2], nested: { enabled: true }, first: 1 },
  })
  const different = condition.fn(ctx, {
    key: 'state',
    value: { list: [2, 'a'], nested: { enabled: true }, first: 1 },
  })

  assert.equal(equal, true)
  assert.equal(different, false)
})

test('blackboard_equalsはプリミティブを厳密比較する', () => {
  const condition = getCondition('blackboard_equals')
  assert.ok(condition)
  const ctx = createContext()
  ctx.bb.set('count', 1)

  assert.equal(condition.fn(ctx, { key: 'count', value: 1 }), true)
  assert.equal(condition.fn(ctx, { key: 'count', value: '1' }), false)
})
