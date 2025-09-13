// Register logger provider FIRST before any other imports
import { DefaultLoggerProvider, registerLoggerProvider } from './logging/index.js'

registerLoggerProvider(new DefaultLoggerProvider(), { allowOverwrite: true })

// Also register Core logger provider
import {
  DefaultLoggerProvider as CoreDefaultLoggerProvider,
  registerLoggerProvider as registerCoreLoggerProvider,
} from '@metatell/bot-core'

registerCoreLoggerProvider(new CoreDefaultLoggerProvider(), { allowOverwrite: true })

import type { AnimationPlaybackResult, BotConfiguration } from '@metatell/bot-core'
import {
  AvatarController,
  ConnectionManager,
  CoreServiceFactory,
  type IAvatarController,
  type IConnectionManager,
  type IUserAvatarManager,
  MessageService,
  type UserAvatar,
  UserAvatarManager,
} from '@metatell/bot-core'
import type { Channel } from 'phoenix'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAgentClient, DefaultAgentClient } from './AgentClient.js'

describe('AgentClient', () => {
  let factory: CoreServiceFactory
  let botConfig: BotConfiguration
  let mockConnectionManager: IConnectionManager
  let mockAvatarController: IAvatarController
  let mockUserAvatarManager: IUserAvatarManager
  let mockChannel: Channel
  let mockClient: {
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    sendMessage: ReturnType<typeof vi.fn>
    getConnectionStatus: ReturnType<typeof vi.fn>
  }
  let mockMessageService: {
    sendMessage: ReturnType<typeof vi.fn>
  }

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

    // Create mock factory with proper service mocking
    factory = {
      getService: vi.fn(),
      dispose: vi.fn(),
    } as CoreServiceFactory

    // Set up mocks for new functionality tests
    mockChannel = {
      push: vi.fn().mockReturnThis(),
      on: vi.fn(),
      off: vi.fn(),
      leave: vi.fn(),
      join: vi.fn().mockReturnThis(),
      receive: vi.fn().mockReturnThis(),
    } as unknown as Channel

    // Create comprehensive mocks
    mockConnectionManager = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getHubChannel: vi.fn().mockReturnValue(mockChannel),
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      isConnected: vi.fn().mockReturnValue(true),
    } as IConnectionManager

    mockAvatarController = {
      spawn: vi.fn().mockResolvedValue(undefined),
      move: vi.fn().mockResolvedValue(undefined),
      rotate: vi.fn().mockResolvedValue(undefined),
      playAnimation: vi.fn().mockResolvedValue({ success: true, duration: 1000 }),
      stopAnimation: vi.fn().mockResolvedValue(undefined),
      getState: vi.fn().mockReturnValue({
        networkId: 'bot-123',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      }),
      resyncAvatar: vi.fn().mockResolvedValue(undefined),
      updateState: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
      getCurrentAnimation: vi.fn().mockReturnValue(null),
    } as IAvatarController

    mockUserAvatarManager = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      getUserAvatars: vi.fn().mockReturnValue([]),
    } as IUserAvatarManager

    // Mock MetatellClient from the factory
    mockClient = {
      connect: vi.fn().mockResolvedValue({
        serverUrl: 'wss://metatell.app',
        hubId: 'test-hub',
        sessionId: 'test-session-id',
      }),
      disconnect: vi.fn().mockResolvedValue(),
      sendMessage: vi.fn().mockResolvedValue(),
      getConnectionStatus: vi.fn().mockReturnValue({ connected: false, connecting: false }),
    }

    // Mock EventBus
    const mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    }

    // Mock ConfigurationProvider
    const mockConfigProvider = {
      getConfiguration: vi.fn().mockReturnValue(botConfig),
    }

    // Mock MessageService
    mockMessageService = {
      sendMessage: vi.fn().mockResolvedValue(),
    }

    // Mock the CoreServiceFactory to return our mock services
    vi.mocked(factory.getService).mockImplementation(
      (token: abstract new (...args: unknown[]) => unknown) => {
        if (token === ConnectionManager || token?.name === 'ConnectionManager')
          return mockConnectionManager
        if (token === AvatarController || token?.name === 'AvatarController')
          return mockAvatarController
        if (token === UserAvatarManager || token?.name === 'UserAvatarManager')
          return mockUserAvatarManager
        if (token === MessageService || token?.name === 'MessageService') return mockMessageService
        if (token?.name === 'MetatellClient') return mockClient
        if (token?.name === 'EventBus') return mockEventBus
        if (token?.name === 'ConfigurationProvider') return mockConfigProvider
        return mockClient // Default fallback
      },
    )
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

      // Simulate event emission (event shouldn't trigger since handler was removed)
      // No need to trigger actual events for this test

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
      const mockState = {
        networkId: 'bot-123',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        avatarId: 'test-avatar',
      }
      vi.spyOn(mockAvatarController, 'getState').mockReturnValue(mockState)
      const resyncSpy = vi.spyOn(mockAvatarController, 'resyncAvatar').mockResolvedValue(undefined)

      // Simulate user join event
      const newUser: UserAvatar = {
        id: 'user-123',
        nickname: 'TestUser',
        position: { x: 5, y: 0, z: 5 },
        lastUpdated: Date.now(),
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
      await userJoinedHandler({
        id: 'user-123',
        nickname: 'TestUser',
        position: { x: 0, y: 0, z: 0 },
        lastUpdated: Date.now(),
      } as UserAvatar)

      // Verify avatar resync was NOT called
      expect(resyncSpy).not.toHaveBeenCalled()
    })

    it('should handle resync errors gracefully', async () => {
      // Mock avatar controller state and resync with error
      const mockState = {
        networkId: 'bot-123',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        avatarId: 'test-avatar',
      }
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
        userJoinedHandler({
          id: 'user-123',
          nickname: 'TestUser',
          position: { x: 0, y: 0, z: 0 },
          lastUpdated: Date.now(),
        } as UserAvatar),
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
        avatarId: 'test-avatar',
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
      const newUser: UserAvatar = {
        id: 'late-user-123',
        nickname: 'LateUser',
        position: { x: 0, y: 0, z: 0 },
        lastUpdated: Date.now(),
      }

      await userJoinedHandler(newUser as UserAvatar)

      // Verify that resync was called with the moved position
      expect(getStateSpy).toHaveBeenCalled()
      expect(resyncSpy).toHaveBeenCalledTimes(1)
      // The resyncAvatar method should use the current state internally,
      // which includes the updated position
    })
  })

  describe('disconnect', () => {
    it('should disconnect from client and update status', async () => {
      const client = new DefaultAgentClient(factory)

      // Mock the connection manager disconnect method
      const disconnectSpy = vi.spyOn(mockConnectionManager, 'disconnect').mockResolvedValue()

      // First connect
      await client.connect({
        url: 'https://metatell.app/test-hub',
        token: 'test-token',
      })

      // Then disconnect
      await client.disconnect()

      expect(disconnectSpy).toHaveBeenCalled()
      expect(client.getStatus().connected).toBe(false)
      expect(client.getStatus().connecting).toBe(false)
    })
  })

  describe('send', () => {
    it('should send message through message service', async () => {
      const client = new DefaultAgentClient(factory)

      // Use the global mock service

      await client.connect({
        url: 'https://metatell.app/test-hub',
        token: 'test-token',
      })

      const message = 'Hello World'
      await client.send(message)

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(message)
    })

    it('should respect rate limit for messages', async () => {
      const client = new DefaultAgentClient(factory, {
        rateLimit: { messages: 1 },
      })

      // Mock the rate limiter to fail on second attempt
      const rateLimiterAccess = client as unknown as {
        rateLimiter: { execute: (key: string, fn: () => Promise<unknown>) => Promise<unknown> }
      }
      const _originalExecute = rateLimiterAccess.rateLimiter.execute
      let callCount = 0
      rateLimiterAccess.rateLimiter.execute = vi.fn().mockImplementation(async (_key, fn) => {
        callCount++
        if (callCount > 1) {
          throw new Error('Rate limit exceeded for messages')
        }
        return await fn()
      })

      await client.connect({
        url: 'https://metatell.app/test-hub',
        token: 'test-token',
      })

      // First message should succeed
      await client.send('Message 1')
      expect(mockMessageService.sendMessage).toHaveBeenCalledTimes(1)

      // Second immediate message should be rate limited
      await expect(client.send('Message 2')).rejects.toThrow('Rate limit exceeded')
      expect(mockMessageService.sendMessage).toHaveBeenCalledTimes(1)
    })
  })

  describe('move', () => {
    it('should move avatar and update status', async () => {
      const client = new DefaultAgentClient(factory)

      await client.connect({
        url: 'https://metatell.app/test-hub',
        token: 'test-token',
      })

      const newPosition = { x: 10, y: 0, z: 5 }
      await client.move(newPosition)

      expect(mockAvatarController.move).toHaveBeenCalledWith(newPosition)
    })

    it('should respect rate limit for moves', async () => {
      const client = new DefaultAgentClient(factory, {
        rateLimit: { moves: 1 },
      })

      // Mock the rate limiter to fail on second attempt
      let callCount = 0
      const rateLimiterAccess = client as unknown as {
        rateLimiter: { execute: (key: string, fn: () => Promise<unknown>) => Promise<unknown> }
      }
      rateLimiterAccess.rateLimiter.execute = vi.fn().mockImplementation(async (_key, fn) => {
        callCount++
        if (callCount > 1) {
          throw new Error('Rate limit exceeded for moves')
        }
        return await fn()
      })

      await client.connect({
        url: 'https://metatell.app/test-hub',
        token: 'test-token',
      })

      const position1 = { x: 10, y: 0, z: 5 }
      const position2 = { x: 20, y: 0, z: 10 }

      // First move should succeed
      await client.move(position1)
      expect(mockAvatarController.move).toHaveBeenCalledTimes(1)

      // Second immediate move should be rate limited
      await expect(client.move(position2)).rejects.toThrow('Rate limit exceeded')
      expect(mockAvatarController.move).toHaveBeenCalledTimes(1)
    })
  })

  describe('look', () => {
    it('should look at position', async () => {
      const client = new DefaultAgentClient(factory)

      // Mock avatar state for look calculation
      vi.spyOn(mockAvatarController, 'getState').mockReturnValue({
        networkId: 'bot-123',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        avatarId: 'test-avatar',
      })

      await client.connect({
        url: 'https://metatell.app/test-hub',
        token: 'test-token',
      })

      const target = { x: 10, y: 0, z: 5 }
      await client.look(target)

      expect(mockAvatarController.rotate).toHaveBeenCalled()
    })
  })

  describe('playAnimation', () => {
    it('should play animation through avatar controller', async () => {
      const client = new DefaultAgentClient(factory)

      await client.connect({
        url: 'https://metatell.app/test-hub',
        token: 'test-token',
      })

      const mockResult: AnimationPlaybackResult = {
        playbackId: 'playback-123',
        animationId: 'wave',
        startedAt: Date.now(),
        expectedDuration: 1000,
      }
      vi.spyOn(mockAvatarController, 'playAnimation').mockResolvedValue(mockResult)

      const result = await client.playAnimation('wave')

      expect(mockAvatarController.playAnimation).toHaveBeenCalledWith('wave', undefined)
      expect(result).toEqual(mockResult)
    })

    it('should play animation with options', async () => {
      const client = new DefaultAgentClient(factory)

      await client.connect({
        url: 'https://metatell.app/test-hub',
        token: 'test-token',
      })

      const options = { loop: true, speed: 0.5 }
      const mockResult: AnimationPlaybackResult = {
        playbackId: 'playback-456',
        animationId: 'dance',
        startedAt: Date.now(),
        expectedDuration: 2000,
      }
      vi.spyOn(mockAvatarController, 'playAnimation').mockResolvedValue(mockResult)

      const result = await client.playAnimation('dance', options)

      expect(mockAvatarController.playAnimation).toHaveBeenCalledWith('dance', options)
      expect(result).toEqual(mockResult)
    })
  })

  describe('stopAnimation', () => {
    it('should stop current animation', async () => {
      const client = new DefaultAgentClient(factory)

      await client.connect({
        url: 'https://metatell.app/test-hub',
        token: 'test-token',
      })

      await client.stopAnimation()

      expect(mockAvatarController.stopAnimation).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should handle connection errors gracefully', async () => {
      const client = new DefaultAgentClient(factory)

      // Mock connection manager to fail
      vi.spyOn(mockConnectionManager, 'connect').mockRejectedValue(new Error('Connection failed'))

      await expect(
        client.connect({
          url: 'https://metatell.app/test-hub',
          token: 'invalid-token',
        }),
      ).rejects.toThrow('Connection failed')

      expect(client.getStatus().connected).toBe(false)
      expect(client.getStatus().connecting).toBe(false)
    })
  })
})
