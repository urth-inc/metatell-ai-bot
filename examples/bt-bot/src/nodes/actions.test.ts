import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBlackboard } from '../engine/blackboard.js'
import { getAction } from '../engine/registry.js'
import type { BotApi, ChatInbox, TickContext } from '../engine/types.js'
import { registerBuiltinActions } from './actions.js'

registerBuiltinActions()

const inbox: ChatInbox = {
  peekMention: () => undefined,
  takeMention: () => undefined,
  recentChat: () => [],
}

function createContext(): { ctx: TickContext; emotes: string[] } {
  const emotes: string[] = []
  const api: BotApi = {
    botName: 'Test Bot',
    persona: '',
    llm: null,
    log: () => {},
    say: async () => true,
    moveTowards: () => 'arrived',
    lookAt: () => {},
    emote: async (animation) => {
      emotes.push(animation)
      return 'played'
    },
    patrolTarget: () => undefined,
    patrolLength: () => 0,
    expand: (text) => text,
  }
  return {
    ctx: { bb: createBlackboard(), inbox, api, now: 0, trace: [] },
    emotes,
  }
}

test('emoteはanimationを固定指定して再生する', async () => {
  const action = getAction('emote')
  assert.ok(action)
  const { ctx, emotes } = createContext()

  assert.equal(await action.fn(ctx, { animation: 'wave' }), 'SUCCESS')
  assert.deepEqual(emotes, ['wave'])
})

test('emote_from_blackboardはkeyで指定したblackboardの文字列を動的に再生する', async () => {
  const action = getAction('emote_from_blackboard')
  assert.ok(action)
  const { ctx, emotes } = createContext()
  ctx.bb.set('selectedEmote', 'clap')

  assert.equal(await action.fn(ctx, { key: 'selectedEmote' }), 'SUCCESS')
  assert.deepEqual(emotes, ['clap'])
})

test('emote_from_blackboardはblackboard値が有効な文字列でなければ失敗する', async () => {
  const action = getAction('emote_from_blackboard')
  assert.ok(action)
  const { ctx, emotes } = createContext()
  ctx.bb.set('numericEmote', 1)
  ctx.bb.set('emptyEmote', '')

  assert.equal(await action.fn(ctx, {}), 'FAILURE')
  assert.equal(await action.fn(ctx, { key: 'missingEmote' }), 'FAILURE')
  assert.equal(await action.fn(ctx, { key: 'numericEmote' }), 'FAILURE')
  assert.equal(await action.fn(ctx, { key: 'emptyEmote' }), 'FAILURE')
  assert.deepEqual(emotes, [])
})
