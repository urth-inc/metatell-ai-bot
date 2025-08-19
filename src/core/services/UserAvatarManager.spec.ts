import { beforeEach, describe, expect, it, vi } from 'vitest'
import { noop } from '../../test-utils/helpers.js'
import { findMockCall } from '../../test-utils/mocks.js'
import type { IEventBus } from '../interfaces/IEventBus.js'
import { SystemEvents } from '../interfaces/IEventBus.js'
import type { IMessageService } from '../interfaces/IMessageService.js'
import type { IPresenceManager } from '../interfaces/IPresenceManager.js'
import { UserAvatarManager } from './UserAvatarManager.js'

describe('UserAvatarManager', () => {
  let userAvatarManager: UserAvatarManager
  let mockMessageService: IMessageService
  let mockPresenceManager: IPresenceManager
  let mockEventBus: IEventBus

  beforeEach(() => {
    // Mock message service
    mockMessageService = {
      sendMessage: vi.fn(),
      sendNAF: vi.fn(),
      sendNAFR: vi.fn(),
      beginTyping: vi.fn(),
      endTyping: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    }

    // Mock presence manager
    mockPresenceManager = {
      getUsers: vi.fn(() => []),
      getUser: vi.fn(),
      isUserPresent: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    }

    // Mock event bus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn(),
    }

    userAvatarManager = new UserAvatarManager(mockMessageService, mockPresenceManager, mockEventBus)
  })

  describe('constructor', () => {
    it('should setup event listeners', () => {
      expect(mockMessageService.on).toHaveBeenCalledWith('naf', expect.any(Function))
      expect(mockMessageService.on).toHaveBeenCalledWith('nafr', expect.any(Function))
      expect(mockPresenceManager.on).toHaveBeenCalledWith('join', expect.any(Function))
      expect(mockPresenceManager.on).toHaveBeenCalledWith('leave', expect.any(Function))
      expect(mockEventBus.on).toHaveBeenCalledWith(SystemEvents.USER_JOINED, expect.any(Function))
      expect(mockEventBus.on).toHaveBeenCalledWith(SystemEvents.USER_LEFT, expect.any(Function))
    })
  })

  describe('NAF message handling', () => {
    it('should handle NAF create message (dataType: u)', () => {
      const nafHandler = findMockCall(
        mockMessageService.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'naf',
      )?.[1] as (data: unknown) => void

      const joinedHandler = vi.fn()
      userAvatarManager.on('userJoined', joinedHandler)

      // Mock presence user data
      mockPresenceManager.getUser = vi.fn().mockReturnValue({
        id: 'user-123',
        profile: { displayName: 'TestUser' },
      })

      // Send NAF create message
      nafHandler({
        dataType: 'u',
        data: {
          networkId: 'user-123',
          owner: 'user-123',
          creator: 'user-123',
          template: '#remote-avatar',
          components: {
            '0': { x: 5, y: 0, z: -3, isVector3: true },
            '1': { x: 0, y: Math.SQRT1_2, z: 0 },
            '3': { avatarSrc: 'https://example.com/avatar?avatar_id=test-avatar' },
          },
        },
      })

      expect(joinedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user-123',
          nickname: 'TestUser',
          position: { x: 5, y: 0, z: -3 },
          avatarId: 'test-avatar',
        }),
      )
    })

    it('should handle NAFR update message (dataType: um)', () => {
      const nafrHandler = findMockCall(
        mockMessageService.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'nafr',
      )?.[1] as (data: unknown) => void

      const movedHandler = vi.fn()
      const updatedHandler = vi.fn()
      userAvatarManager.on('userMoved', movedHandler)
      userAvatarManager.on('userUpdated', updatedHandler)

      // First, create a user with NAF message to establish baseline
      const nafHandler = findMockCall(
        mockMessageService.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'naf',
      )?.[1] as (data: unknown) => void

      nafHandler({
        dataType: 'u',
        data: {
          networkId: 'user-456',
          owner: 'user-456',
          components: {
            '0': { x: 5, y: 0, z: 0 },
          },
        },
      })

      // Clear handlers to check only NAFR updates
      vi.clearAllMocks()

      // Send NAFR update message with position change
      nafrHandler({
        dataType: 'um',
        data: {
          d: [
            {
              networkId: 'user-456',
              owner: 'user-456',
              components: {
                '0': { x: 10, y: 1, z: 5 },
              },
            },
          ],
        },
      })

      expect(movedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user-456',
          position: { x: 10, y: 1, z: 5 },
        }),
      )
    })

    it('should calculate quaternion w component', () => {
      const nafHandler = findMockCall(
        mockMessageService.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'naf',
      )?.[1] as (data: unknown) => void

      nafHandler({
        dataType: 'u',
        data: {
          networkId: 'user-789',
          components: {
            '0': { x: 0, y: 0, z: 0 },
            '1': { x: 0, y: Math.SQRT1_2, z: 0 }, // Should calculate w ≈ 0.707
          },
        },
      })

      const user = userAvatarManager.getUser('user-789')
      expect(user?.rotation?.w).toBeCloseTo(Math.SQRT1_2, 2)
    })

    it('should handle missing user profile gracefully', () => {
      const nafHandler = findMockCall(
        mockMessageService.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'naf',
      )?.[1] as (data: unknown) => void

      mockPresenceManager.getUser = vi.fn().mockReturnValue(undefined)

      nafHandler({
        dataType: 'u',
        data: {
          networkId: 'unknown-user',
          components: {
            '0': { x: 0, y: 0, z: 0 },
          },
        },
      })

      const user = userAvatarManager.getUser('unknown-user')
      expect(user?.nickname).toBe('Unknown')
    })
  })

  describe('presence event handling', () => {
    it('should handle user join from presence', () => {
      const presenceJoinHandler = findMockCall(
        mockPresenceManager.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'join',
      )?.[1] as (user: unknown) => void

      // Presence join only adds user to internal map, no event is emitted
      presenceJoinHandler({
        id: 'new-user',
        profile: { displayName: 'NewUser' },
      })

      // Check that user is added to internal state but no event is emitted yet
      const user = userAvatarManager.getUser('new-user')
      expect(user?.nickname).toBe('NewUser')
      expect(user?.position).toBeNull() // Position is null until NAF message is received
    })

    it('should handle user leave from presence', () => {
      const presenceJoinHandler = findMockCall(
        mockPresenceManager.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'join',
      )?.[1] as (user: unknown) => void
      const presenceLeaveHandler = findMockCall(
        mockPresenceManager.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'leave',
      )?.[1] as (user: unknown) => void

      const leftHandler = vi.fn()
      userAvatarManager.on('userLeft', leftHandler)

      // First join
      presenceJoinHandler({ id: 'leaving-user', profile: { displayName: 'LeavingUser' } })

      // Then leave
      presenceLeaveHandler({ id: 'leaving-user' })

      expect(leftHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'leaving-user',
          nickname: 'LeavingUser',
        }),
      )
    })

    it('should not emit userJoined if user already exists', () => {
      const nafHandler = findMockCall(
        mockMessageService.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'naf',
      )?.[1] as (data: unknown) => void

      const joinedHandler = vi.fn()
      userAvatarManager.on('userJoined', joinedHandler)

      mockPresenceManager.getUser = vi.fn().mockReturnValue({
        id: 'dup-user',
        profile: { displayName: 'DupUser' },
      })

      // Create user twice with NAF message
      nafHandler({
        dataType: 'u',
        data: {
          networkId: 'dup-user',
          components: { '0': { x: 0, y: 0, z: 0 } },
        },
      })

      nafHandler({
        dataType: 'u',
        data: {
          networkId: 'dup-user',
          components: { '0': { x: 1, y: 0, z: 0 } },
        },
      })

      expect(joinedHandler).toHaveBeenCalledTimes(1)
    })
  })

  describe('system event handling', () => {
    it('should handle system USER_JOINED event', () => {
      const systemJoinHandler = findMockCall(
        mockEventBus.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === SystemEvents.USER_JOINED,
      )?.[1] as (data: unknown) => void

      // System event only adds user to internal state, no event is emitted
      systemJoinHandler({ id: 'system-user', profile: { displayName: 'SystemUser' } })

      // Check that user is added to internal state
      const user = userAvatarManager.getUser('system-user')
      expect(user?.nickname).toBe('SystemUser')
      expect(user?.position).toBeNull() // Position is null until NAF message is received
    })

    it('should handle system USER_LEFT event', () => {
      const systemJoinHandler = findMockCall(
        mockEventBus.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === SystemEvents.USER_JOINED,
      )?.[1] as (data: unknown) => void
      const systemLeftHandler = findMockCall(
        mockEventBus.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === SystemEvents.USER_LEFT,
      )?.[1] as (data: unknown) => void

      const leftHandler = vi.fn()
      userAvatarManager.on('userLeft', leftHandler)

      // First join
      systemJoinHandler({ id: 'system-user', profile: { displayName: 'SystemUser' } })

      // Then leave
      systemLeftHandler({ id: 'system-user' })

      expect(leftHandler).toHaveBeenCalled()
    })
  })

  describe('user queries', () => {
    beforeEach(() => {
      // Mock presence manager to return user info
      mockPresenceManager.getUser = vi.fn((userId: string) => {
        const users: Record<string, { id: string; profile: { displayName: string } }> = {
          'user-1': { id: 'user-1', profile: { displayName: 'User1' } },
          'user-2': { id: 'user-2', profile: { displayName: 'User2' } },
          'user-3': { id: 'user-3', profile: { displayName: 'User3' } },
        }
        return users[userId]
      })

      // Add some test users
      const presenceJoinHandler = findMockCall(
        mockPresenceManager.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'join',
      )?.[1] as (user: unknown) => void

      presenceJoinHandler({ id: 'user-1', profile: { displayName: 'User1' } })
      presenceJoinHandler({ id: 'user-2', profile: { displayName: 'User2' } })
      presenceJoinHandler({ id: 'user-3', profile: { displayName: 'User3' } })

      // Update positions via NAF
      const nafHandler = findMockCall(
        mockMessageService.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'naf',
      )?.[1] as (data: unknown) => void

      nafHandler({
        dataType: 'u',
        data: {
          networkId: 'user-1',
          components: { '0': { x: 0, y: 0, z: 0 } },
        },
      })
      nafHandler({
        dataType: 'u',
        data: {
          networkId: 'user-2',
          components: { '0': { x: 5, y: 0, z: 0 } },
        },
      })
      nafHandler({
        dataType: 'u',
        data: {
          networkId: 'user-3',
          components: { '0': { x: 10, y: 0, z: 0 } },
        },
      })
    })

    it('should get all users', () => {
      const users = userAvatarManager.getUsers()
      expect(users).toHaveLength(3)
      expect(users.map((u) => u.id).sort()).toEqual(['user-1', 'user-2', 'user-3'])
    })

    it('should get specific user', () => {
      const user = userAvatarManager.getUser('user-2')
      expect(user).toBeDefined()
      expect(user?.nickname).toBe('User2')
      expect(user?.position.x).toBe(5)
    })

    it('should return undefined for non-existent user', () => {
      expect(userAvatarManager.getUser('non-existent')).toBeUndefined()
    })

    it('should get user count', () => {
      expect(userAvatarManager.getUserCount()).toBe(3)
    })

    it('should get users in range', () => {
      const center = { x: 0, y: 0, z: 0 }

      // Users within 3 units
      const nearbyUsers = userAvatarManager.getUsersInRange(center, 3)
      expect(nearbyUsers).toHaveLength(1)
      expect(nearbyUsers[0].id).toBe('user-1')

      // Users within 7 units
      const midRangeUsers = userAvatarManager.getUsersInRange(center, 7)
      expect(midRangeUsers).toHaveLength(2)
      expect(midRangeUsers.map((u) => u.id).sort()).toEqual(['user-1', 'user-2'])

      // All users
      const allUsers = userAvatarManager.getUsersInRange(center, 15)
      expect(allUsers).toHaveLength(3)
    })
  })

  describe('event handlers', () => {
    it('should emit userUpdated when non-position attributes change', () => {
      const nafHandler = findMockCall(
        mockMessageService.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'naf',
      )?.[1] as (data: unknown) => void

      const updatedHandler = vi.fn()
      userAvatarManager.on('userUpdated', updatedHandler)

      // Create user
      nafHandler({
        dataType: 'u',
        data: {
          networkId: 'update-user',
          components: { '0': { x: 0, y: 0, z: 0 } },
        },
      })

      // Update rotation only
      const nafrHandler = findMockCall(
        mockMessageService.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'nafr',
      )?.[1] as (data: unknown) => void

      nafrHandler({
        dataType: 'um',
        data: {
          d: [
            {
              networkId: 'update-user',
              components: { '1': { x: 0, y: 1, z: 0 } },
            },
          ],
        },
      })

      expect(updatedHandler).toHaveBeenCalled()
    })

    it('should handle multiple event handlers', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      userAvatarManager.on('userJoined', handler1)
      userAvatarManager.on('userJoined', handler2)

      const nafHandler = findMockCall(
        mockMessageService.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'naf',
      )?.[1] as (data: unknown) => void

      mockPresenceManager.getUser = vi.fn().mockReturnValue({
        id: 'multi-handler-user',
        profile: { displayName: 'MultiUser' },
      })

      nafHandler({
        dataType: 'u',
        data: {
          networkId: 'multi-handler-user',
          components: { '0': { x: 0, y: 0, z: 0 } },
        },
      })

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })

    it('should unregister event handlers', () => {
      const handler = vi.fn()

      userAvatarManager.on('userLeft', handler)
      userAvatarManager.off('userLeft', handler)

      const presenceLeaveHandler = findMockCall(
        mockPresenceManager.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'leave',
      )?.[1] as (user: unknown) => void

      presenceLeaveHandler({ id: 'some-user' })

      expect(handler).not.toHaveBeenCalled()
    })

    it('should handle errors in event handlers', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(noop)
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error')
      })
      const normalHandler = vi.fn()

      userAvatarManager.on('userJoined', errorHandler)
      userAvatarManager.on('userJoined', normalHandler)

      const nafHandler = findMockCall(
        mockMessageService.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'naf',
      )?.[1] as (data: unknown) => void

      mockPresenceManager.getUser = vi.fn().mockReturnValue({
        id: 'error-test-user',
        profile: { displayName: 'ErrorUser' },
      })

      nafHandler({
        dataType: 'u',
        data: {
          networkId: 'error-test-user',
          components: { '0': { x: 0, y: 0, z: 0 } },
        },
      })

      expect(errorHandler).toHaveBeenCalled()
      expect(normalHandler).toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in userJoined handler:',
        expect.any(Error),
      )

      consoleErrorSpy.mockRestore()
    })
  })

  describe('avatar ID extraction', () => {
    it('should extract avatar ID from avatar URL', () => {
      const nafHandler = findMockCall(
        mockMessageService.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'naf',
      )?.[1] as (data: unknown) => void

      mockPresenceManager.getUser = vi.fn().mockReturnValue({
        id: 'avatar-test-user',
        profile: { displayName: 'AvatarUser' },
      })

      nafHandler({
        dataType: 'u',
        data: {
          networkId: 'avatar-test-user',
          components: {
            '0': { x: 0, y: 0, z: 0 }, // Position is required
            '3': {
              avatarSrc: 'https://example.com/avatar?avatar_id=custom-avatar-123&other=param',
            },
          },
        },
      })

      const user = userAvatarManager.getUser('avatar-test-user')
      expect(user?.avatarId).toBe('custom-avatar-123')
    })

    it('should handle avatar URL without avatar_id', () => {
      const nafHandler = findMockCall(
        mockMessageService.on as ReturnType<typeof vi.fn>,
        (call) => call[0] === 'naf',
      )?.[1] as (data: unknown) => void

      mockPresenceManager.getUser = vi.fn().mockReturnValue({
        id: 'no-avatar-id-user',
        profile: { displayName: 'NoAvatarUser' },
      })

      nafHandler({
        dataType: 'u',
        data: {
          networkId: 'no-avatar-id-user',
          components: {
            '0': { x: 0, y: 0, z: 0 }, // Position is required
            '3': { avatarSrc: 'https://example.com/avatar' },
          },
        },
      })

      const user = userAvatarManager.getUser('no-avatar-id-user')
      expect(user?.avatarId).toBeUndefined()
    })
  })
})
