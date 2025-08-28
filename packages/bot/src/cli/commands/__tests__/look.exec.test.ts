import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DefaultLoggerProvider, registerLoggerProvider } from '@metatell/sdk'
import type { CommandContext } from '../../bots/commands/BotCommand.js'
import { CommandExecutor } from '../exec.js'
import type { CommandPlan } from '../plan.js'

// Mock dependencies
const mockAgentClient = {
  getStatus: vi.fn(),
  getUsers: vi.fn(),
  send: vi.fn(),
  isVoiceMuted: vi.fn(),
  muteVoice: vi.fn(),
  sendVoiceFrame: vi.fn(),
}

const mockAvatarController = {
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

const mockContext: CommandContext = {
  agentClient: mockAgentClient as any,
  avatarController: mockAvatarController as any,
  userAvatarManager: mockUserAvatarManager as any,
  presenceManager: {} as any,
  eventBus: {} as any,
  messageService: {} as any,
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  },
  botConfig: {},
}

/**
 * Tests for /look command execution in CLI
 * Covers command execution flow and argument mapping
 */

describe('CommandExecutor - /look Command', () => {
  let executor: CommandExecutor

  beforeAll(() => {
    registerLoggerProvider(new DefaultLoggerProvider())
  })

  beforeEach(() => {
    vi.clearAllMocks()
    executor = new CommandExecutor(mockAgentClient as any, mockContext)

    // Mock avatar state
    vi.mocked(mockAvatarController.getState).mockReturnValue({
      networkId: 'test-network',
      position: { x: 0, y: 1.6, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      avatarId: 'test-avatar',
      avatarSrc: 'test-avatar-src',
      displayName: 'Test Bot',
    })

    // Mock successful rotate
    vi.mocked(mockAvatarController.rotate).mockResolvedValue(undefined)
  })

  describe('coordinate-based look', () => {
    it('should execute look with position target', async () => {
      const plan: CommandPlan = {
        kind: 'look',
        target: {
          type: 'position',
          x: 5.0,
          y: 2.0,
          z: -3.0,
        },
      }

      const result = await executor.execute(plan)

      expect(result.success).toBe(true)
      expect(result.message).toContain('Looking at (5.0, 2.0, -3.0)')
      expect(mockAvatarController.rotate).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 0,
          y: expect.any(Number),
          z: 0,
          w: expect.any(Number),
        })
      )
    })

    it('should handle rotation calculation correctly', async () => {
      const plan: CommandPlan = {
        kind: 'look',
        target: {
          type: 'position',
          x: 10.0, // East
          y: 0.0,
          z: 0.0,
        },
      }

      await executor.execute(plan)

      const rotationCall = vi.mocked(mockAvatarController.rotate).mock.calls[0][0]
      
      // Looking east should result in yaw = π/2
      const expectedYaw = Math.atan2(10.0 - 0, 0.0 - 0) // atan2(dx, dz)
      const expectedHalfYaw = expectedYaw * 0.5
      
      expect(rotationCall.x).toBe(0)
      expect(rotationCall.y).toBeCloseTo(Math.sin(expectedHalfYaw), 5)
      expect(rotationCall.z).toBe(0)
      expect(rotationCall.w).toBeCloseTo(Math.cos(expectedHalfYaw), 5)
    })
  })

  describe('user-based look', () => {
    it('should execute look at user', async () => {
      const testUser = {
        sessionId: 'user-1',
        nickname: 'TestPlayer',
        position: { x: -5, y: 1.6, z: 10 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        avatarId: 'user-avatar',
      }

      vi.mocked(mockUserAvatarManager.getUsers).mockReturnValue([testUser])

      const plan: CommandPlan = {
        kind: 'look',
        target: {
          type: 'user',
          id: 'testplayer',
        },
      }

      const result = await executor.execute(plan)

      expect(result.success).toBe(true)
      expect(result.message).toContain('Looking at (-5.0, 1.6, 10.0)')
      expect(mockAvatarController.rotate).toHaveBeenCalled()
    })

    it('should handle user not found', async () => {
      vi.mocked(mockUserAvatarManager.getUsers).mockReturnValue([])

      const plan: CommandPlan = {
        kind: 'look',
        target: {
          type: 'user',
          id: 'nonexistent',
        },
      }

      const result = await executor.execute(plan)

      expect(result.success).toBe(false)
      expect(result.message).toContain('User "nonexistent" not found')
      expect(mockAvatarController.rotate).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should handle avatar not spawned', async () => {
      vi.mocked(mockAvatarController.getState).mockReturnValue(null)

      const plan: CommandPlan = {
        kind: 'look',
        target: {
          type: 'position',
          x: 1,
          y: 2,
          z: 3,
        },
      }

      const result = await executor.execute(plan)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Bot avatar not spawned')
    })

    it('should handle rotation failure', async () => {
      vi.mocked(mockAvatarController.rotate).mockRejectedValue(
        new Error('Network connection lost')
      )

      const plan: CommandPlan = {
        kind: 'look',
        target: {
          type: 'position',
          x: 0,
          y: 0,
          z: 5,
        },
      }

      const result = await executor.execute(plan)

      expect(result.success).toBe(false)
      expect(result.message).toContain('Failed to rotate: Network connection lost')
    })
  })

  describe('nearest target (not implemented)', () => {
    it('should handle nearest target gracefully', async () => {
      const plan: CommandPlan = {
        kind: 'look',
        target: {
          type: 'nearest',
        },
      }

      const result = await executor.execute(plan)

      // nearestはサポートされていない場合の処理
      expect(result.success).toBe(false)
      expect(result.message).toContain('Usage: /look <x> <y> <z> or /look @<username>')
    })
  })

  describe('argument mapping', () => {
    it('should correctly map position arguments', async () => {
      const plan: CommandPlan = {
        kind: 'look',
        target: {
          type: 'position',
          x: 1.23,
          y: 4.56,
          z: -7.89,
        },
      }

      await executor.execute(plan)

      // Check that the rotation calculation uses the correct position
      const rotationCall = vi.mocked(mockAvatarController.rotate).mock.calls[0][0]
      
      // Calculate expected rotation from avatar position (0,1.6,0) to target (1.23,4.56,-7.89)
      const dx = 1.23 - 0
      const dz = -7.89 - 0
      const expectedYaw = Math.atan2(dx, dz)
      const expectedHalfYaw = expectedYaw * 0.5

      expect(rotationCall.y).toBeCloseTo(Math.sin(expectedHalfYaw), 5)
      expect(rotationCall.w).toBeCloseTo(Math.cos(expectedHalfYaw), 5)
    })

    it('should correctly map @username arguments', async () => {
      const testUser = {
        sessionId: 'user-session',
        nickname: 'PlayerName',
        position: { x: 3, y: 2, z: 1 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        avatarId: 'player-avatar',
      }

      vi.mocked(mockUserAvatarManager.getUsers).mockReturnValue([testUser])

      const plan: CommandPlan = {
        kind: 'look',
        target: {
          type: 'user',
          id: 'playername',
        },
      }

      const result = await executor.execute(plan)

      expect(result.success).toBe(true)
      // Should use the user's position
      expect(result.message).toContain('Looking at (3.0, 2.0, 1.0)')
    })
  })

  describe('case sensitivity', () => {
    it('should match usernames case-insensitively', async () => {
      const testUsers = [
        {
          sessionId: 'user1',
          nickname: 'CamelCaseUser',
          position: { x: 1, y: 1, z: 1 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          avatarId: 'avatar1',
        },
        {
          sessionId: 'user2',
          nickname: 'lowercase-user',
          position: { x: 2, y: 2, z: 2 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          avatarId: 'avatar2',
        },
      ]

      vi.mocked(mockUserAvatarManager.getUsers).mockReturnValue(testUsers)

      const plan: CommandPlan = {
        kind: 'look',
        target: {
          type: 'user',
          id: 'camelcase', // lowercase search should find CamelCaseUser
        },
      }

      const result = await executor.execute(plan)

      expect(result.success).toBe(true)
      expect(result.message).toContain('Looking at (1.0, 1.0, 1.0)')
    })
  })
})