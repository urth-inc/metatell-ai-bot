/**
 * Test for CommandParser
 */

import type { MetatellClient } from '@metatell/bot-sdk'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { CommandParser } from './commands.js'

// Mock console
const mockConsole = {
  log: vi.fn(),
  error: vi.fn(),
}

describe('CommandParser', () => {
  let parser: CommandParser
  let mockClient: Partial<MetatellClient>

  beforeEach(() => {
    vi.clearAllMocks()
    global.console = mockConsole as Console

    parser = new CommandParser()

    // Setup comprehensive client mock
    mockClient = {
      chat: {
        send: vi.fn().mockResolvedValue(undefined),
        onMessage: vi.fn(),
      },
      avatar: {
        moveTo: vi.fn().mockResolvedValue(undefined),
        lookAt: vi.fn().mockResolvedValue(undefined),
        select: vi.fn().mockResolvedValue(undefined),
        play: vi.fn().mockResolvedValue(undefined),
        getPosition: vi.fn().mockReturnValue({ x: 0, y: 0, z: 0 }),
        rotateTo: vi.fn().mockResolvedValue(undefined),
        getAvailableAssets: vi.fn().mockResolvedValue([
          { id: 'avatar1', name: 'Avatar One', thumbnailUrl: 'url1', modelUrl: 'model1' },
          { id: 'avatar2', name: 'Avatar Two', thumbnailUrl: 'url2', modelUrl: 'model2' },
        ]),
        getAvailableAnimations: vi.fn().mockResolvedValue([
          { id: 'wave', name: 'Wave', duration: 2.5 },
          { id: 'dance', name: 'Dance', duration: 5.0 },
          { id: 'idle', name: 'Idle' },
        ]),
      },
      room: {
        getUsers: vi.fn().mockResolvedValue([
          { id: 'user1', name: 'Alice', isBot: false },
          { id: 'user2', name: 'Bob', isBot: false },
          { id: 'bot1', name: 'TestBot', isBot: true },
        ]),
        getNearbyUsers: vi.fn().mockResolvedValue([{ id: 'user1', name: 'Alice', isBot: false }]),
        // @ts-expect-error: getUserPosition is not in SDK types yet
        getUserPosition: vi.fn().mockResolvedValue({ x: 1, y: 2, z: 3 }),
      },
      getStatus: vi.fn().mockReturnValue({
        connected: true,
        connecting: false,
      }),
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getInfo: vi.fn().mockResolvedValue({
        name: 'TestBot',
        version: '1.0.0',
        roomId: 'test-room',
        sessionId: 'test-session-id',
      }),
    }
  })

  afterEach(() => {
    global.console = console
  })

  describe('help command', () => {
    it('should show help with /help', async () => {
      const result = await parser.execute('/help', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockConsole.log).toHaveBeenCalledWith(expect.stringContaining('Available commands'))
    })

    it('should show help with /?', async () => {
      const result = await parser.execute('/?', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockConsole.log).toHaveBeenCalledWith(expect.stringContaining('Available commands'))
    })
  })

  describe('say command', () => {
    it('should send message', async () => {
      const result = await parser.execute('/say Hello world!', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockClient.chat.send).toHaveBeenCalledWith('Hello world!')
      expect(mockConsole.log).toHaveBeenCalledWith('[Sent]', 'Hello world!')
    })

    it('should handle empty message', async () => {
      const result = await parser.execute('/say', mockClient as MetatellClient)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Usage: /say <message>')
    })

    it('should handle multiword messages', async () => {
      const result = await parser.execute(
        '/say This is a long message',
        mockClient as MetatellClient,
      )

      expect(result.success).toBe(true)
      expect(mockClient.chat.send).toHaveBeenCalledWith('This is a long message')
    })
  })

  describe('move command', () => {
    it('should move avatar', async () => {
      const result = await parser.execute('/move 10 0 -5', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockClient.avatar.moveTo).toHaveBeenCalledWith({ x: 10, y: 0, z: -5 })
      expect(mockConsole.log).toHaveBeenCalledWith('[Moved to] x:10 y:0 z:-5')
    })

    it('should handle decimal coordinates', async () => {
      const result = await parser.execute('/move 10.5 1.25 -5.75', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockClient.avatar.moveTo).toHaveBeenCalledWith({ x: 10.5, y: 1.25, z: -5.75 })
    })

    it('should reject invalid coordinates', async () => {
      const result = await parser.execute('/move abc 0 0', mockClient as MetatellClient)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Invalid coordinates. Must be numbers.')
    })

    it('should require 3 coordinates', async () => {
      const result = await parser.execute('/move 10 0', mockClient as MetatellClient)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Usage: /move <x> <y> <z>')
    })
  })

  describe('look command', () => {
    it('should look at coordinates', async () => {
      const result = await parser.execute('/look 5 2 10', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockClient.avatar.lookAt).toHaveBeenCalledWith({ x: 5, y: 2, z: 10 })
      expect(mockConsole.log).toHaveBeenCalledWith('[Looking at] x:5 y:2 z:10')
    })

    it('should look at user', async () => {
      const result = await parser.execute('/look @Alice', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockClient.room.getUsers).toHaveBeenCalled()
      expect((mockClient.room as { getUserPosition: Mock }).getUserPosition).toHaveBeenCalledWith(
        'user1',
      )
      expect(mockClient.avatar.lookAt).toHaveBeenCalledWith({ x: 1, y: 2, z: 3 })
      expect(mockConsole.log).toHaveBeenCalledWith('[Looking at] Alice')
    })

    it('should handle case-insensitive username', async () => {
      const result = await parser.execute('/look @alice', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect((mockClient.room as { getUserPosition: Mock }).getUserPosition).toHaveBeenCalledWith(
        'user1',
      )
      expect(mockConsole.log).toHaveBeenCalledWith('[Looking at] Alice')
    })

    it('should handle user not found', async () => {
      const result = await parser.execute('/look @Unknown', mockClient as MetatellClient)

      expect(result.success).toBe(false)
      expect(result.message).toBe('User not found: Unknown')
    })

    it('should handle missing user position', async () => {
      ;(mockClient.room as { getUserPosition: Mock }).getUserPosition.mockResolvedValueOnce(null)
      const result = await parser.execute('/look @Alice', mockClient as MetatellClient)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Could not get position for user: Alice')
    })

    it('should handle SDK without getUserPosition', async () => {
      // remove API to simulate older SDK
      delete (mockClient.room as Record<string, unknown>).getUserPosition
      const result = await parser.execute('/look @Alice', mockClient as MetatellClient)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Looking at users is not supported by this SDK version.')
    })

    it('should reject empty arguments', async () => {
      const result = await parser.execute('/look', mockClient as MetatellClient)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Usage: /look <x> <y> <z> or /look @<username>')
    })
  })

  describe('nearby command', () => {
    it('should list nearby users with default radius', async () => {
      const result = await parser.execute('/nearby', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockClient.room.getNearbyUsers).toHaveBeenCalledWith(10)
      expect(mockConsole.log).toHaveBeenCalledWith('[Nearby users within 10m]')
      expect(mockConsole.log).toHaveBeenCalledWith('- Alice (user1)')
    })

    it('should list nearby users with custom radius', async () => {
      const result = await parser.execute('/nearby 25', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockClient.room.getNearbyUsers).toHaveBeenCalledWith(25)
      expect(mockConsole.log).toHaveBeenCalledWith('[Nearby users within 25m]')
    })

    it('should reject invalid radius', async () => {
      const result = await parser.execute('/nearby abc', mockClient as MetatellClient)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Invalid radius. Must be a number.')
    })
  })

  describe('users command', () => {
    it('should list all users', async () => {
      const result = await parser.execute('/users', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockClient.room.getUsers).toHaveBeenCalled()
      expect(mockConsole.log).toHaveBeenCalledWith('[Users (3)]')
      expect(mockConsole.log).toHaveBeenCalledWith('- Alice (user1)')
      expect(mockConsole.log).toHaveBeenCalledWith('- Bob (user2)')
      expect(mockConsole.log).toHaveBeenCalledWith('- TestBot (bot1) [Bot]')
    })
  })

  describe('status command', () => {
    it('should show connection status', async () => {
      const result = await parser.execute('/status', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockConsole.log).toHaveBeenCalledWith('[Status]')
      expect(mockConsole.log).toHaveBeenCalledWith('Connected: true')
      expect(mockConsole.log).toHaveBeenCalledWith('Connecting: false')
      expect(mockConsole.log).toHaveBeenCalledWith('Session ID: test-session-id')
    })

    it('should handle null session ID', async () => {
      mockClient.getSessionId = vi.fn().mockReturnValue(null)

      const result = await parser.execute('/status', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockConsole.log).toHaveBeenCalledWith('Session ID: N/A')
    })
  })

  describe('info command', () => {
    it('should show bot info', async () => {
      const result = await parser.execute('/info', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockConsole.log).toHaveBeenCalledWith('[Bot Info]')
      expect(mockConsole.log).toHaveBeenCalledWith('Name: TestBot')
      expect(mockConsole.log).toHaveBeenCalledWith('Version: 1.0.0')
      expect(mockConsole.log).toHaveBeenCalledWith('Room ID: test-room')
    })
  })

  describe('avatar command', () => {
    it('should change avatar', async () => {
      const result = await parser.execute('/avatar avatar-123', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockClient.avatar.select).toHaveBeenCalledWith('avatar-123')
      expect(mockConsole.log).toHaveBeenCalledWith('[Avatar changed to] avatar-123')
    })

    it('should handle organization avatar (UUID format)', async () => {
      const orgAvatarId = '69030ac8-1089-4686-82b2-1068bc4c776c'
      const result = await parser.execute(`/avatar ${orgAvatarId}`, mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockClient.avatar.select).toHaveBeenCalledWith(orgAvatarId)
      expect(mockConsole.log).toHaveBeenCalledWith(`[Avatar changed to] ${orgAvatarId}`)
    })

    it('should handle organization avatar selection error', async () => {
      const orgAvatarId = '1851efd1-d5ec-43a7-aad3-f3126c407587'
      mockClient.avatar.select = vi
        .fn()
        .mockRejectedValue(
          new Error(`Organization avatar requires avatarSrc URL. Avatar ID: ${orgAvatarId}`),
        )

      const result = await parser.execute(`/avatar ${orgAvatarId}`, mockClient as MetatellClient)

      expect(result.success).toBe(false)
      expect(result.message).toBe(
        `Failed to change avatar: Organization avatar requires avatarSrc URL. Avatar ID: ${orgAvatarId}`,
      )
      expect(mockConsole.error).toHaveBeenCalledWith(
        '[Error]',
        `Organization avatar requires avatarSrc URL. Avatar ID: ${orgAvatarId}`,
      )
    })

    it('should handle organization avatar not found error', async () => {
      const orgAvatarId = 'a1234567-89ab-cdef-0123-456789abcdef'
      mockClient.avatar.select = vi
        .fn()
        .mockRejectedValue(new Error(`Organization avatar not found: ${orgAvatarId}`))

      const result = await parser.execute(`/avatar ${orgAvatarId}`, mockClient as MetatellClient)

      expect(result.success).toBe(false)
      expect(result.message).toBe(
        `Failed to change avatar: Organization avatar not found: ${orgAvatarId}`,
      )
      expect(mockConsole.error).toHaveBeenCalledWith(
        '[Error]',
        `Organization avatar not found: ${orgAvatarId}`,
      )
    })

    it('should require avatar ID', async () => {
      const result = await parser.execute('/avatar', mockClient as MetatellClient)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Usage: /avatar <id>')
    })
  })

  describe('assets command', () => {
    it('should list available avatars', async () => {
      const result = await parser.execute('/assets', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockClient.avatar.getAvailableAssets).toHaveBeenCalled()
      expect(mockConsole.log).toHaveBeenCalledWith('[Available avatars (2)]')
      expect(mockConsole.log).toHaveBeenCalledWith('- avatar1: Avatar One')
      expect(mockConsole.log).toHaveBeenCalledWith('- avatar2: Avatar Two')
    })
  })

  describe('animation commands', () => {
    it('should play animation with /anime', async () => {
      const result = await parser.execute('/anime wave', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockClient.avatar.play).toHaveBeenCalledWith({
        name: 'wave',
        id: 'wave',
        loop: false,
      })
      expect(mockConsole.log).toHaveBeenCalledWith('[Playing animation] wave')
    })

    it('should play animation with /animation', async () => {
      const result = await parser.execute('/animation dance', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockClient.avatar.play).toHaveBeenCalledWith({
        name: 'dance',
        id: 'dance',
        loop: false,
      })
    })

    it('should handle multiword animation names', async () => {
      const result = await parser.execute('/anime happy dance', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockClient.avatar.play).toHaveBeenCalledWith({
        name: 'happy dance',
        id: 'happy dance',
        loop: false,
      })
    })

    it('should require animation name', async () => {
      const result = await parser.execute('/anime', mockClient as MetatellClient)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Usage: /anime <name>')
    })

    it('should handle animation errors', async () => {
      mockClient.avatar.play = vi.fn().mockRejectedValue(new Error('Animation not found'))

      const result = await parser.execute('/anime invalid', mockClient as MetatellClient)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Failed to play animation: Animation not found')
    })
  })

  describe('stop command', () => {
    it('should stop animation', async () => {
      const result = await parser.execute('/stop', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockClient.avatar.play).toHaveBeenCalledWith({
        name: 'idle',
        id: 'idle',
        loop: true,
      })
      expect(mockConsole.log).toHaveBeenCalledWith('[Stopped animation]')
    })

    it('should handle stop errors gracefully', async () => {
      mockClient.avatar.play = vi.fn().mockRejectedValue(new Error('Failed'))

      const result = await parser.execute('/stop', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(result.message).toBe('Animation stopped')
    })
  })

  describe('animations command', () => {
    it('should list available animations', async () => {
      const result = await parser.execute('/animations', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockClient.avatar.getAvailableAnimations).toHaveBeenCalled()
      expect(mockConsole.log).toHaveBeenCalledWith('[Available animations (3)]')
      expect(mockConsole.log).toHaveBeenCalledWith('- wave: Wave (2.5s)')
      expect(mockConsole.log).toHaveBeenCalledWith('- dance: Dance (5.0s)')
      expect(mockConsole.log).toHaveBeenCalledWith('- idle: Idle')
    })
  })

  describe('unknown command', () => {
    it('should handle unknown commands', async () => {
      const result = await parser.execute('/unknown', mockClient as MetatellClient)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Unknown command: /unknown. Type /help for commands.')
    })
  })

  describe('command case handling', () => {
    it('should handle uppercase commands', async () => {
      const result = await parser.execute('/HELP', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockConsole.log).toHaveBeenCalledWith(expect.stringContaining('Available commands'))
    })

    it('should handle mixed case commands', async () => {
      const result = await parser.execute('/SaY Hello', mockClient as MetatellClient)

      expect(result.success).toBe(true)
      expect(mockClient.chat.send).toHaveBeenCalledWith('Hello')
    })
  })
})
