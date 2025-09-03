import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DefaultLoggerProvider, registerLoggerProvider } from '../logging/index.js'

// Register logger provider for tests
registerLoggerProvider(new DefaultLoggerProvider(), { allowOverwrite: true })

import type { MockChannel, MockPresence } from '../../../../../test-utils/mocks.js'
import { findChannelCall, findEventBusCall } from '../../../../../test-utils/mocks.js'
import type { IConnectionManager } from '../interfaces/IConnectionManager.js'
import type { IEventBus } from '../interfaces/IEventBus.js'
import { SystemEvents } from '../interfaces/IEventBus.js'
import { PresenceManager } from './PresenceManager.js'

// Mock Phoenix Presence
vi.mock('phoenix', () => {
  const MockPresence = vi.fn().mockImplementation((_channel: unknown) => ({
    onSync: vi.fn(),
    list: vi.fn(),
    onJoin: vi.fn(),
    onLeave: vi.fn(),
  }))

  return { Presence: MockPresence }
})

// Presence list callback type
type PresenceListCallback = (id: string, data: unknown) => void

describe('PresenceManager', () => {
  let presenceManager: PresenceManager
  let mockConnectionManager: IConnectionManager
  let mockEventBus: IEventBus
  let mockChannel: MockChannel
  let mockPresence: MockPresence

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock channel
    mockChannel = {
      on: vi.fn(),
      push: vi.fn(),
      leave: vi.fn(),
      join: vi.fn().mockReturnValue({ receive: vi.fn().mockReturnThis() }),
    }

    // Mock connection manager
    mockConnectionManager = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      joinRoom: vi.fn(),
      getHubChannel: vi.fn(() => mockChannel),
      getAuthChannel: vi.fn(),
      isConnected: vi.fn(() => true),
    }

    // Mock event bus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn(),
    }

    presenceManager = new PresenceManager(mockConnectionManager, mockEventBus)
  })

  describe('constructor and setup', () => {
    it('should register ROOM_JOINED event listener', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(SystemEvents.ROOM_JOINED, expect.any(Function))
    })

    it('should setup presence on room join', async () => {
      const { Presence } = await import('phoenix')

      // Get the ROOM_JOINED handler
      const roomJoinedCall = findEventBusCall(mockEventBus.on, SystemEvents.ROOM_JOINED)
      const roomJoinedHandler = roomJoinedCall?.[1]

      // Simulate room join
      roomJoinedHandler?.()

      expect(Presence).toHaveBeenCalledWith(mockChannel)
      expect(mockChannel.on).toHaveBeenCalledWith('presence_diff', expect.any(Function))
    })

    it('should not setup presence if no channel available', async () => {
      const { Presence } = await import('phoenix')
      mockConnectionManager.getHubChannel = vi.fn(() => null)

      const roomJoinedCall = findEventBusCall(mockEventBus.on, SystemEvents.ROOM_JOINED)
      const roomJoinedHandler = roomJoinedCall?.[1]

      roomJoinedHandler?.()

      expect(Presence).not.toHaveBeenCalled()
    })
  })

  describe('presence sync handling', () => {
    let onSyncCallback: () => void

    beforeEach(async () => {
      const { Presence } = await import('phoenix')

      // Setup presence
      const roomJoinedCall = findEventBusCall(mockEventBus.on, SystemEvents.ROOM_JOINED)
      const roomJoinedHandler = roomJoinedCall?.[1]
      roomJoinedHandler?.()

      // Get the mock presence instance
      mockPresence = (Presence as ReturnType<typeof vi.fn>).mock.results[0].value as MockPresence

      // Get the onSync callback
      onSyncCallback = mockPresence.onSync.mock.calls[0][0]
    })

    it('should handle user joins', () => {
      // Initial sync with no users
      mockPresence.list.mockImplementation(() => {
        // No users initially
      })
      onSyncCallback()

      // Second sync with new user
      mockPresence.list.mockImplementation((callback: PresenceListCallback) => {
        callback('user-123', {
          metas: [
            {
              profile: { displayName: 'TestUser', avatarId: 'avatar-123' },
              permissions: { canChat: true },
              roles: { moderator: true },
            },
          ],
        })
      })
      onSyncCallback()

      expect(mockEventBus.emit).toHaveBeenCalledWith(SystemEvents.USER_JOINED, {
        id: 'user-123',
        profile: { displayName: 'TestUser', avatarId: 'avatar-123' },
        permissions: { canChat: true },
        roles: { moderator: true },
      })
    })

    it('should handle user leaves', () => {
      // Initial sync with user
      mockPresence.list.mockImplementation((callback: PresenceListCallback) => {
        callback('user-123', {
          metas: [
            {
              profile: { displayName: 'TestUser', avatarId: 'avatar-123' },
              permissions: {},
              roles: {},
            },
          ],
        })
      })
      onSyncCallback()

      // Second sync without user
      mockPresence.list.mockImplementation(() => {
        // No users
      })
      onSyncCallback()

      expect(mockEventBus.emit).toHaveBeenCalledWith(SystemEvents.USER_LEFT, {
        id: 'user-123',
        profile: { displayName: 'TestUser', avatarId: 'avatar-123' },
        permissions: {},
        roles: {},
      })
    })

    it('should handle missing metadata gracefully', () => {
      mockPresence.list.mockImplementation((callback: PresenceListCallback) => {
        callback('user-456', {})
      })
      onSyncCallback()

      const users = presenceManager.getUsers()
      expect(users).toHaveLength(1)
      expect(users[0]).toEqual({
        id: 'user-456',
        profile: { displayName: undefined, avatarId: undefined },
        permissions: {},
        roles: {},
      })
    })

    it('should handle partial metadata', () => {
      mockPresence.list.mockImplementation((callback: PresenceListCallback) => {
        callback('user-789', {
          metas: [
            {
              profile: { displayName: 'PartialUser' },
              // Missing permissions and roles
            },
          ],
        })
      })
      onSyncCallback()

      const user = presenceManager.getUser('user-789')
      expect(user).toEqual({
        id: 'user-789',
        profile: { displayName: 'PartialUser', avatarId: undefined },
        permissions: {},
        roles: {},
      })
    })
  })

  describe('event handlers', () => {
    let onSyncCallback: () => void

    beforeEach(async () => {
      const { Presence } = await import('phoenix')

      // Setup presence
      const roomJoinedCall = findEventBusCall(mockEventBus.on, SystemEvents.ROOM_JOINED)
      const roomJoinedHandler = roomJoinedCall?.[1]
      roomJoinedHandler?.()

      mockPresence = (Presence as ReturnType<typeof vi.fn>).mock.results[0].value as MockPresence
      onSyncCallback = mockPresence.onSync.mock.calls[0][0]
    })

    it('should call join handlers when user joins', () => {
      const joinHandler = vi.fn()
      presenceManager.on('join', joinHandler)

      // Sync with new user
      mockPresence.list.mockImplementation((callback: PresenceListCallback) => {
        callback('user-123', {
          metas: [{ profile: { displayName: 'TestUser' } }],
        })
      })
      onSyncCallback()

      expect(joinHandler).toHaveBeenCalledWith({
        id: 'user-123',
        profile: { displayName: 'TestUser', avatarId: undefined },
        permissions: {},
        roles: {},
      })
    })

    it('should call leave handlers when user leaves', () => {
      const leaveHandler = vi.fn()
      presenceManager.on('leave', leaveHandler)

      // Initial sync with user
      mockPresence.list.mockImplementation((callback: PresenceListCallback) => {
        callback('user-123', {
          metas: [{ profile: { displayName: 'TestUser' } }],
        })
      })
      onSyncCallback()

      // Sync without user
      mockPresence.list.mockImplementation(() => undefined)
      onSyncCallback()

      expect(leaveHandler).toHaveBeenCalledWith({
        id: 'user-123',
        profile: { displayName: 'TestUser', avatarId: undefined },
        permissions: {},
        roles: {},
      })
    })

    it('should handle errors in join handlers', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error')
      })
      const normalHandler = vi.fn()

      presenceManager.on('join', errorHandler)
      presenceManager.on('join', normalHandler)

      // Sync with new user
      mockPresence.list.mockImplementation((callback: PresenceListCallback) => {
        callback('user-123', { metas: [{}] })
      })
      onSyncCallback()

      expect(errorHandler).toHaveBeenCalled()
      expect(normalHandler).toHaveBeenCalled()
      // NOTE: エラーログは実装では抑制されているため、テストしない
    })

    it('should handle errors in leave handlers', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error')
      })

      presenceManager.on('leave', errorHandler)

      // Initial sync with user
      mockPresence.list.mockImplementation((callback: PresenceListCallback) => {
        callback('user-123', { metas: [{}] })
      })
      onSyncCallback()

      // Sync without user
      mockPresence.list.mockImplementation(() => undefined)
      onSyncCallback()

      expect(errorHandler).toHaveBeenCalled()
      // NOTE: エラーログは実装では抑制されているため、テストしない
    })
  })

  describe('user queries', () => {
    beforeEach(async () => {
      const { Presence } = await import('phoenix')

      // Setup presence
      const roomJoinedCall = findEventBusCall(mockEventBus.on, SystemEvents.ROOM_JOINED)
      const roomJoinedHandler = roomJoinedCall?.[1]
      roomJoinedHandler?.()

      mockPresence = (Presence as ReturnType<typeof vi.fn>).mock.results[0].value as MockPresence
      const onSyncCallback = mockPresence.onSync.mock.calls[0][0]

      // Sync with multiple users
      mockPresence.list.mockImplementation((callback: PresenceListCallback) => {
        callback('user-123', {
          metas: [{ profile: { displayName: 'User1' } }],
        })
        callback('user-456', {
          metas: [{ profile: { displayName: 'User2' } }],
        })
      })
      onSyncCallback()
    })

    it('should get all users', () => {
      const users = presenceManager.getUsers()

      expect(users).toHaveLength(2)
      expect(users.find((u) => u.id === 'user-123')).toBeDefined()
      expect(users.find((u) => u.id === 'user-456')).toBeDefined()
    })

    it('should get specific user', () => {
      const user = presenceManager.getUser('user-123')

      expect(user).toBeDefined()
      expect(user?.id).toBe('user-123')
      expect(user?.profile.displayName).toBe('User1')
    })

    it('should return undefined for non-existent user', () => {
      expect(presenceManager.getUser('non-existent')).toBeUndefined()
    })

    it('should check user presence', () => {
      expect(presenceManager.isUserPresent('user-123')).toBe(true)
      expect(presenceManager.isUserPresent('user-456')).toBe(true)
      expect(presenceManager.isUserPresent('non-existent')).toBe(false)
    })
  })

  describe('handler management', () => {
    it('should register multiple handlers for same event', async () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      presenceManager.on('join', handler1)
      presenceManager.on('join', handler2)

      // Trigger join event
      const { Presence } = await import('phoenix')
      const roomJoinedCall = findEventBusCall(mockEventBus.on, SystemEvents.ROOM_JOINED)
      const roomJoinedHandler = roomJoinedCall?.[1]
      roomJoinedHandler?.()

      const mockPresenceInstance = (Presence as ReturnType<typeof vi.fn>).mock.results[0]
        .value as MockPresence
      const onSyncCallback = mockPresenceInstance.onSync.mock.calls[0][0]

      mockPresenceInstance.list.mockImplementation((callback: PresenceListCallback) => {
        callback('user-123', { metas: [{}] })
      })
      onSyncCallback()

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })

    it('should unregister specific handler', async () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      presenceManager.on('leave', handler1)
      presenceManager.on('leave', handler2)
      presenceManager.off('leave', handler1)

      // Trigger leave event
      const { Presence } = await import('phoenix')
      const roomJoinedCall = findEventBusCall(mockEventBus.on, SystemEvents.ROOM_JOINED)
      const roomJoinedHandler = roomJoinedCall?.[1]
      roomJoinedHandler?.()

      const mockPresenceInstance = (Presence as ReturnType<typeof vi.fn>).mock.results[0]
        .value as MockPresence
      const onSyncCallback = mockPresenceInstance.onSync.mock.calls[0][0]

      // Initial sync with user
      mockPresenceInstance.list.mockImplementation((callback: PresenceListCallback) => {
        callback('user-123', { metas: [{}] })
      })
      onSyncCallback()

      // Sync without user
      mockPresenceInstance.list.mockImplementation(() => undefined)
      onSyncCallback()

      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })

    it('should handle off for non-existent handler', () => {
      const handler = vi.fn()

      expect(() => presenceManager.off('join', handler)).not.toThrow()
    })
  })

  describe('presence diff handling', () => {
    it('should handle presence diff', () => {
      // Setup presence
      const roomJoinedCall = findEventBusCall(mockEventBus.on, SystemEvents.ROOM_JOINED)
      const roomJoinedHandler = roomJoinedCall?.[1]
      roomJoinedHandler?.()

      // Get presence_diff handler
      const presenceDiffCall = findChannelCall(mockChannel.on, 'presence_diff')
      const presenceDiffHandler = presenceDiffCall?.[1] as (data: unknown) => void

      const diffData = { joins: {}, leaves: {} }

      // Should handle presence diff without error
      expect(() => presenceDiffHandler(diffData)).not.toThrow()
      // NOTE: ログ出力は実装では抑制されているため、テストしない
    })
  })
})
