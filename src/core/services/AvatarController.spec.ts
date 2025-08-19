import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findEventBusCall } from '../../test-utils/mocks.js'
import type {
  BotConfiguration,
  IConfigurationProvider,
} from '../interfaces/IConfigurationProvider.js'
import type { IEventBus } from '../interfaces/IEventBus.js'
import { SystemEvents } from '../interfaces/IEventBus.js'
import type { IMessageService } from '../interfaces/IMessageService.js'
import { AvatarController } from './AvatarController.js'

describe('AvatarController', () => {
  let avatarController: AvatarController
  let mockMessageService: IMessageService
  let mockConfigProvider: IConfigurationProvider
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
            profile: { displayName: 'TestBot', avatarId: 'test-avatar' },
          }) as BotConfiguration,
      ),
      updateProfile: vi.fn(),
      updateContext: vi.fn(),
    }

    // Mock event bus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn(),
    }

    avatarController = new AvatarController(mockMessageService, mockConfigProvider, mockEventBus)
  })

  describe('constructor', () => {
    it('should register ROOM_JOINED event listener', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(SystemEvents.ROOM_JOINED, expect.any(Function))
    })

    it('should set session ID when room is joined', () => {
      const roomJoinedCall = findEventBusCall(mockEventBus.on, SystemEvents.ROOM_JOINED)
      const roomJoinedHandler = roomJoinedCall?.[1]

      roomJoinedHandler?.({ session_id: 'test-session-123' })

      // Verify session ID is set by trying to spawn
      avatarController.spawn('avatar-123').catch(() => undefined)
      expect(mockMessageService.sendNAF).toHaveBeenCalled()
    })
  })

  describe('spawn', () => {
    beforeEach(() => {
      // Simulate room joined
      const roomJoinedCall = findEventBusCall(mockEventBus.on, SystemEvents.ROOM_JOINED)
      const roomJoinedHandler = roomJoinedCall?.[1]
      roomJoinedHandler?.({ session_id: 'test-session-123' })
    })

    it('should spawn avatar with default position', async () => {
      await avatarController.spawn('avatar-123')

      expect(mockMessageService.sendNAF).toHaveBeenCalledWith({
        dataType: 'u',
        data: expect.objectContaining({
          networkId: 'test-session-123',
          owner: 'test-session-123',
          creator: 'test-session-123',
          template: '#remote-avatar',
          components: expect.objectContaining({
            '0': { isVector3: true, x: 0, y: 0.2, z: 0 },
          }),
        }),
      })

      expect(mockMessageService.sendNAFR).toHaveBeenCalled()
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        SystemEvents.AVATAR_SPAWNED,
        expect.any(Object),
      )
    })

    it('should spawn avatar with custom position', async () => {
      const customPosition = { x: 5, y: 1, z: -3 }
      await avatarController.spawn('avatar-456', customPosition)

      expect(mockMessageService.sendNAF).toHaveBeenCalledWith({
        dataType: 'u',
        data: expect.objectContaining({
          components: expect.objectContaining({
            '0': { isVector3: true, ...customPosition },
          }),
        }),
      })
    })

    it('should throw error when not connected to room', async () => {
      const newController = new AvatarController(
        mockMessageService,
        mockConfigProvider,
        mockEventBus,
      )

      await expect(newController.spawn('avatar-123')).rejects.toThrow(
        'Cannot spawn avatar: Not connected to room',
      )
    })

    it('should set correct avatar state', async () => {
      await avatarController.spawn('avatar-789')

      const state = avatarController.getState()
      expect(state).toMatchObject({
        networkId: 'test-session-123',
        position: { x: 0, y: 0.2, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        avatarId: 'avatar-789',
        displayName: 'TestBot',
      })
      expect(state?.avatarSrc).toContain('avatar-789')
    })
  })

  describe('move', () => {
    beforeEach(async () => {
      // Setup: join room and spawn avatar
      const roomJoinedCall = findEventBusCall(mockEventBus.on, SystemEvents.ROOM_JOINED)
      const roomJoinedHandler = roomJoinedCall?.[1]
      roomJoinedHandler?.({ session_id: 'test-session-123' })
      await avatarController.spawn('avatar-123')

      // Clear previous calls
      vi.clearAllMocks()
    })

    it('should move avatar to new position', async () => {
      const newPosition = { x: 10, y: 0, z: -5 }
      await avatarController.move(newPosition)

      expect(mockMessageService.sendNAFR).toHaveBeenCalledWith({
        dataType: 'um',
        data: {
          d: [
            {
              networkId: 'test-session-123',
              owner: 'test-session-123',
              creator: 'test-session-123',
              lastOwnerTime: expect.any(Number),
              template: '#remote-avatar',
              persistent: false,
              parent: null,
              components: {
                '0': { isVector3: true, ...newPosition },
              },
            },
          ],
        },
      })

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        SystemEvents.AVATAR_MOVED,
        expect.objectContaining({
          position: newPosition,
        }),
      )
    })

    it('should update internal state when moving', async () => {
      const newPosition = { x: 2, y: 1, z: 3 }
      await avatarController.move(newPosition)

      const state = avatarController.getState()
      expect(state?.position).toEqual(newPosition)
    })

    it('should throw error when avatar not spawned', async () => {
      const newController = new AvatarController(
        mockMessageService,
        mockConfigProvider,
        mockEventBus,
      )

      await expect(newController.move({ x: 0, y: 0, z: 0 })).rejects.toThrow('Avatar not spawned')
    })
  })

  describe('rotate', () => {
    beforeEach(async () => {
      // Setup: join room and spawn avatar
      const roomJoinedCall = findEventBusCall(mockEventBus.on, SystemEvents.ROOM_JOINED)
      const roomJoinedHandler = roomJoinedCall?.[1]
      roomJoinedHandler?.({ session_id: 'test-session-123' })
      await avatarController.spawn('avatar-123')

      vi.clearAllMocks()
    })

    it('should rotate avatar', async () => {
      const newRotation = { x: 0, y: Math.PI / 2, z: 0, w: Math.SQRT1_2 }
      await avatarController.rotate(newRotation)

      expect(mockMessageService.sendNAFR).toHaveBeenCalledWith({
        dataType: 'um',
        data: {
          d: [
            {
              networkId: 'test-session-123',
              owner: 'test-session-123',
              creator: 'test-session-123',
              lastOwnerTime: expect.any(Number),
              template: '#remote-avatar',
              persistent: false,
              parent: null,
              components: {
                '14': { x: 0, y: 45, z: 0 }, // クォータニオン(0, √2/2, 0, √2/2)のY軸90度回転をオイラー角に変換
              },
            },
          ],
        },
      })

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        SystemEvents.AVATAR_UPDATED,
        expect.any(Object),
      )
    })

    it('should update internal rotation state', async () => {
      const newRotation = { x: 0.1, y: 0.2, z: 0.3, w: 0.9 }
      await avatarController.rotate(newRotation)

      const state = avatarController.getState()
      expect(state?.rotation).toEqual(newRotation)
    })

    it('should throw error when avatar not spawned', async () => {
      const newController = new AvatarController(
        mockMessageService,
        mockConfigProvider,
        mockEventBus,
      )

      await expect(newController.rotate({ x: 0, y: 0, z: 0, w: 1 })).rejects.toThrow(
        'Avatar not spawned',
      )
    })
  })

  describe('updateState', () => {
    beforeEach(async () => {
      // Setup: join room and spawn avatar
      const roomJoinedCall = findEventBusCall(mockEventBus.on, SystemEvents.ROOM_JOINED)
      const roomJoinedHandler = roomJoinedCall?.[1]
      roomJoinedHandler?.({ session_id: 'test-session-123' })
      await avatarController.spawn('avatar-123')

      vi.clearAllMocks()
    })

    it('should update position only', async () => {
      const updates = { position: { x: 1, y: 2, z: 3 } }
      await avatarController.updateState(updates)

      const sendNAFRMock = mockMessageService.sendNAFR as ReturnType<typeof vi.fn>
      const sentData = sendNAFRMock.mock.calls[0][0] as {
        data: { d: Array<{ components: Record<string, unknown> }> }
      }
      expect(sentData.data.d[0].components).toHaveProperty('0', {
        isVector3: true,
        ...updates.position,
      })
      expect(sentData.data.d[0].components).not.toHaveProperty('1')
    })

    it('should update rotation only', async () => {
      const updates = { rotation: { x: 0.1, y: 0.2, z: 0.3, w: 0.9 } }
      await avatarController.updateState(updates)

      const sendNAFRMock = mockMessageService.sendNAFR as ReturnType<typeof vi.fn>
      const sentData = sendNAFRMock.mock.calls[0][0] as {
        data: { d: Array<{ components: Record<string, unknown> }> }
      }
      expect(sentData.data.d[0].components).toHaveProperty('14', {
        x: 0, // pitch
        y: expect.any(Number), // yaw in degrees
        z: 0, // roll
      })
      expect(sentData.data.d[0].components).not.toHaveProperty('0')
    })

    it('should update avatar source', async () => {
      const updates = { avatarId: 'new-avatar-456' }
      await avatarController.updateState(updates)

      const sendNAFRMock = mockMessageService.sendNAFR as ReturnType<typeof vi.fn>
      const sentData = sendNAFRMock.mock.calls[0][0] as {
        data: { d: Array<{ components: Record<string, unknown> }> }
      }
      expect(sentData.data.d[0].components).toHaveProperty(
        '3',
        expect.objectContaining({
          avatarType: 'skinnable',
          muted: false,
          isSharingAvatarCamera: false,
        }),
      )
    })

    it('should update multiple properties', async () => {
      const updates = {
        position: { x: 5, y: 5, z: 5 },
        rotation: { x: 1, y: 0, z: 0, w: 0 },
        avatarSrc: 'https://custom.avatar.url',
      }
      await avatarController.updateState(updates)

      const sendNAFRMock = mockMessageService.sendNAFR as ReturnType<typeof vi.fn>
      const sentData = sendNAFRMock.mock.calls[0][0] as {
        data: { d: Array<{ components: Record<string, unknown> }> }
      }
      expect(sentData.data.d[0].components).toHaveProperty('0')
      expect(sentData.data.d[0].components).toHaveProperty('1')
      expect(sentData.data.d[0].components).toHaveProperty('3')
    })

    it('should merge state updates', async () => {
      const originalState = avatarController.getState()
      const updates = { displayName: 'UpdatedBot' }

      await avatarController.updateState(updates)

      const newState = avatarController.getState()
      expect(newState?.displayName).toBe('UpdatedBot')
      expect(newState?.position).toEqual(originalState?.position)
      expect(newState?.avatarId).toEqual(originalState?.avatarId)
    })

    it('should throw error when avatar not spawned', async () => {
      const newController = new AvatarController(
        mockMessageService,
        mockConfigProvider,
        mockEventBus,
      )

      await expect(newController.updateState({ position: { x: 0, y: 0, z: 0 } })).rejects.toThrow(
        'Avatar not spawned',
      )
    })
  })

  describe('getState', () => {
    it('should return null when avatar not spawned', () => {
      expect(avatarController.getState()).toBeNull()
    })

    it('should return copy of avatar state', async () => {
      // Setup: join room and spawn avatar
      const roomJoinedCall = findEventBusCall(mockEventBus.on, SystemEvents.ROOM_JOINED)
      const roomJoinedHandler = roomJoinedCall?.[1]
      roomJoinedHandler?.({ session_id: 'test-session-123' })
      await avatarController.spawn('avatar-123')

      const state1 = avatarController.getState()
      const state2 = avatarController.getState()

      expect(state1).toEqual(state2)
      expect(state1).not.toBe(state2) // Different object references
    })
  })

  describe('destroy', () => {
    it('should clear avatar state', async () => {
      // Setup: join room and spawn avatar
      const roomJoinedCall = findEventBusCall(mockEventBus.on, SystemEvents.ROOM_JOINED)
      const roomJoinedHandler = roomJoinedCall?.[1]
      roomJoinedHandler?.({ session_id: 'test-session-123' })
      await avatarController.spawn('avatar-123')

      expect(avatarController.getState()).not.toBeNull()

      await avatarController.destroy()

      expect(avatarController.getState()).toBeNull()
    })

    it('should handle destroy when avatar not spawned', async () => {
      await expect(avatarController.destroy()).resolves.not.toThrow()
    })
  })
})
