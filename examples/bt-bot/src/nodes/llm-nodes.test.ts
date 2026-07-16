import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBlackboard } from '../engine/blackboard.js'
import { buildTree, tickTree } from '../engine/engine.js'
import { getAction, registerAction, registerCondition } from '../engine/registry.js'
import type { BotApi, ChatInbox, PendingMention, TickContext, TreeDef } from '../engine/types.js'
import { registerLlmActions } from './llm-nodes.js'

registerLlmActions()
registerCondition('test_mention_pending', (ctx) => ctx.inbox.peekMention() !== undefined)
registerAction('test_patrol_forever', () => 'RUNNING')

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

test('LLM未設定でもmentionを一度消費し、固定メッセージで返信する', async () => {
  const logs: string[] = []
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
    api: { llm: null, log: (message) => logs.push(message) },
  })
  const llmReply = getAction('llm_reply')
  assert.ok(llmReply)

  const first = await llmReply.fn(ctx, {})
  const second = await llmReply.fn(ctx, {})

  assert.equal(first, 'SUCCESS')
  assert.equal(second, 'FAILURE')
  assert.equal(ctx.inbox.peekMention(), undefined)
  assert.deepEqual(replies, ['Visitorさん、話しかけてくれてありがとう。ちゃんと聞こえています。'])
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

test('LLM生成に失敗してもmentionへ固定メッセージを返信する', async () => {
  const replies: string[] = []
  const logs: string[] = []
  const ctx = createContext({
    mentions: [
      {
        fromName: 'Visitor',
        text: 'hello',
        reply: async (text) => {
          replies.push(text)
          return true
        },
      },
    ],
    api: {
      llm: {
        complete: async () => {
          throw new Error('temporary error')
        },
        choose: async () => 0,
      },
      log: (message) => logs.push(message),
    },
  })
  const llmReply = getAction('llm_reply')
  assert.ok(llmReply)

  assert.equal(await llmReply.fn(ctx, {}), 'SUCCESS')
  assert.deepEqual(replies, ['Visitorさん、話しかけてくれてありがとう。ちゃんと聞こえています。'])
  assert.ok(logs.some((message) => message.includes('temporary error')))
})

test('巡回がRUNNINGでもメンションは次tickで割り込み返信する', async () => {
  const mentions: PendingMention[] = []
  const replies: string[] = []
  const ctx = createContext({
    mentions,
    api: {
      llm: {
        complete: async () => '呼んだ？',
        choose: async () => 0,
      },
      log: () => {},
    },
  })
  const tree: TreeDef = {
    root: {
      type: 'priority_selector',
      children: [
        {
          type: 'sequence',
          children: [
            { type: 'condition', name: 'test_mention_pending' },
            { type: 'action', name: 'llm_reply' },
          ],
        },
        { type: 'action', name: 'test_patrol_forever' },
      ],
    },
  }
  const root = buildTree(tree)

  assert.equal(tickTree(root, ctx), 'RUNNING')
  mentions.push({
    fromName: 'Visitor',
    text: 'こんにちは',
    reply: async (text) => {
      replies.push(text)
      return true
    },
  })
  ctx.now = 500
  ctx.trace = []

  assert.equal(tickTree(root, ctx), 'RUNNING')
  assert.ok(ctx.trace.some((entry) => entry.label === 'action:llm_reply'))
  assert.ok(!ctx.trace.some((entry) => entry.label === 'action:test_patrol_forever'))
  await new Promise((resolve) => setImmediate(resolve))

  ctx.now = 1_000
  ctx.trace = []
  assert.equal(tickTree(root, ctx), 'SUCCESS')
  assert.deepEqual(replies, ['呼んだ？'])
})

test('返信の音声再生が終わるまでllm_replyをRUNNINGに保ち巡回を再開しない', async () => {
  let finishReply: ((sent: boolean) => void) | undefined
  const mentions: PendingMention[] = [
    {
      fromName: 'Visitor',
      text: 'こんにちは',
      reply: () =>
        new Promise<boolean>((resolve) => {
          finishReply = resolve
        }),
    },
  ]
  const ctx = createContext({
    mentions,
    api: {
      llm: {
        complete: async () => 'こんにちは！',
        choose: async () => 0,
      },
      log: () => {},
    },
  })
  const root = buildTree({
    root: {
      type: 'priority_selector',
      children: [
        {
          type: 'sequence',
          children: [
            { type: 'condition', name: 'test_mention_pending' },
            { type: 'action', name: 'llm_reply' },
          ],
        },
        { type: 'action', name: 'test_patrol_forever' },
      ],
    },
  })

  assert.equal(tickTree(root, ctx), 'RUNNING')
  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(finishReply)

  ctx.trace = []
  assert.equal(tickTree(root, ctx), 'RUNNING')
  assert.ok(ctx.trace.some((entry) => entry.label === 'action:llm_reply'))
  assert.ok(!ctx.trace.some((entry) => entry.label === 'action:test_patrol_forever'))

  finishReply(true)
  await new Promise((resolve) => setImmediate(resolve))
  ctx.trace = []
  assert.equal(tickTree(root, ctx), 'SUCCESS')

  ctx.trace = []
  assert.equal(tickTree(root, ctx), 'RUNNING')
  assert.ok(ctx.trace.some((entry) => entry.label === 'action:test_patrol_forever'))
})
