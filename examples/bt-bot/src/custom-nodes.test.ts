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
    emote: async (animation) => {
      emotes.push(animation)
      return 'played'
    },
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
  assert.deepEqual(emotes, ['greet'])
  assert.deepEqual(spoken, ['Visitorさん、いらっしゃいませ！'])
})

function createGreetingContext(sendResults: boolean[] = []): {
  ctx: TickContext
  spoken: string[]
} {
  const bb = createBlackboard()
  const spoken: string[] = []
  const api: BotApi = {
    botName: 'Test Bot',
    persona: '',
    llm: null,
    log: () => {},
    say: async (text) => {
      const sent = sendResults.shift() ?? true
      if (sent) spoken.push(text)
      return sent
    },
    moveTowards: () => 'arrived',
    lookAt: () => {},
    emote: async () => 'played',
    patrolTarget: () => undefined,
    patrolLength: () => 0,
    expand: (text) =>
      text
        .replaceAll('{greeting}', 'はじめまして、{userName}さん！')
        .replaceAll('{botName}', 'Test Bot')
        .replaceAll('{userName}', String(bb.get('nearestUserName') ?? 'みなさん')),
  }
  return {
    ctx: { bb, inbox, api, now: 0, trace: [] },
    spoken,
  }
}

function setNearestUser(ctx: TickContext, id: string, name: string): void {
  ctx.bb.set('nearestUserId', id)
  ctx.bb.set('nearestUserName', name)
  ctx.bb.set('nearestUser', { name, x: 1, y: 0, z: 0 })
}

test('greet_userは同じsession IDへの2回目以降の挨拶を変える', async () => {
  const { ctx, spoken } = createGreetingContext()
  const greet = getAction('greet_user')
  assert.ok(greet)
  setNearestUser(ctx, 'visitor-session', 'Visitor')

  assert.equal(await greet.fn(ctx, { repeatText: 'また会ったね、{userName}さん！' }), 'SUCCESS')
  setNearestUser(ctx, 'visitor-session', 'Renamed Visitor')
  assert.equal(await greet.fn(ctx, { repeatText: 'また会ったね、{userName}さん！' }), 'SUCCESS')

  assert.deepEqual(spoken, ['はじめまして、Visitorさん！', 'また会ったね、Renamed Visitorさん！'])
  assert.deepEqual(ctx.bb.get('greetedUserIds'), ['visitor-session'])
})

test('greet_userは表示名が同じでもsession IDが違えば初対面として扱う', async () => {
  const { ctx, spoken } = createGreetingContext()
  const greet = getAction('greet_user')
  assert.ok(greet)
  setNearestUser(ctx, 'first-session', 'Visitor')
  assert.equal(await greet.fn(ctx, { repeatText: '再会' }), 'SUCCESS')
  setNearestUser(ctx, 'second-session', 'Visitor')
  assert.equal(await greet.fn(ctx, { repeatText: '再会' }), 'SUCCESS')

  assert.deepEqual(spoken, ['はじめまして、Visitorさん！', 'はじめまして、Visitorさん！'])
  assert.deepEqual(ctx.bb.get('greetedUserIds'), ['first-session', 'second-session'])
})

test('greet_userは発言を抑制されたユーザーを記憶しない', async () => {
  const { ctx, spoken } = createGreetingContext([false, true])
  const greet = getAction('greet_user')
  assert.ok(greet)
  setNearestUser(ctx, 'visitor-session', 'Visitor')

  assert.equal(await greet.fn(ctx, { repeatText: '再会' }), 'FAILURE')
  assert.equal(await greet.fn(ctx, { repeatText: '再会' }), 'SUCCESS')

  assert.deepEqual(spoken, ['はじめまして、Visitorさん！'])
  assert.deepEqual(ctx.bb.get('greetedUserIds'), ['visitor-session'])
})

test('greet_userはアニメーションに失敗しても挨拶してユーザーを記憶する', async () => {
  const { ctx, spoken } = createGreetingContext()
  const greet = getAction('greet_user')
  assert.ok(greet)
  ctx.api.emote = async () => 'failed'
  setNearestUser(ctx, 'visitor-session', 'Visitor')

  assert.equal(await greet.fn(ctx, { repeatText: '再会' }), 'SUCCESS')
  assert.deepEqual(spoken, ['はじめまして、Visitorさん！'])
  assert.deepEqual(ctx.bb.get('greetedUserIds'), ['visitor-session'])
})

test('greet_userは演出中に最寄り対象が変わっても、開始時の相手へ挨拶する', async () => {
  const { ctx, spoken } = createGreetingContext()
  const greet = getAction('greet_user')
  assert.ok(greet)
  let completeEmote: ((result: 'played') => void) | undefined
  ctx.api.emote = () =>
    new Promise<'played'>((resolve) => {
      completeEmote = resolve
    })
  setNearestUser(ctx, 'first-session', 'First Visitor')

  const greeting = greet.fn(ctx, { repeatText: '再会' })
  setNearestUser(ctx, 'second-session', 'Second Visitor')
  completeEmote?.('played')

  assert.equal(await greeting, 'SUCCESS')
  assert.deepEqual(spoken, ['はじめまして、First Visitorさん！'])
  assert.deepEqual(ctx.bb.get('greetedUserIds'), ['first-session'])
})

test('greet_userは上位行動に割り込まれたら演出後の挨拶を中止する', async () => {
  const { ctx, spoken } = createGreetingContext()
  const greet = getAction('greet_user')
  assert.ok(greet)
  let completeEmote: ((result: 'played') => void) | undefined
  ctx.api.emote = () =>
    new Promise<'played'>((resolve) => {
      completeEmote = resolve
    })
  const controller = new AbortController()
  ctx.signal = controller.signal
  setNearestUser(ctx, 'visitor-session', 'Visitor')

  const greeting = greet.fn(ctx, { repeatText: '再会' })
  controller.abort()
  completeEmote?.('played')

  assert.equal(await greeting, 'FAILURE')
  assert.deepEqual(spoken, [])
  assert.equal(ctx.bb.get('greetedUserIds'), undefined)
})

test('greet_userは送信完了と同時に割り込まれても挨拶済みとして記憶する', async () => {
  const { ctx, spoken } = createGreetingContext()
  const greet = getAction('greet_user')
  assert.ok(greet)
  const controller = new AbortController()
  ctx.signal = controller.signal
  ctx.api.say = async (text) => {
    spoken.push(text)
    controller.abort()
    return true
  }
  setNearestUser(ctx, 'visitor-session', 'Visitor')

  assert.equal(await greet.fn(ctx, { repeatText: '再会' }), 'SUCCESS')
  assert.deepEqual(spoken, ['はじめまして、Visitorさん！'])
  assert.deepEqual(ctx.bb.get('greetedUserIds'), ['visitor-session'])
})
