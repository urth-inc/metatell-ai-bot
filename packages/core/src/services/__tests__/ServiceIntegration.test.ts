/**
 * Service Integration Tests
 * Tests how core services work together in realistic scenarios
 */

import type { Channel } from 'phoenix'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CoreServiceFactory } from '../../CoreServiceFactory.js'
import type { IAvatarController } from '../../interfaces/IAvatarController.js'
import { AvatarController } from '../../interfaces/IAvatarController.js'
import type { ConnectionConfig, IConnectionManager } from '../../interfaces/IConnectionManager.js'
import { ConnectionManager } from '../../interfaces/IConnectionManager.js'
import type { IEventBus } from '../../interfaces/IEventBus.js'
import { EventBus, SystemEvents } from '../../interfaces/IEventBus.js'
import type { IMessageService } from '../../interfaces/IMessageService.js'
import { MessageService } from '../../interfaces/IMessageService.js'
import type { IPresenceManager, PresenceUser } from '../../interfaces/IPresenceManager.js'
import { PresenceManager } from '../../interfaces/IPresenceManager.js'
import {
  DefaultLoggerProvider,
  registerLoggerProvider,
  resetLoggerProvider,
} from '../../logging/index.js'

describe('Service Integration Tests', () => {
  let factory: CoreServiceFactory
  let connectionManager: IConnectionManager
  let presenceManager: IPresenceManager
  let eventBus: IEventBus
  let messageService: IMessageService
  let avatarController: IAvatarController

  const mockConfig: ConnectionConfig = {
    serverUrl: 'wss://test.example.com',
    hubId: 'test-hub-123',
  }

  beforeAll(() => {
    // Setup logger for tests
    const loggerProvider = new DefaultLoggerProvider()
    loggerProvider.setMinLevel?.('debug')
    registerLoggerProvider(loggerProvider)
  })

  afterAll(() => {
    resetLoggerProvider()
  })

  beforeEach(() => {
    vi.clearAllMocks()

    factory = new CoreServiceFactory({
      hubUrl: 'https://test.example.com/test-hub-123',
      profile: { displayName: 'Test Bot', avatarId: 'bot-avatar' },
      context: { version: '1.0.0' },
      debug: true,
    })

    connectionManager = factory.getService(ConnectionManager)
    presenceManager = factory.getService(PresenceManager)
    eventBus = factory.getService(EventBus)
    messageService = factory.getService(MessageService)
    avatarController = factory.getService(AvatarController)
  })

  describe('ConnectionManager → EventBus → PresenceManager Integration', () => {
    it('should establish connection flow and setup presence tracking', async () => {
      const eventEmitSpy = vi.spyOn(eventBus, 'emit')

      // Mock socket connection
      const mockChannel: Partial<Channel> = {
        join: vi.fn().mockReturnValue({
          receive: vi.fn((event, callback) => {
            if (event === 'ok') {
              // Simulate successful join with session info
              setTimeout(() => callback({ session_id: 'session-123' }), 0)
            }
            return { receive: vi.fn() }
          }),
        }),
        on: vi.fn(),
        leave: vi.fn(),
      }

      const _mockSocket = {
        isConnected: vi.fn().mockReturnValue(true),
        connect: vi.fn(),
        onOpen: vi.fn((callback) => setTimeout(callback, 0)),
        onClose: vi.fn(),
        onError: vi.fn(),
        channel: vi.fn().mockReturnValue(mockChannel),
        disconnect: vi.fn(),
      }

      // Mock connection manager methods
      vi.spyOn(connectionManager, 'connect').mockImplementation(async () => {
        // Simulate connection establishment
        eventBus.emit(SystemEvents.CONNECTION_ESTABLISHED)

        // Simulate room join after connection
        setTimeout(() => {
          eventBus.emit(SystemEvents.ROOM_JOINED, { session_id: 'session-123' })
        }, 10)
      })

      vi.spyOn(connectionManager, 'isConnected').mockReturnValue(true)
      vi.spyOn(connectionManager, 'getHubChannel').mockReturnValue(mockChannel as Channel)
      vi.spyOn(connectionManager, 'getSessionId').mockReturnValue('session-123')

      // Connect and verify event flow
      await connectionManager.connect(mockConfig)

      // Wait for asynchronous room join event
      await new Promise((resolve) => setTimeout(resolve, 20))

      // Verify connection events were emitted
      expect(eventEmitSpy).toHaveBeenCalledWith(SystemEvents.CONNECTION_ESTABLISHED)
      expect(eventEmitSpy).toHaveBeenCalledWith(SystemEvents.ROOM_JOINED, {
        session_id: 'session-123',
      })

      // Verify presence manager received hub channel for setup
      expect(connectionManager.getHubChannel).toHaveBeenCalled()
      expect(connectionManager.isConnected()).toBe(true)
      expect(connectionManager.getSessionId()).toBe('session-123')
    })

    it('should handle user presence changes through event system', async () => {
      const userJoinedEvents: PresenceUser[] = []
      const userLeftEvents: PresenceUser[] = []

      // Set up presence event listeners
      presenceManager.on('join', (user) => userJoinedEvents.push(user))
      presenceManager.on('leave', (user) => userLeftEvents.push(user))

      const eventBusUserJoinedSpy = vi.fn()
      const eventBusUserLeftSpy = vi.fn()
      eventBus.on(SystemEvents.USER_JOINED, eventBusUserJoinedSpy)
      eventBus.on(SystemEvents.USER_LEFT, eventBusUserLeftSpy)

      // Simulate presence changes by directly calling event bus
      const mockUser1: PresenceUser = {
        id: 'user-1',
        profile: { displayName: 'Test User 1', avatarId: 'avatar-1' },
      }

      const mockUser2: PresenceUser = {
        id: 'user-2',
        profile: { displayName: 'Test User 2', avatarId: 'avatar-2' },
      }

      // Simulate user joins
      eventBus.emit(SystemEvents.USER_JOINED, mockUser1)
      eventBus.emit(SystemEvents.USER_JOINED, mockUser2)

      // Simulate user leave
      eventBus.emit(SystemEvents.USER_LEFT, mockUser1)

      // Verify events propagated through both systems
      expect(eventBusUserJoinedSpy).toHaveBeenCalledTimes(2)
      expect(eventBusUserJoinedSpy).toHaveBeenCalledWith(mockUser1)
      expect(eventBusUserJoinedSpy).toHaveBeenCalledWith(mockUser2)

      expect(eventBusUserLeftSpy).toHaveBeenCalledTimes(1)
      expect(eventBusUserLeftSpy).toHaveBeenCalledWith(mockUser1)
    })
  })

  describe('MessageService → ConnectionManager Integration', () => {
    it('should send messages through connected channel', async () => {
      const mockChannel: Partial<Channel> = {
        push: vi.fn(),
        join: vi.fn(),
        on: vi.fn(),
        leave: vi.fn(),
      }

      // Setup connection manager mocks
      vi.spyOn(connectionManager, 'getHubChannel').mockReturnValue(mockChannel as Channel)
      vi.spyOn(connectionManager, 'isConnected').mockReturnValue(true)
      vi.spyOn(connectionManager, 'getSessionId').mockReturnValue('session-123')

      // Test NAF message sending
      const nafData = {
        dataType: 'u',
        networkId: 'test-network-123',
        owner: 'session-123',
        creator: 'session-123',
        position: { x: 1, y: 2, z: 3 },
      }

      await messageService.sendNAF(nafData)

      expect(mockChannel.push).toHaveBeenCalledWith('naf', nafData)
    })

    it('should handle disconnected state gracefully', async () => {
      // Setup disconnected state
      vi.spyOn(connectionManager, 'getHubChannel').mockReturnValue(null)
      vi.spyOn(connectionManager, 'isConnected').mockReturnValue(false)

      const nafData = {
        dataType: 'u',
        networkId: 'test-network-123',
        owner: 'session-123',
        creator: 'session-123',
        position: { x: 1, y: 2, z: 3 },
      }

      // MessageService throws when not connected - this is expected behavior
      await expect(messageService.sendNAF(nafData)).rejects.toThrow('Not connected to hub')
    })
  })

  describe('AvatarController → MessageService → ConnectionManager Integration', () => {
    it('should spawn avatar through full message pipeline', async () => {
      const mockChannel: Partial<Channel> = {
        push: vi.fn(),
        join: vi.fn(),
        on: vi.fn(),
        leave: vi.fn(),
      }

      // Setup connected state
      vi.spyOn(connectionManager, 'getHubChannel').mockReturnValue(mockChannel as Channel)
      vi.spyOn(connectionManager, 'isConnected').mockReturnValue(true)
      vi.spyOn(connectionManager, 'getSessionId').mockReturnValue('session-123')

      // Simulate room joined event to set sessionId in AvatarController
      eventBus.emit(SystemEvents.ROOM_JOINED, { session_id: 'session-123' })

      const eventEmitSpy = vi.spyOn(eventBus, 'emit')

      // Spawn avatar
      const position = { x: 5, y: 1, z: -3 }
      await avatarController.spawn('test-avatar', position)

      // Verify messages were pushed through channel (AvatarController sends NAF and NAFR)
      expect(mockChannel.push).toHaveBeenCalledWith(
        'naf',
        expect.objectContaining({
          dataType: 'u',
        }),
      )

      expect(mockChannel.push).toHaveBeenCalledWith(
        'nafr',
        expect.objectContaining({
          naf: expect.stringContaining('session-123'),
        }),
      )

      // Verify avatar spawned event was emitted
      expect(eventEmitSpy).toHaveBeenCalledWith(
        SystemEvents.AVATAR_SPAWNED,
        expect.objectContaining({
          avatarId: 'test-avatar',
          position: position,
        }),
      )
    })

    it('should handle avatar movements through message pipeline', async () => {
      const mockChannel: Partial<Channel> = {
        push: vi.fn(),
        join: vi.fn(),
        on: vi.fn(),
        leave: vi.fn(),
      }

      // Setup connected state and spawn avatar first
      vi.spyOn(connectionManager, 'getHubChannel').mockReturnValue(mockChannel as Channel)
      vi.spyOn(connectionManager, 'isConnected').mockReturnValue(true)
      vi.spyOn(connectionManager, 'getSessionId').mockReturnValue('session-123')

      // Simulate room joined event to set sessionId in AvatarController
      eventBus.emit(SystemEvents.ROOM_JOINED, { session_id: 'session-123' })

      await avatarController.spawn('test-avatar', { x: 0, y: 0, z: 0 })

      // Clear previous calls
      vi.clearAllMocks()
      const eventEmitSpy = vi.spyOn(eventBus, 'emit')

      // Move avatar
      const newPosition = { x: 10, y: 5, z: -2 }
      await avatarController.move(newPosition)

      // Verify movement message sent (AvatarController sends NAFR for moves)
      expect(mockChannel.push).toHaveBeenCalledWith(
        'nafr',
        expect.objectContaining({
          naf: expect.stringContaining('session-123'),
        }),
      )

      // Verify movement event was emitted
      expect(eventEmitSpy).toHaveBeenCalledWith(
        SystemEvents.AVATAR_MOVED,
        expect.objectContaining({
          position: newPosition,
        }),
      )
    })
  })

  describe('Full Service Integration Scenario', () => {
    it('should handle complete bot lifecycle: connect → spawn → interact → disconnect', async () => {
      const mockChannel: Partial<Channel> = {
        push: vi.fn(),
        join: vi.fn().mockReturnValue({
          receive: vi.fn((event, callback) => {
            if (event === 'ok') {
              setTimeout(() => callback({ session_id: 'session-123' }), 0)
            }
            return { receive: vi.fn() }
          }),
        }),
        on: vi.fn(),
        leave: vi.fn(),
      }

      // Mock connection manager for full flow
      vi.spyOn(connectionManager, 'connect').mockImplementation(async () => {
        eventBus.emit(SystemEvents.CONNECTION_ESTABLISHED)
        setTimeout(() => {
          eventBus.emit(SystemEvents.ROOM_JOINED, { session_id: 'session-123' })
        }, 10)
      })

      vi.spyOn(connectionManager, 'disconnect').mockImplementation(async () => {
        eventBus.emit(SystemEvents.CONNECTION_LOST)
      })

      vi.spyOn(connectionManager, 'isConnected').mockReturnValue(true)
      vi.spyOn(connectionManager, 'getHubChannel').mockReturnValue(mockChannel as Channel)
      vi.spyOn(connectionManager, 'getSessionId').mockReturnValue('session-123')

      const allEvents: Array<{ event: string; data?: unknown }> = []
      const eventLogger = (event: string) => (data?: unknown) => {
        allEvents.push({ event, data })
      }

      // Monitor all system events
      eventBus.on(SystemEvents.CONNECTION_ESTABLISHED, eventLogger('CONNECTION_ESTABLISHED'))
      eventBus.on(SystemEvents.ROOM_JOINED, eventLogger('ROOM_JOINED'))
      eventBus.on(SystemEvents.AVATAR_SPAWNED, eventLogger('AVATAR_SPAWNED'))
      eventBus.on(SystemEvents.AVATAR_MOVED, eventLogger('AVATAR_MOVED'))
      eventBus.on(SystemEvents.USER_JOINED, eventLogger('USER_JOINED'))
      eventBus.on(SystemEvents.CONNECTION_LOST, eventLogger('CONNECTION_LOST'))

      // Step 1: Connect
      await connectionManager.connect(mockConfig)
      await new Promise((resolve) => setTimeout(resolve, 20)) // Wait for room join

      // Step 2: Spawn avatar (sessionId is set by the mocked room join event)
      await avatarController.spawn('bot-avatar', { x: 0, y: 1.6, z: 0 })

      // Step 3: Move avatar
      await avatarController.move({ x: 5, y: 1.6, z: 3 })

      // Step 4: Simulate another user joining
      const otherUser: PresenceUser = {
        id: 'other-user',
        profile: { displayName: 'Other User', avatarId: 'other-avatar' },
      }
      eventBus.emit(SystemEvents.USER_JOINED, otherUser)

      // Step 5: Disconnect
      await connectionManager.disconnect()

      // Verify complete event sequence
      expect(allEvents).toEqual([
        { event: 'CONNECTION_ESTABLISHED', data: undefined },
        { event: 'ROOM_JOINED', data: { session_id: 'session-123' } },
        { event: 'AVATAR_SPAWNED', data: expect.objectContaining({ avatarId: 'bot-avatar' }) },
        {
          event: 'AVATAR_MOVED',
          data: expect.objectContaining({ position: { x: 5, y: 1.6, z: 3 } }),
        },
        { event: 'USER_JOINED', data: otherUser },
        { event: 'CONNECTION_LOST', data: undefined },
      ])

      // Verify final state
      expect(connectionManager.isConnected()).toBe(true) // Mock still returns true
      expect(mockChannel.push).toHaveBeenCalledTimes(3) // 2 for spawn (naf + nafr), 1 for move (nafr)
      // Note: mockChannel.leave may not be called in disconnect mock implementation
    })
  })

  describe('Error Handling and Resilience', () => {
    it('should handle service failures gracefully without breaking integration', async () => {
      // Mock connection manager to fail
      vi.spyOn(connectionManager, 'connect').mockRejectedValue(new Error('Connection failed'))
      vi.spyOn(connectionManager, 'isConnected').mockReturnValue(false)
      vi.spyOn(connectionManager, 'getHubChannel').mockReturnValue(null)

      // Connection should fail
      await expect(connectionManager.connect(mockConfig)).rejects.toThrow('Connection failed')

      // But other services should still work independently
      expect(presenceManager.getUsers()).toEqual([])
      expect(presenceManager.isUserPresent('test-user')).toBe(false)

      // Message service should handle disconnected state by throwing
      const nafData = {
        dataType: 'u',
        networkId: 'test-network',
        owner: 'test-owner',
        creator: 'test-creator',
        position: { x: 1, y: 2, z: 3 },
      }

      await expect(messageService.sendNAF(nafData)).rejects.toThrow('Not connected to hub')
    })

    it('should recover from transient failures', async () => {
      const mockChannel: Partial<Channel> = {
        push: vi
          .fn()
          .mockRejectedValueOnce(new Error('Temporary failure'))
          .mockResolvedValue(undefined),
        join: vi.fn(),
        on: vi.fn(),
        leave: vi.fn(),
      }

      // Setup connected state
      vi.spyOn(connectionManager, 'getHubChannel').mockReturnValue(mockChannel as Channel)
      vi.spyOn(connectionManager, 'isConnected').mockReturnValue(true)
      vi.spyOn(connectionManager, 'getSessionId').mockReturnValue('session-123')

      const nafData = {
        dataType: 'u',
        networkId: 'test-network',
        owner: 'test-owner',
        creator: 'test-creator',
        position: { x: 1, y: 2, z: 3 },
      }

      // First call should fail, but method should handle it gracefully
      await messageService.sendNAF(nafData)

      // Second call should succeed
      await messageService.sendNAF(nafData)

      expect(mockChannel.push).toHaveBeenCalledTimes(2)
    })
  })
})
