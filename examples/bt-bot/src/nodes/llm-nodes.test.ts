import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBlackboard } from '../engine/blackboard.js'
import { getAction } from '../engine/registry.js'
import type { BotApi, ChatInbox, PendingMention, TickContext } from '../engine/types.js'
import { registerLlmActions } from './llm-nodes.js'

registerLlmActions()

function createContext(options: {
  mentions: PendingMention[]
  api: Pick<BotApi, 'llm' | 'log'>
}): TickContext {
  const queue = options.mentions
  const inbox: ChatInbox = {
    peekMention: () => queue[0],
    takeMention: () => queue.shift(),
    recentChat: () => [],
  }
  return {
    bb: createBlackboard(),
    inbox,
    api: {
      botName: 'Test Bot',
      persona: 'Helpful',
      say: async () => true,
      moveTowards: () => 'arrived',
      lookAt: () => {},
      emote: () => {},
      patrolTarget: () => undefined,
      patrolLength: () => 0,
      expand: (text) => text,
      ...options.api,
    },
    now: 0,
    trace: [],
  }
}

test('LLM未設定でもmentionを一度消費して次tickへ残さない', async () => {
  const logs: string[] = []
  const mention: PendingMention = {
    fromName: 'Visitor',
    text: 'hello',
    reply: async () => true,
  }
  const ctx = createContext({
    mentions: [mention],
    api: { llm: null, log: (message) => logs.push(message) },
  })
  const llmReply = getAction('llm_reply')
  assert.ok(llmReply)

  const first = await llmReply.fn(ctx, {})
  const second = await llmReply.fn(ctx, {})

  assert.equal(first, 'FAILURE')
  assert.equal(second, 'FAILURE')
  assert.equal(ctx.inbox.peekMention(), undefined)
  assert.equal(logs.length, 1)
})

test('LLM設定時は消費したmentionへ生成結果を返信する', async () => {
  const replies: string[] = []
  const mention: PendingMention = {
    fromName: 'Visitor',
    text: 'hello',
    reply: async (text) => {
      replies.push(text)
      return true
    },
  }
  const ctx = createContext({
    mentions: [mention],
    api: {
      llm: {
        complete: async () => 'Hello!',
        choose: async () => 0,
      },
      log: () => {},
    },
  })
  const llmReply = getAction('llm_reply')
  assert.ok(llmReply)

  const result = await llmReply.fn(ctx, {})

  assert.equal(result, 'SUCCESS')
  assert.deepEqual(replies, ['Hello!'])
  assert.equal(ctx.inbox.peekMention(), undefined)
})
