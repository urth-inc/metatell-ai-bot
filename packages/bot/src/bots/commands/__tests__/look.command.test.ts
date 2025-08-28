import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DefaultLoggerProvider, registerLoggerProvider } from '@metatell/sdk'
import type { IAvatarController, IEventBus, IMessageService, IPresenceManager } from '@metatell/sdk'
import type { UserAvatar } from '@metatell/sdk'
import type { CommandContext } from '../BotCommand.js'
import { unifiedCommands } from '../unifiedCommands.js'

/**
 * Tests for the /look command functionality
 * Covers both Bot mention responses and CLI execution
 */

// Mock services
const mockAvatarController: IAvatarController = {
  spawn: vi.fn(),
  move: vi.fn(),
  rotate: vi.fn(),
  updateState: vi.fn(),
  getState: vi.fn(),
  destroy: vi.fn(),
  resyncAvatar: vi.fn(),
  playAnimation: vi.fn(),
  getCurrentAnimation: vi.fn(),
  stopAnimation: vi.fn(),
}

const mockUserAvatarManager = {
  getUsers: vi.fn(),
  getUser: vi.fn(),
  getUsersInRange: vi.fn(),
}

const mockPresenceManager: IPresenceManager = {
  on: vi.fn(),
  off: vi.fn(),
  getUsers: vi.fn(),
  getUser: vi.fn(),
  getBroadcaster: vi.fn(),
}

const mockEventBus: IEventBus = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  once: vi.fn(),
  removeAllListeners: vi.fn(),
}

const mockMessageService: IMessageService = {
  sendMessage: vi.fn(),
  sendNAF: vi.fn(),
  sendNAFR: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
}

const mockContext: CommandContext = {
  avatarController: mockAvatarController,
  userAvatarManager: mockUserAvatarManager as any,
  presenceManager: mockPresenceManager,
  eventBus: mockEventBus,
  messageService: mockMessageService,
  logger: mockLogger,
  agentClient: undefined,
  botConfig: undefined,
}

describe('/look Command', () => {
  const lookCommand = unifiedCommands.find(cmd => cmd.name === 'look')!
  const sessionId = 'test-session-id'

  beforeAll(() => {
    registerLoggerProvider(new DefaultLoggerProvider())
  })

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock avatar state
    vi.mocked(mockAvatarController.getState).mockReturnValue({
      networkId: 'test-network',
      position: { x: 0, y: 1.6, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      avatarId: 'test-avatar',
      avatarSrc: 'test-avatar-src',
      displayName: 'Test Bot',
    })

    // Mock successful rotate call
    vi.mocked(mockAvatarController.rotate).mockResolvedValue(undefined)
  })

  describe('Bot Handler', () => {
    it('should show usage when no arguments provided', async () => {
      const match = ['look']
      const result = await lookCommand.botHandler!(match, sessionId, mockContext)

      expect(result).toContain('Usage: look <x> <y> <z> or look @<username>')
    })

    it('should handle coordinate-based look', async () => {
      // Pattern: /^look(?:\s+(?:(@?\S+)|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)))?$/i
      // Groups: [full_match, group1_@user_or_x, group2_x, group3_y, group4_z]
      const match = ['look 1.0 2.0 3.0', undefined, '1.0', '2.0', '3.0']
      const result = await lookCommand.botHandler!(match, sessionId, mockContext)

      // Verify rotation was called with correct quaternion
      expect(mockAvatarController.rotate).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 0,
          y: expect.any(Number), // sin(yaw/2)
          z: 0,
          w: expect.any(Number), // cos(yaw/2)
        })
      )

      expect(result).toContain('Looking at (1.0, 2.0, 3.0)')
      expect(result).toContain('👀')
    })

    it('should handle @username look', async () => {
      const testUser: UserAvatar = {
        sessionId: 'user-session',
        nickname: 'TestUser',
        position: { x: 5, y: 1.6, z: 10 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        avatarId: 'user-avatar',
      }

      vi.mocked(mockUserAvatarManager.getUsers).mockReturnValue([testUser])

      const match = ['look @testuser', '@testuser']
      const result = await lookCommand.botHandler!(match, sessionId, mockContext)

      expect(mockAvatarController.rotate).toHaveBeenCalled()
      expect(result).toContain('Looking at (5.0, 1.6, 10.0)')
    })

    it('should handle user not found', async () => {
      vi.mocked(mockUserAvatarManager.getUsers).mockReturnValue([])

      const match = ['look @nonexistent', '@nonexistent']
      const result = await lookCommand.botHandler!(match, sessionId, mockContext)

      expect(mockAvatarController.rotate).not.toHaveBeenCalled()
      expect(result).toContain('User "nonexistent" not found')
    })

    it('should handle invalid coordinates', async () => {
      // Invalid input that doesn't match the regex would return null, but let's test invalid coordinates that do match
      const match = ['look abc def ghi', undefined, 'abc', 'def', 'ghi']  
      const result = await lookCommand.botHandler!(match, sessionId, mockContext)

      expect(mockAvatarController.rotate).not.toHaveBeenCalled()
      expect(result).toContain('Invalid coordinates')
    })

    it('should handle bot avatar not spawned', async () => {
      vi.mocked(mockAvatarController.getState).mockReturnValue(null)

      // match[1] is undefined for coordinates, so we need to check match[2], match[3], match[4]
      const match = ['look 1 2 3', undefined, '1', '2', '3']
      const result = await lookCommand.botHandler!(match, sessionId, mockContext)

      expect(mockAvatarController.rotate).not.toHaveBeenCalled()
      expect(result).toBe('Bot avatar not spawned')
    })

    it('should handle rotation failure gracefully', async () => {
      vi.mocked(mockAvatarController.rotate).mockRejectedValue(new Error('Rotation failed'))

      const match = ['look 1 2 3', undefined, '1', '2', '3']
      const result = await lookCommand.botHandler!(match, sessionId, mockContext)

      expect(mockLogger.error).toHaveBeenCalledWith('Look command failed:', expect.any(Error))
      expect(result).toBe('Failed to rotate avatar')
    })
  })

  describe('CLI Handler', () => {
    const cliContext = {
      ...mockContext,
      agentClient: { /* mock agent client */ },
    }

    it('should show usage when no arguments provided', async () => {
      const result = await lookCommand.cliHandler!([], cliContext)

      expect(result.success).toBe(false)
      expect(result.message).toContain('Usage: /look <x> <y> <z> or /look @<username>')
    })

    it('should handle coordinate-based look via CLI', async () => {
      const args = ['1.5', '2.5', '3.5']
      const result = await lookCommand.cliHandler!(args, cliContext)

      expect(result.success).toBe(true)
      expect(result.message).toContain('Looking at (1.5, 2.5, 3.5)')
      expect(mockAvatarController.rotate).toHaveBeenCalled()
    })

    it('should handle @username look via CLI', async () => {
      const testUser: UserAvatar = {
        sessionId: 'user-session',
        nickname: 'TestUser',
        position: { x: -2, y: 1.6, z: 8 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        avatarId: 'user-avatar',
      }

      vi.mocked(mockUserAvatarManager.getUsers).mockReturnValue([testUser])

      const args = ['@TestUser']
      const result = await lookCommand.cliHandler!(args, cliContext)

      expect(result.success).toBe(true)
      expect(result.message).toContain('Looking at (-2.0, 1.6, 8.0)')
    })

    it('should handle invalid argument count', async () => {
      const args = ['1', '2'] // Missing z coordinate
      const result = await lookCommand.cliHandler!(args, cliContext)

      expect(result.success).toBe(false)
      expect(result.message).toContain('Usage: /look <x> <y> <z> or /look @<username>')
    })

    it('should handle CLI rotation failure', async () => {
      vi.mocked(mockAvatarController.rotate).mockRejectedValue(new Error('Network error'))

      const args = ['0', '0', '0']
      const result = await lookCommand.cliHandler!(args, cliContext)

      expect(result.success).toBe(false)
      expect(result.message).toContain('Failed to rotate: Network error')
    })
  })

  describe('Quaternion Rotation Calculation', () => {
    it('should calculate correct rotation for positive X direction', async () => {
      const match = ['look 10 0 0', undefined, '10', '0', '0']
      
      await lookCommand.botHandler!(match, sessionId, mockContext)

      const rotationCall = vi.mocked(mockAvatarController.rotate).mock.calls[0][0]
      
      // Looking towards positive X should result in Y rotation (yaw) of π/2
      const expectedYaw = Math.PI / 2
      const expectedSinHalfYaw = Math.sin(expectedYaw / 2)
      const expectedCosHalfYaw = Math.cos(expectedYaw / 2)

      expect(rotationCall.x).toBeCloseTo(0)
      expect(rotationCall.y).toBeCloseTo(expectedSinHalfYaw, 5)
      expect(rotationCall.z).toBeCloseTo(0)
      expect(rotationCall.w).toBeCloseTo(expectedCosHalfYaw, 5)
    })

    it('should calculate correct rotation for negative Z direction', async () => {
      const match = ['look 0 0 -5', undefined, '0', '0', '-5']
      
      await lookCommand.botHandler!(match, sessionId, mockContext)

      const rotationCall = vi.mocked(mockAvatarController.rotate).mock.calls[0][0]
      
      // Looking towards negative Z should result in Y rotation (yaw) of π
      const expectedYaw = Math.PI
      const expectedSinHalfYaw = Math.sin(expectedYaw / 2)
      const expectedCosHalfYaw = Math.cos(expectedYaw / 2)

      expect(rotationCall.x).toBeCloseTo(0)
      expect(rotationCall.y).toBeCloseTo(expectedSinHalfYaw, 5)
      expect(rotationCall.z).toBeCloseTo(0)
      expect(rotationCall.w).toBeCloseTo(expectedCosHalfYaw, 5)
    })
  })

  describe('User Search', () => {
    it('should match usernames case-insensitively', async () => {
      const testUsers: UserAvatar[] = [
        {
          sessionId: 'user1',
          nickname: 'Alice-Wonderland-123',
          position: { x: 1, y: 1, z: 1 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          avatarId: 'avatar1',
        },
        {
          sessionId: 'user2',
          nickname: 'Bob-TheBuilder',
          position: { x: 2, y: 2, z: 2 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          avatarId: 'avatar2',
        },
      ]

      vi.mocked(mockUserAvatarManager.getUsers).mockReturnValue(testUsers)

      // Test lowercase search finding uppercase nickname
      const match = ['look @alice', '@alice']
      const result = await lookCommand.botHandler!(match, sessionId, mockContext)

      expect(result).toContain('Looking at (1.0, 1.0, 1.0)')
    })

    it('should match partial usernames', async () => {
      const testUsers: UserAvatar[] = [
        {
          sessionId: 'user1',
          nickname: 'SuperLongNickname-12345',
          position: { x: 7, y: 8, z: 9 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          avatarId: 'avatar1',
        },
      ]

      vi.mocked(mockUserAvatarManager.getUsers).mockReturnValue(testUsers)

      const match = ['look @super', '@super']
      const result = await lookCommand.botHandler!(match, sessionId, mockContext)

      expect(result).toContain('Looking at (7.0, 8.0, 9.0)')
    })
  })
})