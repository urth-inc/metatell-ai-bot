import assert from 'node:assert/strict'
import { test } from 'node:test'
import '../my-bot/custom-nodes.js'
import { createBlackboard } from './engine/blackboard.js'
import { getAction } from './engine/registry.js'
import type { BotApi, ChatInbox, TickContext } from './engine/types.js'

const inbox: ChatInbox = {
  peekMention: () => undefined,
  takeMention: () => undefined,
  recentChat: () => [],
}

test('bowアクションは挨拶テンプレートを展開してから発言する', async () => {
  const spoken: string[] = []
  const emotes: string[] = []
  const api: BotApi = {
    botName: 'Test Bot',
    persona: '',
    llm: null,
    log: () => {},
    say: async (text) => {
      spoken.push(text)
      return true
    },
    moveTowards: () => 'arrived',
    lookAt: () => {},
    emote: (animation) => emotes.push(animation),
    patrolTarget: () => undefined,
    patrolLength: () => 0,
    expand: (text) => text.replaceAll('{userName}', 'Visitor'),
  }
  const ctx: TickContext = {
    bb: createBlackboard(),
    inbox,
    api,
    now: 0,
    trace: [],
  }
  const bow = getAction('bow')
  assert.ok(bow)

  const result = await bow.fn(ctx, {})

  assert.equal(result, 'SUCCESS')
  assert.deepEqual(emotes, ['nod'])
  assert.deepEqual(spoken, ['Visitorさん、いらっしゃいませ！'])
})
