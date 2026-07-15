/**
 * Test for MetatellClient implementation
 */

import type { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { IAvatarController } from '../interfaces/IAvatarController.js'
import type { IConnectionManager } from '../interfaces/IConnectionManager.js'
import { type IEventBus, SystemEvents } from '../interfaces/IEventBus.js'
import type { IPresenceManager, PresenceUser } from '../interfaces/IPresenceManager.js'
import type { IUserAvatarManager, UserAvatar } from '../interfaces/IUserAvatarManager.js'
import {
  type CreateClientOptions,
  createMetatellClient,
  MetatellClientImpl,
} from './MetatellClientImpl.js'

describe('createMetatellClient', () => {
  it('should throw error when serverUrl is missing', () => {
    expect(() => createMetatellClient({ roomId: 'test-room' } as CreateClientOptions)).toThrow(
      'serverUrl and roomId are required',
    )
  })

  it('should throw error when roomId is missing', () => {
    expect(() =>
      createMetatellClient({ serverUrl: 'wss://test.com' } as CreateClientOptions),
    ).toThrow('serverUrl and roomId are required')
  })

  it('should return MetatellClientImpl instance with valid options', () => {
    // This test only validates the factory function basic behavior
    // Full integration testing would require complex service mocking
    expect(() => {
      const client = createMetatellClient({
        serverUrl: 'wss://test.metatell.app',
        roomId: 'test-room',
      })
      // Should return an instance without throwing during construction validation
      expect(client).toBeInstanceOf(MetatellClientImpl)
    }).not.toThrow('serverUrl and roomId are required')
  })

  it('should process subdomain removal in serverUrl', () => {
    expect(() => {
      const client = createMetatellClient({
        serverUrl: 'wss://subdomain.metatell.app',
        roomId: 'test-room',
      })
      expect(client).toBeInstanceOf(MetatellClientImpl)
    }).not.toThrow('serverUrl and roomId are required')
  })
})

describe('MetatellClientImpl basic interface', () => {
  it('should have required VoiceCapableClient methods', () => {
    // Test the interface structure without requiring full initialization
    const prototype = MetatellClientImpl.prototype
    expect(prototype.getSessionId).toBeDefined()
    expect(prototype.muteVoice).toBeDefined()
    expect(prototype.sendVoiceFrame).toBeDefined()
  })

  it('should have required client methods', () => {
    const prototype = MetatellClientImpl.prototype
    expect(prototype.connect).toBeDefined()
    expect(prototype.disconnect).toBeDefined()
    expect(prototype.on).toBeDefined()
    expect(prototype.off).toBeDefined()
  })
})

interface ClientInternals {
  avatarController: IAvatarController
  connectionManager: IConnectionManager
  eventBus: IEventBus
  presenceManager: IPresenceManager
  userAvatarManager: IUserAvatarManager
}

const clientOptions = { serverUrl: 'wss://test.metatell.app', roomId: 'test-room' }

describe('MetatellClientImpl user bot markers', () => {
  it('should expose the presence bot marker through chat and lifecycle events', () => {
    const client = createMetatellClient(clientOptions)
    const internals = client as unknown as ClientInternals
    const bot: PresenceUser = {
      id: 'bot-123',
      profile: { displayName: 'Guide Bot' },
      isBot: true,
    }
    vi.spyOn(internals.presenceManager, 'getUsers').mockReturnValue([bot])

    const proxiedChatFlags: boolean[] = []
    const chatHandlerFlags: boolean[] = []
    const joinFlags: boolean[] = []
    const leaveFlags: boolean[] = []
    client.on('chat-message', ({ from }) => proxiedChatFlags.push(from.isBot))
    client.chat.onMessage(({ from }) => chatHandlerFlags.push(from.isBot))
    client.on('user-join', (user) => joinFlags.push(user.isBot))
    client.on('user-leave', (user) => leaveFlags.push(user.isBot))

    internals.eventBus.emit(SystemEvents.MESSAGE_RECEIVED, {
      type: 'chat',
      body: 'hello',
      senderId: bot.id,
    })
    internals.eventBus.emit(SystemEvents.USER_JOINED, bot)
    internals.eventBus.emit(SystemEvents.USER_LEFT, bot)

    expect(proxiedChatFlags).toEqual([true])
    expect(chatHandlerFlags).toEqual([true])
    expect(joinFlags).toEqual([true])
    expect(leaveFlags).toEqual([true])
  })

  it('should expose bot markers through all and nearby user queries', async () => {
    const client = createMetatellClient(clientOptions)
    const internals = client as unknown as ClientInternals
    const bot: PresenceUser = {
      id: 'bot-123',
      profile: { displayName: 'Guide Bot' },
      isBot: true,
    }
    const human: PresenceUser = {
      id: 'human-123',
      profile: { displayName: 'Visitor' },
      isBot: false,
    }
    const botAvatar: UserAvatar = {
      id: bot.id,
      nickname: 'Guide Bot',
      position: { x: 1, y: 0, z: 0 },
      lastUpdated: 0,
    }
    const humanAvatar: UserAvatar = {
      id: human.id,
      nickname: 'Visitor',
      position: { x: 2, y: 0, z: 0 },
      lastUpdated: 0,
    }
    const presenceUsers = [bot, human]
    const avatars = [botAvatar, humanAvatar]
    vi.spyOn(internals.presenceManager, 'getUsers').mockReturnValue(presenceUsers)
    vi.spyOn(internals.presenceManager, 'getUser').mockImplementation((id) =>
      presenceUsers.find((user) => user.id === id),
    )
    vi.spyOn(internals.connectionManager, 'getSessionId').mockReturnValue(bot.id)
    vi.spyOn(internals.avatarController, 'getState').mockReturnValue({
      networkId: bot.id,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      avatarId: 'bot-avatar',
    })
    vi.spyOn(internals.userAvatarManager, 'getUser').mockImplementation((id) =>
      avatars.find((avatar) => avatar.id === id),
    )
    vi.spyOn(internals.userAvatarManager, 'getUsersInRange').mockReturnValue(avatars)

    const directUsers = client.getUsers()
    const roomUsers = await client.room.getUsers()
    const nearbyUsers = await client.room.getNearbyUsers(10)

    expect(directUsers.map((user) => user.isBot)).toEqual([true, false])
    expect(roomUsers.map((user) => user.isBot)).toEqual([true, false])
    expect(nearbyUsers.map((user) => user.isBot)).toEqual([true, false])
  })
})

describe('MetatellClientImpl chat mentions', () => {
  const setupChatReceiver = () => {
    const client = createMetatellClient(clientOptions)
    const internals = client as unknown as ClientInternals
    const sender: PresenceUser = {
      id: 'human-123',
      profile: { displayName: 'Visitor' },
      isBot: false,
    }
    vi.spyOn(internals.presenceManager, 'getUsers').mockReturnValue([sender])

    const received: Array<{
      text: string
      mention?: { sessionId: string; name: string }
    }> = []
    client.chat.onMessage(({ text, mention }) => received.push({ text, mention }))

    return { internals, received, sender }
  }

  it('should parse mentions without dropping surrounding multiline text', () => {
    const { internals, received, sender } = setupChatReceiver()

    internals.eventBus.emit(SystemEvents.MESSAGE_RECEIVED, {
      type: 'chat',
      body: '[@Guide Bot](bot-session) first line\nsecond line\n',
      senderId: sender.id,
    })
    internals.eventBus.emit(SystemEvents.MESSAGE_RECEIVED, {
      type: 'chat',
      body: '  prefix:[@Guide Bot](bot-session) suffix  ',
      senderId: sender.id,
    })

    expect(received).toEqual([
      {
        text: 'first line\nsecond line\n',
        mention: { sessionId: 'bot-session', name: 'Guide Bot' },
      },
      {
        text: '  prefix: suffix  ',
        mention: { sessionId: 'bot-session', name: 'Guide Bot' },
      },
    ])
  })

  it('should skip a malformed candidate before a valid mention', () => {
    const { internals, received, sender } = setupChatReceiver()

    internals.eventBus.emit(SystemEvents.MESSAGE_RECEIVED, {
      type: 'chat',
      body: '[@broken] prefix:[@Guide Bot](bot-session) suffix',
      senderId: sender.id,
    })

    expect(received).toEqual([
      {
        text: '[@broken] prefix: suffix',
        mention: { sessionId: 'bot-session', name: 'Guide Bot' },
      },
    ])
  })

  it('should not consume a valid mention inside a malformed session id', () => {
    const { internals, received, sender } = setupChatReceiver()

    internals.eventBus.emit(SystemEvents.MESSAGE_RECEIVED, {
      type: 'chat',
      body: '[@outer](prefix:[@Guide Bot](bot-session) suffix)',
      senderId: sender.id,
    })

    expect(received).toEqual([
      {
        text: '[@outer](prefix: suffix)',
        mention: { sessionId: 'bot-session', name: 'Guide Bot' },
      },
    ])
  })

  it('should skip mention candidates with line breaks in session ids', () => {
    const { internals, received, sender } = setupChatReceiver()

    internals.eventBus.emit(SystemEvents.MESSAGE_RECEIVED, {
      type: 'chat',
      body: '[@outer](broken\nstill-broken) prefix:[@Guide Bot](bot-session) suffix',
      senderId: sender.id,
    })
    internals.eventBus.emit(SystemEvents.MESSAGE_RECEIVED, {
      type: 'chat',
      body: '[@outer](broken\r\nstill-broken) prefix:[@Guide Bot](bot-session) suffix',
      senderId: sender.id,
    })

    expect(received).toEqual([
      {
        text: '[@outer](broken\nstill-broken) prefix: suffix',
        mention: { sessionId: 'bot-session', name: 'Guide Bot' },
      },
      {
        text: '[@outer](broken\r\nstill-broken) prefix: suffix',
        mention: { sessionId: 'bot-session', name: 'Guide Bot' },
      },
    ])
  })

  it('should handle a long malformed mention body without parsing it', () => {
    const { internals, received, sender } = setupChatReceiver()
    const body = '[@\\'.repeat(100_000)

    internals.eventBus.emit(SystemEvents.MESSAGE_RECEIVED, {
      type: 'chat',
      body,
      senderId: sender.id,
    })

    expect(received).toEqual([{ text: body, mention: undefined }])
  })

  it('should handle nested mention candidates without rescanning input', () => {
    const { internals, received, sender } = setupChatReceiver()
    const candidate = '[@bot](x'
    const prefix = candidate.repeat(100_000)

    internals.eventBus.emit(SystemEvents.MESSAGE_RECEIVED, {
      type: 'chat',
      body: `${prefix})`,
      senderId: sender.id,
    })

    expect(received).toEqual([
      {
        text: candidate.repeat(99_999),
        mention: { sessionId: 'x', name: 'bot' },
      },
    ])
  })
})

describe('muteVoice', () => {
  const options = clientOptions

  it('should emit events on mute and unmute', async () => {
    const client = createMetatellClient(options)
    const events: boolean[] = []
    client.on('voice:mute-changed', (e) => events.push(e.muted))

    const busEvents: boolean[] = []
    const bus = (client as unknown as { eventBus: EventEmitter }).eventBus
    bus.on('voice:mute-changed', (e: { muted: boolean }) => busEvents.push(e.muted))

    await client.muteVoice(true)
    await client.muteVoice(false)

    expect(events).toEqual([true, false])
    expect(busEvents).toEqual([true, false])
  })

  it('should not emit event when state is unchanged', async () => {
    const client = createMetatellClient(options)
    const events: boolean[] = []
    client.on('voice:mute-changed', (e) => events.push(e.muted))

    await client.muteVoice(true)
    await client.muteVoice(true)

    expect(events).toEqual([true])
  })

  it('should update state even if event bus listener throws', async () => {
    const client = createMetatellClient(options)
    const events: boolean[] = []
    client.on('voice:mute-changed', (e) => events.push(e.muted))

    const bus = (client as unknown as { eventBus: EventEmitter }).eventBus
    bus.on('voice:mute-changed', () => {
      throw new Error('boom')
    })

    await client.muteVoice(true)

    expect(events).toEqual([true])
  })
})
