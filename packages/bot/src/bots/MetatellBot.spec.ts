import type {
  BotConfiguration,
  IAppSettings,
  IAvatarController,
  IConfigurationProvider,
  IConnectionManager,
  IMessageService,
  IPresenceManager,
  IUserAvatarManager,
  PresenceUser,
  UserAvatar,
} from '@metatell/sdk'
import { DefaultLoggerProvider, registerLoggerProvider } from '@metatell/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockChannel } from '../../../../test-utils/mocks.js'
import { findMockCall, getMockCalls } from '../../../../test-utils/mocks.js'
import type { MessageHandler, PresenceHandler } from '../../../../test-utils/types.js'
import { MetatellBot } from './MetatellBot.js'

// Register logger provider for tests
registerLoggerProvider(new DefaultLoggerProvider(), { allowOverwrite: true })

describe('MetatellBot', () => {
  let bot: MetatellBot
  let mockConnectionManager: IConnectionManager
  let mockMessageService: IMessageService
  let mockAvatarController: IAvatarController
  let mockPresenceManager: IPresenceManager
  let mockConfigProvider: IConfigurationProvider
  let mockUserAvatarManager: IUserAvatarManager
  let mockAppSettings: IAppSettings
  let mockChannel: MockChannel

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock channel with Phoenix Channel-like behavior
    mockChannel = {
      push: vi.fn().mockReturnValue({
        receive: vi.fn((status, callback) => {
          if (status === 'ok') {
            // Simulate immediate success for tests
            setTimeout(() => callback?.(), 0)
          }
          return {
            receive: vi.fn((nextStatus, _nextCallback) => {
              if (nextStatus === 'error' || nextStatus === 'timeout') {
                // Don't call error/timeout callbacks in successful tests
              }
              return { receive: vi.fn() }
            }),
          }
        }),
      }),
      on: vi.fn(),
      leave: vi.fn(),
      join: vi.fn().mockReturnValue({ receive: vi.fn().mockReturnThis() }),
    }

    // Mock connection manager
    mockConnectionManager = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getHubChannel: vi.fn(() => mockChannel),
      getAuthChannel: vi.fn(),
      isConnected: vi.fn(() => true),
      getSessionId: vi.fn(() => 'bot-session-123'),
      getSocket: vi.fn(),
      waitForConnection: vi.fn(),
      on: vi.fn(),
    }

    // Mock message service
    mockMessageService = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      sendNAF: vi.fn(),
      sendNAFR: vi.fn(),
      beginTyping: vi.fn(),
      endTyping: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    }

    // Mock avatar controller
    mockAvatarController = {
      spawn: vi.fn().mockResolvedValue(undefined),
      move: vi.fn().mockResolvedValue(undefined),
      rotate: vi.fn(),
      updateState: vi.fn(),
      getState: vi.fn(),
      destroy: vi.fn().mockResolvedValue(undefined),
    }

    // Mock presence manager
    mockPresenceManager = {
      getUsers: vi.fn(() => [
        { id: 'user-1', profile: { displayName: 'User1' }, permissions: {}, roles: {} },
        { id: 'user-2', profile: { displayName: 'User2' }, permissions: {}, roles: {} },
      ]),
      getUser: vi.fn(),
      isUserPresent: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    }

    // Mock config provider
    mockConfigProvider = {
      get: vi.fn(),
      set: vi.fn(),
      getConfiguration: vi.fn(
        () =>
          ({
            authUrl: 'https://test.app/auth',
            hubUrl: 'https://test.app/hub',
            hubId: 'test-hub',
            profile: { displayName: 'TestBot', avatarId: 'bot-avatar' },
            context: { mobile: false, embed: false, hmd: false },
          }) as BotConfiguration,
      ),
      updateProfile: vi.fn(),
      updateContext: vi.fn(),
    }

    // Mock user avatar manager
    mockUserAvatarManager = {
      getUsers: vi.fn(() => []),
      getUser: vi.fn(),
      getUserCount: vi.fn(() => 0),
      getUsersInRange: vi.fn(() => []),
      on: vi.fn(),
      off: vi.fn(),
    }

    // Mock app settings
    mockAppSettings = {
      debugMode: false,
      logLevel: 'info',
      onDebugModeChanged: vi.fn(),
      setDebugMode: vi.fn(),
    }

    bot = new MetatellBot(
      mockConnectionManager,
      mockMessageService,
      mockAvatarController,
      mockPresenceManager,
      mockConfigProvider,
      mockUserAvatarManager,
      mockAppSettings,
    )
  })

  describe('constructor', () => {
    it('should setup event handlers', () => {
      expect(mockMessageService.on).toHaveBeenCalledWith('message', expect.any(Function))
      expect(mockPresenceManager.on).toHaveBeenCalledWith('join', expect.any(Function))
      expect(mockPresenceManager.on).toHaveBeenCalledWith('leave', expect.any(Function))
    })
  })

  describe('message handling', () => {
    let messageHandler: MessageHandler

    beforeEach(() => {
      const onCalls = getMockCalls(mockMessageService.on as ReturnType<typeof vi.fn>)
      messageHandler = onCalls[0][1] as MessageHandler
    })

    it('should respond to help command', async () => {
      await messageHandler({ body: '@TestBot help', session_id: 'user-123' })

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Available commands:'),
      )
    })

    it('should respond to info command', async () => {
      await messageHandler({ body: '@TestBot info', session_id: 'user-123' })

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Room Information:'),
      )
    })

    it('should respond to hello message', async () => {
      await messageHandler({ body: '@TestBot hello there!', session_id: 'user-123' })

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Hello'))
    })

    it('should handle help command with different cases', async () => {
      // 通常のhelp
      await messageHandler({ body: '@TestBot help', session_id: 'user-123' })
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Available commands:'),
      )

      // 大文字のHELP
      mockMessageService.sendMessage.mockClear()
      await messageHandler({ body: '@TestBot HELP', session_id: 'user-123' })
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Available commands:'),
      )

      // 余分なスペース
      mockMessageService.sendMessage.mockClear()
      await messageHandler({ body: '@TestBot  help  ', session_id: 'user-123' })
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Available commands:'),
      )
    })

    it('should respond to time command', async () => {
      await messageHandler({ body: '@TestBot time', session_id: 'user-123' })

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Current time:'),
      )
    })

    it('should handle move command', async () => {
      await messageHandler({ body: '@TestBot move 10 0 -5', session_id: 'user-123' })

      expect(mockAvatarController.move).toHaveBeenCalledWith({ x: 10, y: 0, z: -5 })
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith('Moving to position (10, 0, -5)')
    })

    it('should ignore invalid move command', async () => {
      await messageHandler({ body: '@TestBot move abc def', session_id: 'user-123' })

      expect(mockAvatarController.move).not.toHaveBeenCalled()
    })

    it('should ignore messages from bot itself', async () => {
      await messageHandler({ body: '@TestBot hello', session_id: 'bot-session-123' })

      expect(mockMessageService.sendMessage).not.toHaveBeenCalled()
    })

    it('should handle errors in message handlers', async () => {
      // Add a handler that throws
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error')
      })
      bot.addMessageHandler(errorHandler)

      // エラーが発生してもクラッシュしないことを確認
      await expect(
        messageHandler({ body: '@TestBot test', session_id: 'user-123' }),
      ).resolves.not.toThrow()
    })
  })

  describe('presence handling', () => {
    it('should welcome new users', () => {
      const joinCall = findMockCall(
        mockPresenceManager.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'join',
      )
      const joinHandler = joinCall?.[1] as PresenceHandler

      const newUser: PresenceUser = {
        id: 'user-123',
        profile: { displayName: 'NewUser' },
        permissions: {},
        roles: {},
      }

      joinHandler(newUser)

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        'Welcome to the room, NewUser! 👋',
      )
    })

    it('should not welcome bot itself', () => {
      const joinCall = findMockCall(
        mockPresenceManager.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'join',
      )
      const joinHandler = joinCall?.[1] as PresenceHandler

      const botUser: PresenceUser = {
        id: 'bot-123',
        profile: { displayName: 'TestBot' },
        permissions: {},
        roles: {},
      }

      joinHandler(botUser)

      expect(mockMessageService.sendMessage).not.toHaveBeenCalled()
    })

    it('should handle user leave without logging', () => {
      const leaveCall = findMockCall(
        mockPresenceManager.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'leave',
      )
      const leaveHandler = leaveCall?.[1] as PresenceHandler

      const user: PresenceUser = {
        id: 'user-123',
        profile: { displayName: 'LeavingUser' },
        permissions: {},
        roles: {},
      }

      // Should not throw
      expect(() => leaveHandler(user)).not.toThrow()
    })
  })

  describe('custom message handlers', () => {
    it('should add custom message handler', async () => {
      const customHandler = vi.fn(() => 'Custom response')
      bot.addMessageHandler(customHandler)

      const onCalls = getMockCalls(mockMessageService.on as ReturnType<typeof vi.fn>)
      const messageHandler = onCalls[0][1] as MessageHandler
      await messageHandler({ body: '@TestBot test', session_id: 'user-123' })

      expect(customHandler).toHaveBeenCalledWith('test', 'user-123')
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith('Custom response')
    })

    it('should remove custom message handler', async () => {
      const customHandler = vi.fn(() => 'Custom response')
      bot.addMessageHandler(customHandler)
      bot.removeMessageHandler(customHandler)

      const onCalls = getMockCalls(mockMessageService.on as ReturnType<typeof vi.fn>)
      const messageHandler = onCalls[0][1] as MessageHandler
      await messageHandler({ body: '@TestBot test', session_id: 'user-123' })

      expect(customHandler).not.toHaveBeenCalled()
    })

    it('should handle removing non-existent handler', () => {
      const handler = vi.fn()
      expect(() => bot.removeMessageHandler(handler)).not.toThrow()
    })
  })

  describe('start', () => {
    it('should start bot successfully', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

      await bot.start()

      expect(mockConnectionManager.connect).toHaveBeenCalledWith({
        authUrl: 'https://test.app/auth',
        hubId: 'test-hub',
      })
      expect(mockChannel.push).toHaveBeenCalledWith('events:entering', {})
      expect(mockChannel.push).toHaveBeenCalledWith('events:entered', expect.any(Object))
      expect(mockAvatarController.spawn).toHaveBeenCalledWith('bot-avatar')
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('TestBot is now online!'),
      )
      expect(bot.isActive()).toBe(true)

      consoleLogSpy.mockRestore()
    })

    it('should not start if already running', async () => {
      await bot.start()
      await bot.start()

      expect(mockConnectionManager.connect).toHaveBeenCalledTimes(1)
    })

    it('should handle connection errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const error = new Error('Connection failed')
      mockConnectionManager.connect = vi.fn().mockRejectedValue(error)

      await expect(bot.start()).rejects.toThrow('Connection failed')
      expect(bot.isActive()).toBe(false)

      consoleErrorSpy.mockRestore()
    })

    it('should handle missing hub channel', async () => {
      mockConnectionManager.getHubChannel = vi.fn(() => null)

      await expect(bot.start()).rejects.toThrow('No hub channel available')
      expect(bot.isActive()).toBe(false)
    })
  })

  describe('stop', () => {
    it('should stop bot successfully', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

      await bot.start()
      await bot.stop()

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        'Goodbye everyone! See you next time! 👋',
      )
      expect(mockAvatarController.destroy).toHaveBeenCalled()
      expect(mockConnectionManager.disconnect).toHaveBeenCalled()
      expect(bot.isActive()).toBe(false)

      consoleLogSpy.mockRestore()
    })

    it('should not stop if not running', async () => {
      await bot.stop()

      expect(mockMessageService.sendMessage).not.toHaveBeenCalled()
    })

    it('should handle errors during stop', async () => {
      await bot.start()

      mockMessageService.sendMessage = vi.fn().mockRejectedValue(new Error('Send failed'))

      await bot.stop()

      // エラーが発生してもstopが完了することを確認
      expect(bot.isActive()).toBe(false)
    })
  })

  describe('getRoomInfo', () => {
    it('should return room information', async () => {
      const onCalls = getMockCalls(mockMessageService.on as ReturnType<typeof vi.fn>)
      const messageHandler = onCalls[0][1] as MessageHandler
      await messageHandler({ body: '@TestBot info', session_id: 'user-123' })

      const expectedMessage = expect.stringContaining('Users online: 2')
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(expectedMessage)
    })

    it('should handle bot names with spaces correctly', async () => {
      // 元の設定を保存
      const originalGetConfiguration = mockConfigProvider.getConfiguration

      // スペースを含む名前の設定
      mockConfigProvider.getConfiguration = vi.fn(() => ({
        authUrl: 'https://test.app/auth',
        hubId: 'test-hub',
        profile: {
          displayName: 'AI Assistant',
          avatarId: 'bot-avatar',
        },
        context: {},
      }))

      // 新しいボットインスタンスを作成
      const _spaceBot = new MetatellBot(
        mockConnectionManager,
        mockMessageService,
        mockAvatarController,
        mockPresenceManager,
        mockUserAvatarManager,
        mockConfigProvider,
        mockAppSettings,
      )

      // メッセージハンドラーを取得
      const onCalls = getMockCalls(mockMessageService.on as ReturnType<typeof vi.fn>)
      const messageHandler = onCalls[0][1] as MessageHandler

      // helpコマンドのテスト
      await messageHandler({ body: '@AI Assistant help', session_id: 'user-123' })
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Available commands:'),
      )

      // helloコマンドのテスト
      mockMessageService.sendMessage.mockClear()
      await messageHandler({ body: '@AI Assistant hello', session_id: 'user-123' })
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Hello'))

      // 設定を元に戻す
      mockConfigProvider.getConfiguration = originalGetConfiguration
    })

    it('should handle users without display names', async () => {
      mockPresenceManager.getUsers = vi.fn(() => [
        { id: 'user-1', profile: {}, permissions: {}, roles: {} },
      ])

      const onCalls = getMockCalls(mockMessageService.on as ReturnType<typeof vi.fn>)
      const messageHandler = onCalls[0][1] as MessageHandler
      await messageHandler({ body: '@TestBot info', session_id: 'user-123' })

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Unknown'),
      )
    })
  })

  describe('users command', () => {
    it('should list all users with positions', async () => {
      const testUsers: UserAvatar[] = [
        {
          id: 'user-123-full-id',
          nickname: 'Alice',
          position: { x: 10.5, y: 0.2, z: -5.3 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          lastUpdated: Date.now(),
        },
        {
          id: 'user-456-full-id',
          nickname: 'Bob',
          position: { x: -3.2, y: 0, z: 7.8 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          lastUpdated: Date.now(),
        },
      ]
      mockUserAvatarManager.getUsers = vi.fn(() => testUsers)

      const onCalls = getMockCalls(mockMessageService.on as ReturnType<typeof vi.fn>)
      const messageHandler = onCalls[0][1] as MessageHandler
      await messageHandler({ body: '@TestBot users', session_id: 'user-123' })

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('👥 Users in room (2):'),
      )
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Alice (user-123...') && expect.stringContaining('10.5, 0.2, -5.3'),
      )
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Bob (user-456...') && expect.stringContaining('-3.2, 0.0, 7.8'),
      )
    })

    it('should handle empty user list', async () => {
      mockUserAvatarManager.getUsers = vi.fn(() => [])

      const onCalls = getMockCalls(mockMessageService.on as ReturnType<typeof vi.fn>)
      const messageHandler = onCalls[0][1] as MessageHandler
      await messageHandler({ body: '@TestBot users', session_id: 'user-123' })

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith('No users currently in the room')
    })
  })

  describe('nearby command', () => {
    beforeEach(() => {
      // Setup bot avatar state
      mockAvatarController.getState = vi.fn(() => ({
        networkId: 'bot-123',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        avatarId: 'bot-avatar',
        displayName: 'TestBot',
        avatarSrc: 'https://example.com/avatar',
      }))
    })

    it('should list users within radius', async () => {
      const nearbyUsers: UserAvatar[] = [
        {
          id: 'user-near',
          nickname: 'NearUser',
          position: { x: 3, y: 0, z: 4 }, // Distance: 5
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          lastUpdated: Date.now(),
        },
      ]
      mockUserAvatarManager.getUsersInRange = vi.fn(() => nearbyUsers)

      const onCalls = getMockCalls(mockMessageService.on as ReturnType<typeof vi.fn>)
      const messageHandler = onCalls[0][1] as MessageHandler
      await messageHandler({ body: '@TestBot nearby 10', session_id: 'user-123' })

      expect(mockUserAvatarManager.getUsersInRange).toHaveBeenCalledWith({ x: 0, y: 0, z: 0 }, 10)
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('📍 Users within 10 units (1):'),
      )
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('NearUser - 5.0 units away'),
      )
    })

    it('should handle no users within radius', async () => {
      mockUserAvatarManager.getUsersInRange = vi.fn(() => [])

      const onCalls = getMockCalls(mockMessageService.on as ReturnType<typeof vi.fn>)
      const messageHandler = onCalls[0][1] as MessageHandler
      await messageHandler({ body: '@TestBot nearby 5', session_id: 'user-123' })

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith('No users within 5 units')
    })

    it('should handle bot avatar not spawned', async () => {
      mockAvatarController.getState = vi.fn(() => null)

      const onCalls = getMockCalls(mockMessageService.on as ReturnType<typeof vi.fn>)
      const messageHandler = onCalls[0][1] as MessageHandler
      await messageHandler({ body: '@TestBot nearby 10', session_id: 'user-123' })

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith('Bot avatar not spawned yet')
    })

    it('should ignore invalid nearby command', async () => {
      const onCalls = getMockCalls(mockMessageService.on as ReturnType<typeof vi.fn>)
      const messageHandler = onCalls[0][1] as MessageHandler
      await messageHandler({ body: '@TestBot nearby abc', session_id: 'user-123' })

      expect(mockUserAvatarManager.getUsersInRange).not.toHaveBeenCalled()
    })
  })
})
