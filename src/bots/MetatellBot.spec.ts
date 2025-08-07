import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MetatellBot } from './MetatellBot'
import type { IConnectionManager } from '../core/interfaces/IConnectionManager'
import type { IMessageService } from '../core/interfaces/IMessageService'
import type { IAvatarController } from '../core/interfaces/IAvatarController'
import type { IPresenceManager, PresenceUser } from '../core/interfaces/IPresenceManager'
import type {
  IConfigurationProvider,
  BotConfiguration,
} from '../core/interfaces/IConfigurationProvider'
import type { MockChannel } from '../test-utils/mocks'
import { getMockCalls, findMockCall } from '../test-utils/mocks'
import type { MessageHandler, PresenceHandler } from '../test-utils/types'

describe('MetatellBot', () => {
  let bot: MetatellBot
  let mockConnectionManager: IConnectionManager
  let mockMessageService: IMessageService
  let mockAvatarController: IAvatarController
  let mockPresenceManager: IPresenceManager
  let mockConfigProvider: IConfigurationProvider
  let mockChannel: MockChannel

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock channel
    mockChannel = {
      push: vi.fn(),
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

    bot = new MetatellBot(
      mockConnectionManager,
      mockMessageService,
      mockAvatarController,
      mockPresenceManager,
      mockConfigProvider,
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

    it('should respond to help command', () => {
      messageHandler({ body: 'help', session_id: 'user-123' })

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Available commands:'),
      )
    })

    it('should respond to info command', () => {
      messageHandler({ body: 'info', session_id: 'user-123' })

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Room Information:'),
      )
    })

    it('should respond to hello message', () => {
      messageHandler({ body: 'hello there!', session_id: 'user-123' })

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining("Hello! I'm TestBot"),
      )
    })

    it('should respond to time command', () => {
      messageHandler({ body: 'time', session_id: 'user-123' })

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Current time:'),
      )
    })

    it('should handle move command', () => {
      messageHandler({ body: 'move 10 0 -5', session_id: 'user-123' })

      expect(mockAvatarController.move).toHaveBeenCalledWith({ x: 10, y: 0, z: -5 })
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith('Moving to position (10, 0, -5)')
    })

    it('should ignore invalid move command', () => {
      messageHandler({ body: 'move abc def', session_id: 'user-123' })

      expect(mockAvatarController.move).not.toHaveBeenCalled()
    })

    it('should ignore messages from bot itself', () => {
      messageHandler({ body: 'hello', session_id: 'bot-session-123' })

      expect(mockMessageService.sendMessage).not.toHaveBeenCalled()
    })

    it('should handle errors in message handlers', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      // Add a handler that throws
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error')
      })
      bot.addMessageHandler(errorHandler)

      messageHandler({ body: 'test', session_id: 'user-123' })

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error in message handler:', expect.any(Error))

      consoleErrorSpy.mockRestore()
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

    it('should log user leave', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

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

      leaveHandler(user)

      expect(consoleLogSpy).toHaveBeenCalledWith('User left: LeavingUser')

      consoleLogSpy.mockRestore()
    })
  })

  describe('custom message handlers', () => {
    it('should add custom message handler', () => {
      const customHandler = vi.fn(() => 'Custom response')
      bot.addMessageHandler(customHandler)

      const onCalls = getMockCalls(mockMessageService.on as ReturnType<typeof vi.fn>)
      const messageHandler = onCalls[0][1] as MessageHandler
      messageHandler({ body: 'test', session_id: 'user-123' })

      expect(customHandler).toHaveBeenCalledWith('test', 'user-123')
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith('Custom response')
    })

    it('should remove custom message handler', () => {
      const customHandler = vi.fn(() => 'Custom response')
      bot.addMessageHandler(customHandler)
      bot.removeMessageHandler(customHandler)

      const onCalls = getMockCalls(mockMessageService.on as ReturnType<typeof vi.fn>)
      const messageHandler = onCalls[0][1] as MessageHandler
      messageHandler({ body: 'test', session_id: 'user-123' })

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
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

      await bot.start()
      await bot.start()

      expect(mockConnectionManager.connect).toHaveBeenCalledTimes(1)
      expect(consoleLogSpy).toHaveBeenCalledWith('Bot is already running')

      consoleLogSpy.mockRestore()
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

      await expect(bot.start()).rejects.toThrow('Not connected to hub')
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
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

      await bot.stop()

      expect(mockMessageService.sendMessage).not.toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith('Bot is not running')

      consoleLogSpy.mockRestore()
    })

    it('should handle errors during stop', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      await bot.start()

      mockMessageService.sendMessage = vi.fn().mockRejectedValue(new Error('Send failed'))

      await bot.stop()

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error stopping bot:', expect.any(Error))

      consoleErrorSpy.mockRestore()
    })
  })

  describe('getRoomInfo', () => {
    it('should return room information', () => {
      const onCalls = getMockCalls(mockMessageService.on as ReturnType<typeof vi.fn>)
      const messageHandler = onCalls[0][1] as MessageHandler
      messageHandler({ body: 'info', session_id: 'user-123' })

      const expectedMessage = expect.stringContaining('Users online: 2')
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(expectedMessage)
    })

    it('should handle users without display names', () => {
      mockPresenceManager.getUsers = vi.fn(() => [
        { id: 'user-1', profile: {}, permissions: {}, roles: {} },
      ])

      const onCalls = getMockCalls(mockMessageService.on as ReturnType<typeof vi.fn>)
      const messageHandler = onCalls[0][1] as MessageHandler
      messageHandler({ body: 'info', session_id: 'user-123' })

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Unknown'),
      )
    })
  })
})
