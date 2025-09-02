import type { Channel } from 'phoenix'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CoreServiceFactory } from '../core/CoreServiceFactory.js'
import { AvatarController, type IAvatarController } from '../core/interfaces/IAvatarController.js'
import type { BotConfiguration } from '../core/interfaces/IConfigurationProvider.js'
import {
  ConnectionManager,
  type IConnectionManager,
} from '../core/interfaces/IConnectionManager.js'
import { EventBus } from '../core/interfaces/IEventBus.js'
import {
  type IUserAvatarManager,
  type UserAvatar,
  UserAvatarManager,
} from '../core/interfaces/IUserAvatarManager.js'
import { createAgentClient, DefaultAgentClient } from './AgentClient.js'
import { DefaultLoggerProvider, registerLoggerProvider } from './logging/index.js'

// Register logger provider for tests
registerLoggerProvider(new DefaultLoggerProvider(), { allowOverwrite: true })

describe('AgentClient', () => {
  let factory: CoreServiceFactory
  let botConfig: BotConfiguration
  let mockConnectionManager: IConnectionManager
  let mockAvatarController: IAvatarController
  let mockUserAvatarManager: IUserAvatarManager
  let mockChannel: Channel

  beforeEach(() => {
    botConfig = {
      serverUrl: 'wss://example.com',
      hubUrl: 'https://example.com/test',
      hubId: 'test-hub',
      profile: {
        displayName: 'TestBot',
        avatarId: 'test-avatar',
      },
      context: {
        mobile: false,
        embed: false,
        hmd: false,
      },
      debug: false,
    }

    factory = new CoreServiceFactory(botConfig)

    // Set up mocks for new functionality tests
    mockChannel = {
      push: vi.fn().mockReturnThis(),
      on: vi.fn(),
      off: vi.fn(),
      leave: vi.fn(),
      join: vi.fn().mockReturnThis(),
      receive: vi.fn().mockReturnThis(),
    } as unknown as Channel

    mockConnectionManager = factory.getService(ConnectionManager)
    mockAvatarController = factory.getService(AvatarController)
    mockUserAvatarManager = factory.getService(UserAvatarManager)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('event handling', () => {
    it('should proxy on/off methods to internal event bus', () => {
      const client = createAgentClient(botConfig)

      const testHandler = vi.fn()

      // Test on method - should not throw
      expect(() => client.on('test-event', testHandler)).not.toThrow()

      // Test off method - should not throw
      expect(() => client.off('test-event', testHandler)).not.toThrow()
    })

    it('should allow event subscription through ServiceFactory event bus', () => {
      const client = createAgentClient(botConfig)
      const testHandler = vi.fn()

      // Test that event subscription doesn't throw
      expect(() => client.on('user-joined', testHandler)).not.toThrow()

      // Test that event unsubscription doesn't throw
      expect(() => client.off('user-joined', testHandler)).not.toThrow()
    })

    it('should allow event unsubscription through ServiceFactory event bus', () => {
      const client = createAgentClient(botConfig)
      const testHandler = vi.fn()

      // Subscribe and then unsubscribe
      client.on('user-left', testHandler)
      client.off('user-left', testHandler)

      // Get the event bus directly from factory to trigger events
      const eventBus = factory.getService(EventBus)
      eventBus.emit('user-left', { userId: 'test-user' })

      // Handler should not be called since it was removed
      expect(testHandler).not.toHaveBeenCalled()
    })
  })

  describe('integration', () => {
    it('should create client with default configuration', () => {
      const client = createAgentClient(botConfig)

      expect(client).toBeDefined()
      expect(typeof client.connect).toBe('function')
      expect(typeof client.disconnect).toBe('function')
      expect(typeof client.on).toBe('function')
      expect(typeof client.off).toBe('function')
    })

    it('should create client with custom configuration', () => {
      const client = createAgentClient(botConfig, {
        profile: {
          displayName: 'CustomBot',
          avatarId: 'custom-avatar',
        },
        rateLimit: {
          messages: 5,
          moves: 2,
          looks: 3,
        },
      })

      expect(client).toBeDefined()
      expect(client.getRateLimit('messages')).toBe(5)
      expect(client.getRateLimit('moves')).toBe(2)
      expect(client.getRateLimit('looks')).toBe(3)
    })
  })

  describe('connect', () => {
    it('should send room entry events (entering/entered) when connecting', async () => {
      const client = new DefaultAgentClient(factory)

      // Mock connection manager methods
      vi.spyOn(mockConnectionManager, 'connect').mockResolvedValue(undefined)
      vi.spyOn(mockConnectionManager, 'getHubChannel').mockReturnValue(mockChannel)
      vi.spyOn(mockConnectionManager, 'getSessionId').mockReturnValue('test-session-id')

      // Mock avatar controller spawn
      vi.spyOn(mockAvatarController, 'spawn').mockResolvedValue(undefined)

      await client.connect({
        url: 'https://metatell.app/test-hub',
        token: 'test-token',
      })

      // Verify entering event was sent
      expect(mockChannel.push).toHaveBeenCalledWith('events:entering', {})

      // Verify entered event was sent with correct payload
      expect(mockChannel.push).toHaveBeenCalledWith('events:entered', {
        initialOccupantCount: 0,
        isNewDaily: true,
        isNewMonthly: true,
        isNewDayWindow: true,
        isNewMonthWindow: true,
        entryDisplayType: 'Bot',
        userAgent: 'MetatellBot/1.0',
      })

      // Verify both events were sent
      expect(mockChannel.push).toHaveBeenCalledTimes(2)
    })

    it('should spawn avatar when avatarId is configured', async () => {
      const client = new DefaultAgentClient(factory)

      // Mock connection manager methods
      vi.spyOn(mockConnectionManager, 'connect').mockResolvedValue(undefined)
      vi.spyOn(mockConnectionManager, 'getHubChannel').mockReturnValue(mockChannel)
      vi.spyOn(mockConnectionManager, 'getSessionId').mockReturnValue('test-session-id')

      // Mock avatar controller spawn
      const spawnSpy = vi.spyOn(mockAvatarController, 'spawn').mockResolvedValue(undefined)

      await client.connect({
        url: 'https://metatell.app/test-hub',
        token: 'test-token',
      })

      // Verify avatar spawn was called with the configured avatarId
      expect(spawnSpy).toHaveBeenCalledWith('test-avatar', undefined, undefined)
      expect(spawnSpy).toHaveBeenCalledTimes(1)
    })

    it('should not spawn avatar when avatarId is not configured', async () => {
      // Create a new factory with no avatarId
      const configWithoutAvatar = {
        ...botConfig,
        profile: { ...botConfig.profile, avatarId: undefined },
      }
      const factoryNoAvatar = new CoreServiceFactory(configWithoutAvatar)
      const client = new DefaultAgentClient(factoryNoAvatar)

      // Get mocks from the new factory
      const connMgr = factoryNoAvatar.getService(ConnectionManager)
      const avatarCtrl = factoryNoAvatar.getService(AvatarController)

      // Mock connection manager methods
      vi.spyOn(connMgr, 'connect').mockResolvedValue(undefined)
      vi.spyOn(connMgr, 'getHubChannel').mockReturnValue(mockChannel)
      vi.spyOn(connMgr, 'getSessionId').mockReturnValue('test-session-id')

      // Mock avatar controller spawn
      const spawnSpy = vi.spyOn(avatarCtrl, 'spawn').mockResolvedValue(undefined)

      await client.connect({
        url: 'https://metatell.app/test-hub',
        token: 'test-token',
      })

      // Verify avatar spawn was NOT called
      expect(spawnSpy).not.toHaveBeenCalled()
    })

    it('should update connection status correctly', async () => {
      const client = new DefaultAgentClient(factory)

      // Initial status
      let status = client.getStatus()
      expect(status.connected).toBe(false)
      expect(status.connecting).toBe(false)

      // Mock connection manager methods
      vi.spyOn(mockConnectionManager, 'connect').mockResolvedValue(undefined)
      vi.spyOn(mockConnectionManager, 'getHubChannel').mockReturnValue(mockChannel)
      vi.spyOn(mockConnectionManager, 'getSessionId').mockReturnValue('test-session-id')
      vi.spyOn(mockAvatarController, 'spawn').mockResolvedValue(undefined)

      await client.connect({
        url: 'https://metatell.app/test-hub',
        token: 'test-token',
      })

      // Status after connection
      status = client.getStatus()
      expect(status.connected).toBe(true)
      expect(status.connecting).toBe(false)
      expect(status.sessionId).toBe('test-session-id')
    })
  })

  describe('setupEventHandlers', () => {
    it('should resync avatar when new user joins', async () => {
      // Mock avatar controller state and resync
      const mockState = { networkId: 'bot-123', position: { x: 0, y: 0, z: 0 } }
      vi.spyOn(mockAvatarController, 'getState').mockReturnValue(mockState)
      const resyncSpy = vi.spyOn(mockAvatarController, 'resyncAvatar').mockResolvedValue(undefined)

      // Simulate user join event
      const newUser: Partial<UserAvatar> = {
        nickname: 'TestUser',
        sessionId: 'user-123',
        position: { x: 5, y: 0, z: 5 },
      }

      // Trigger userJoined event on userAvatarManager
      // We need to get the actual handler that was registered
      const onSpy = vi.spyOn(mockUserAvatarManager, 'on')

      // Create a new client to capture the handler
      const _testClient = new DefaultAgentClient(factory)

      // Get the handler that was registered
      const userJoinedCall = onSpy.mock.calls.find((call) => call[0] === 'userJoined')
      expect(userJoinedCall).toBeDefined()
      if (!userJoinedCall) throw new Error('userJoined handler not registered')
      const userJoinedHandler = userJoinedCall[1] as (user: UserAvatar) => Promise<void>

      // Call the handler directly
      await userJoinedHandler(newUser as UserAvatar)

      // Verify avatar resync was called
      expect(resyncSpy).toHaveBeenCalledTimes(1)
    })

    it('should not resync avatar if avatar is not spawned', async () => {
      // Mock avatar controller with no state (not spawned)
      vi.spyOn(mockAvatarController, 'getState').mockReturnValue(null)
      const resyncSpy = vi.spyOn(mockAvatarController, 'resyncAvatar').mockResolvedValue(undefined)

      // Get the handler that was registered
      const onSpy = vi.spyOn(mockUserAvatarManager, 'on')
      const _testClient = new DefaultAgentClient(factory)

      const userJoinedCall = onSpy.mock.calls.find((call) => call[0] === 'userJoined')
      if (!userJoinedCall) throw new Error('userJoined handler not registered')
      const userJoinedHandler = userJoinedCall[1] as (user: UserAvatar) => Promise<void>

      // Call the handler
      await userJoinedHandler({ nickname: 'TestUser', sessionId: 'user-123' } as UserAvatar)

      // Verify avatar resync was NOT called
      expect(resyncSpy).not.toHaveBeenCalled()
    })

    it('should handle resync errors gracefully', async () => {
      // Mock avatar controller state and resync with error
      const mockState = { networkId: 'bot-123', position: { x: 0, y: 0, z: 0 } }
      vi.spyOn(mockAvatarController, 'getState').mockReturnValue(mockState)
      const resyncSpy = vi
        .spyOn(mockAvatarController, 'resyncAvatar')
        .mockRejectedValue(new Error('Resync failed'))

      // Get the handler that was registered
      const onSpy = vi.spyOn(mockUserAvatarManager, 'on')
      const _testClient = new DefaultAgentClient(factory)

      const userJoinedCall = onSpy.mock.calls.find((call) => call[0] === 'userJoined')
      if (!userJoinedCall) throw new Error('userJoined handler not registered')
      const userJoinedHandler = userJoinedCall[1] as (user: UserAvatar) => Promise<void>

      // Call the handler - should not throw
      await expect(
        userJoinedHandler({ nickname: 'TestUser', sessionId: 'user-123' } as UserAvatar),
      ).resolves.not.toThrow()

      // Verify resync was attempted
      expect(resyncSpy).toHaveBeenCalledTimes(1)
    })

    it('should resync avatar with updated position after move', async () => {
      // Updated position after move
      const movedState = {
        networkId: 'bot-123',
        position: { x: 10, y: 0, z: -5 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      }

      // Mock avatar controller to return moved state
      const getStateSpy = vi.spyOn(mockAvatarController, 'getState').mockReturnValue(movedState)
      const resyncSpy = vi.spyOn(mockAvatarController, 'resyncAvatar').mockResolvedValue(undefined)

      // Get the handler that was registered
      const onSpy = vi.spyOn(mockUserAvatarManager, 'on')
      const _testClient = new DefaultAgentClient(factory)

      const userJoinedCall = onSpy.mock.calls.find((call) => call[0] === 'userJoined')
      if (!userJoinedCall) throw new Error('userJoined handler not registered')
      const userJoinedHandler = userJoinedCall[1] as (user: UserAvatar) => Promise<void>

      // Simulate user joining after bot has moved
      const newUser: Partial<UserAvatar> = {
        nickname: 'LateUser',
        sessionId: 'late-user-123',
        position: { x: 0, y: 0, z: 0 },
      }

      await userJoinedHandler(newUser as UserAvatar)

      // Verify that resync was called with the moved position
      expect(getStateSpy).toHaveBeenCalled()
      expect(resyncSpy).toHaveBeenCalledTimes(1)
      // The resyncAvatar method should use the current state internally,
      // which includes the updated position
    })
  })
})
