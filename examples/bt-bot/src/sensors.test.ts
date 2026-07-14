import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { MetatellClient, User } from '@metatell/bot-sdk'
import { createBlackboard } from './engine/blackboard.js'
import type { SafeSpeaker } from './safety.js'
import { createSensors } from './sensors.js'

type ChatHandler = Parameters<MetatellClient['chat']['onMessage']>[0]
type ChatEvent = Parameters<ChatHandler>[0]

function createClientFake(
  initialUsers: User[],
  initialSessionId = 'self',
): {
  client: MetatellClient
  emitChat(event: ChatEvent): void
  emitUserJoin(user: User): void
  setSessionId(sessionId: string | null): void
  setUsers(users: User[]): void
} {
  let chatHandler: ChatHandler | undefined
  let userJoinHandler: ((user: User) => void) | undefined
  let sessionId: string | null = initialSessionId
  let users = initialUsers

  const client = {
    avatar: { getPosition: () => ({ x: 0, y: 0, z: 0 }) },
    chat: {
      onMessage(handler: ChatHandler) {
        chatHandler = handler
      },
    },
    getSessionId: () => sessionId,
    getUsers: () => users,
    on(event: string, handler: (user: User) => void) {
      if (event === 'user-join') userJoinHandler = handler
    },
  } as unknown as MetatellClient

  return {
    client,
    emitChat(event) {
      assert.ok(chatHandler, 'chat handler should be registered')
      chatHandler(event)
    },
    emitUserJoin(user) {
      assert.ok(userJoinHandler, 'user-join handler should be registered')
      userJoinHandler(user)
    },
    setSessionId(nextSessionId) {
      sessionId = nextSessionId
    },
    setUsers(nextUsers) {
      users = nextUsers
    },
  }
}

const speaker: SafeSpeaker = {
  async trySend(send) {
    await send()
    return true
  },
}

test('botのチャット・メンション・presenceを知覚から除外する', () => {
  const self: User = { id: 'self', name: 'My Bot', isBot: true }
  const otherBot: User = { id: 'bot-2', name: 'Other Bot', isBot: true }
  const human: User = { id: 'human-1', name: 'Visitor', isBot: false }
  const fake = createClientFake([self, otherBot, human])
  const logs: string[] = []
  const sensors = createSensors({
    client: fake.client,
    botName: self.name,
    allowBotPerception: false,
    operatorSessionIds: [],
    speaker,
    onKill: () => {},
    log: (message) => logs.push(message),
  })
  const mention = { sessionId: self.id, name: self.name }
  const reply = async (): Promise<void> => {}

  fake.emitChat({ from: otherBot, text: 'bot message', mention, reply })
  fake.emitChat({ from: human, text: 'human message', mention, reply })
  fake.emitUserJoin(otherBot)
  fake.emitUserJoin(human)

  const bb = createBlackboard()
  sensors.snapshot(bb, 1_000)

  assert.deepEqual(
    sensors.inbox.recentChat().map((line) => line.text),
    ['human message'],
  )
  assert.equal(sensors.inbox.peekMention()?.fromName, human.name)
  assert.equal(bb.get('userCount'), 1)
  assert.deepEqual(bb.get('users'), [{ name: human.name, x: null, y: null, z: null }])
  assert.deepEqual(logs, [`入室: ${human.name}`])
})

test('ALLOW_BOT_PERCEPTION相当の設定では他botを知覚できる', () => {
  const otherBot: User = { id: 'bot-2', name: 'Other Bot', isBot: true }
  const fake = createClientFake([otherBot])
  const sensors = createSensors({
    client: fake.client,
    botName: 'My Bot',
    allowBotPerception: true,
    operatorSessionIds: [],
    speaker,
    onKill: () => {},
    log: () => {},
  })

  fake.emitChat({
    from: otherBot,
    text: 'supervised bot message',
    reply: async () => {},
  })
  const bb = createBlackboard()
  sensors.snapshot(bb, 1_000)

  assert.deepEqual(
    sensors.inbox.recentChat().map((line) => line.text),
    ['supervised bot message'],
  )
  assert.equal(bb.get('userCount'), 1)
})

test('キルスイッチは表示名ではなく接続session IDで運営を認可する', () => {
  const operator: User = { id: 'operator-id', name: 'Operator', isBot: false }
  const impersonator: User = { id: 'other-id', name: 'Operator', isBot: false }
  const fake = createClientFake([])
  const killedBy: string[] = []
  const logs: string[] = []
  createSensors({
    client: fake.client,
    botName: 'My Bot',
    allowBotPerception: false,
    operatorSessionIds: [operator.id],
    speaker,
    onKill: (name) => killedBy.push(name),
    log: (message) => logs.push(message),
  })

  fake.emitChat({ from: impersonator, text: '/killall', reply: async () => {} })
  fake.emitChat({ from: operator, text: '/killall', reply: async () => {} })

  assert.deepEqual(killedBy, [operator.name])
  assert.ok(logs.some((message) => message.includes('OPERATOR_SESSION_IDS')))
  assert.ok(logs.some((message) => message.includes(impersonator.id)))
})

test('self判定は再接続後のsession IDを動的に参照し、同名の別ユーザーを除外しない', () => {
  const self: User = { id: 'new-self-id', name: 'Shared Name', isBot: true }
  const sameNameUser: User = { id: 'human-id', name: 'Shared Name', isBot: false }
  const fake = createClientFake([], 'old-self-id')
  const killedBy: string[] = []
  createSensors({
    client: fake.client,
    botName: self.name,
    allowBotPerception: false,
    operatorSessionIds: [self.id, sameNameUser.id],
    speaker,
    onKill: (name) => killedBy.push(name),
    log: () => {},
  })

  fake.setSessionId(self.id)
  fake.emitChat({ from: self, text: '/killall', reply: async () => {} })
  fake.emitChat({ from: sameNameUser, text: '/killall', reply: async () => {} })

  assert.deepEqual(killedBy, [sameNameUser.name])
})

test('OPERATOR_SESSION_IDS未設定時はリモートキルを無効にする', () => {
  const human: User = { id: 'human-id', name: 'Visitor', isBot: false }
  const fake = createClientFake([human])
  const killedBy: string[] = []
  createSensors({
    client: fake.client,
    botName: 'My Bot',
    allowBotPerception: false,
    operatorSessionIds: [],
    speaker,
    onKill: (name) => killedBy.push(name),
    log: () => {},
  })

  fake.emitChat({ from: human, text: '/killall', reply: async () => {} })

  assert.deepEqual(killedBy, [])
})

test('Presence同期前のchat senderはhumanと確認できるまでfail-closedで捨てる', () => {
  const human: User = { id: 'human-id', name: 'Visitor', isBot: false }
  const fake = createClientFake([])
  const sensors = createSensors({
    client: fake.client,
    botName: 'My Bot',
    allowBotPerception: false,
    operatorSessionIds: [],
    speaker,
    onKill: () => {},
    log: () => {},
  })
  const event = { from: human, text: 'hello', reply: async (): Promise<void> => {} }

  fake.emitChat(event)
  fake.setUsers([human])
  fake.emitChat(event)

  assert.deepEqual(
    sensors.inbox.recentChat().map((line) => line.text),
    ['hello'],
  )
})

test('メンション先は再接続後のsession IDを動的に参照する', () => {
  const human: User = { id: 'human-id', name: 'Visitor', isBot: false }
  const fake = createClientFake([human], 'old-self-id')
  const sensors = createSensors({
    client: fake.client,
    botName: 'My Bot',
    allowBotPerception: false,
    operatorSessionIds: [],
    speaker,
    onKill: () => {},
    log: () => {},
  })

  fake.setSessionId('new-self-id')
  fake.emitChat({
    from: human,
    text: 'old mention',
    mention: { sessionId: 'old-self-id', name: 'My Bot' },
    reply: async () => {},
  })
  fake.emitChat({
    from: human,
    text: 'new mention',
    mention: { sessionId: 'new-self-id', name: 'My Bot' },
    reply: async () => {},
  })

  assert.equal(sensors.inbox.peekMention()?.text, 'new mention')
})
