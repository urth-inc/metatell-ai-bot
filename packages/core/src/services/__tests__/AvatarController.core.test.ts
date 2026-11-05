/**
 * Core functionality tests for AvatarController
 * Tests spawn, move, rotate, updateState, and resyncAvatar methods
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IAnimationService } from '../../interfaces/IAnimationService.js'
import type { AvatarState, Position, Rotation } from '../../interfaces/IAvatarController.js'
import type { IConfigurationProvider } from '../../interfaces/IConfigurationProvider.js'
import type { IEventBus } from '../../interfaces/IEventBus.js'
import { SystemEvents } from '../../interfaces/IEventBus.js'
import type { IMessageService } from '../../interfaces/IMessageService.js'
import { AvatarController } from '../AvatarController.js'

// Mock the logger
vi.mock('../../logging/index.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

describe('AvatarController - Core Functionality', () => {
  let avatarController: AvatarController
  let mockMessageService: IMessageService
  let mockConfigProvider: IConfigurationProvider
  let mockEventBus: IEventBus
  let mockAnimationService: IAnimationService

  const mockConfig = {
    profile: {
      displayName: 'Test User',
      avatarId: 'test-avatar-id',
    },
    hubUrl: 'https://test-hub.com',
    storageUrl: 'https://test-storage.com',
    hubId: 'test-hub',
  }

  const testPosition: Position = { x: 1, y: 2, z: 3 }
  const testRotation: Rotation = { x: 0, y: 0, z: 0, w: 1 }

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Mock dependencies
    mockMessageService = {
      sendNAF: vi.fn().mockResolvedValue(undefined),
      sendNAFR: vi.fn().mockResolvedValue(undefined),
      onMessage: vi.fn(),
    } as unknown as IMessageService

    mockConfigProvider = {
      getConfiguration: vi.fn().mockReturnValue(mockConfig),
    } as unknown as IConfigurationProvider

    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    }

    mockAnimationService = {
      setCurrentAvatarId: vi.fn(),
      getAvailableAnimations: vi.fn(),
      loadAnimation: vi.fn(),
    } as unknown as IAnimationService

    avatarController = new AvatarController(
      mockMessageService,
      mockConfigProvider,
      mockEventBus,
      mockAnimationService,
    )

    // Simulate room joined to set session ID
    const roomJoinedCallback = vi
      .mocked(mockEventBus.on)
      .mock.calls.find((call) => call[0] === SystemEvents.ROOM_JOINED)?.[1]
    roomJoinedCallback?.({ session_id: 'test-session-123' })
  })

  describe('spawn', () => {
    it('should throw error when not connected to room', async () => {
      const controllerNoSession = new AvatarController(
        mockMessageService,
        mockConfigProvider,
        mockEventBus,
        mockAnimationService,
      )

      await expect(controllerNoSession.spawn('test-avatar')).rejects.toThrow(
        'Cannot spawn avatar: Not connected to room',
      )
    })

    it('should create and send NAF messages with correct parameters', async () => {
      await avatarController.spawn('test-avatar', testPosition)

      // Only one spawn message now

      expect(mockMessageService.sendNAFR).toHaveBeenCalledWith(
        expect.objectContaining({
          dataType: 'u',
          data: expect.objectContaining({
            isFirstSync: true,
            components: expect.objectContaining({ '0': testPosition }),
          }),
        }),
      )

      // Verify message service calls (spawn now uses sendNAFR for reliable delivery)
      expect(mockMessageService.sendNAFR).toHaveBeenCalledTimes(1)
    })

    it('should update internal state correctly', async () => {
      await avatarController.spawn('test-avatar', testPosition)

      const state = avatarController.getState()
      expect(state).not.toBeNull()
      expect(state?.networkId).toBe('test-session-123')
      expect(state?.position).toEqual(testPosition)
      expect(state?.avatarId).toBe('test-avatar')
      expect(state?.displayName).toBe('Test User')
    })

    it('should emit AVATAR_SPAWNED event', async () => {
      await avatarController.spawn('test-avatar', testPosition)

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        SystemEvents.AVATAR_SPAWNED,
        expect.objectContaining({
          avatarId: 'test-avatar',
          position: testPosition,
        }),
      )
    })

    it('should set current avatar ID in animation service', async () => {
      await avatarController.spawn('test-avatar', testPosition)

      expect(mockAnimationService.setCurrentAvatarId).toHaveBeenCalledWith('test-avatar')
      const setAvatarCallOrder = vi.mocked(mockAnimationService.setCurrentAvatarId).mock
        .invocationCallOrder[0]
      const spawnedEventCall = vi
        .mocked(mockEventBus.emit)
        .mock.calls.findIndex((call) => call[0] === SystemEvents.AVATAR_SPAWNED)
      const spawnedEventCallOrder = vi.mocked(mockEventBus.emit).mock.invocationCallOrder[
        spawnedEventCall
      ]
      expect(setAvatarCallOrder).toBeLessThan(spawnedEventCallOrder)
    })

    it('should use default position when not provided', async () => {
      await avatarController.spawn('test-avatar')
      expect(avatarController.getState()?.position).toEqual({ x: 0, y: 0.2, z: 0 })
    })

    it('should throw error for organization avatar without avatarSrc', async () => {
      const organizationAvatarId = '123e4567-e89b-12d3-a456-426614174000' // Valid UUID

      await expect(avatarController.spawn(organizationAvatarId)).rejects.toThrow(
        'Organization avatar requires avatarSrc URL',
      )
    })
  })

  describe('move', () => {
    beforeEach(async () => {
      await avatarController.spawn('test-avatar', { x: 0, y: 0, z: 0 })
      vi.clearAllMocks()
    })

    it('should throw error when avatar is not spawned', async () => {
      const unspawnedController = new AvatarController(
        mockMessageService,
        mockConfigProvider,
        mockEventBus,
        mockAnimationService,
      )

      await expect(unspawnedController.move(testPosition)).rejects.toThrow('Avatar not spawned')
    })

    it('should create and send NAF message with correct position', async () => {
      await avatarController.move(testPosition)

      expect(mockMessageService.sendNAF).toHaveBeenCalledTimes(1)
    })

    it('should update internal state position', async () => {
      await avatarController.move(testPosition)

      const state = avatarController.getState()
      expect(state?.position).toEqual(testPosition)
    })

    it('should emit AVATAR_MOVED event', async () => {
      await avatarController.move(testPosition)

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        SystemEvents.AVATAR_MOVED,
        expect.objectContaining({ position: testPosition }),
      )
    })
  })

  describe('rotate', () => {
    beforeEach(async () => {
      await avatarController.spawn('test-avatar', { x: 0, y: 0, z: 0 })
      vi.clearAllMocks()
    })

    it('should throw error when avatar is not spawned', async () => {
      const unspawnedController = new AvatarController(
        mockMessageService,
        mockConfigProvider,
        mockEventBus,
        mockAnimationService,
      )

      await expect(unspawnedController.rotate(testRotation)).rejects.toThrow('Avatar not spawned')
    })

    it('should create and send NAF message with rotation', async () => {
      await avatarController.rotate(testRotation)

      expect(mockMessageService.sendNAF).toHaveBeenCalledTimes(1)
    })

    it('should update internal state rotation', async () => {
      await avatarController.rotate(testRotation)

      const state = avatarController.getState()
      expect(state?.rotation).toEqual(testRotation)
    })

    it('should emit AVATAR_UPDATED event', async () => {
      await avatarController.rotate(testRotation)

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        SystemEvents.AVATAR_UPDATED,
        expect.objectContaining({ rotation: testRotation }),
      )
    })
  })

  describe('updateState', () => {
    beforeEach(async () => {
      await avatarController.spawn('test-avatar', { x: 0, y: 0, z: 0 })
      vi.clearAllMocks()
    })

    it('should throw error when avatar is not spawned', async () => {
      const unspawnedController = new AvatarController(
        mockMessageService,
        mockConfigProvider,
        mockEventBus,
        mockAnimationService,
      )

      await expect(unspawnedController.updateState({})).rejects.toThrow('Avatar not spawned')
    })

    it('should create and send NAF message with state updates', async () => {
      const partialState: Partial<AvatarState> = {
        position: testPosition,
        rotation: testRotation,
      }

      await avatarController.updateState(partialState)

      expect(mockMessageService.sendNAF).toHaveBeenCalledTimes(1)
    })

    it('should update internal state with partial updates', async () => {
      const partialState: Partial<AvatarState> = {
        position: testPosition,
      }

      await avatarController.updateState(partialState)

      const state = avatarController.getState()
      expect(state?.position).toEqual(testPosition)
      expect(state?.avatarId).toBe('test-avatar') // Original value preserved
    })

    it('should emit AVATAR_UPDATED event', async () => {
      const partialState: Partial<AvatarState> = { position: testPosition }

      await avatarController.updateState(partialState)

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        SystemEvents.AVATAR_UPDATED,
        expect.objectContaining({ position: testPosition }),
      )
    })

    it('should handle avatar updates in state', async () => {
      const partialState: Partial<AvatarState> = {
        avatarSrc: 'https://new-avatar-source.com/avatar.gltf',
      }

      await avatarController.updateState(partialState)

      const state = avatarController.getState()
      expect(state?.avatarSrc).toBe('https://new-avatar-source.com/avatar.gltf')
    })

    it('should update animation context when the avatar ID changes', async () => {
      await avatarController.updateState({ avatarId: 'new-avatar-id' })

      expect(mockAnimationService.setCurrentAvatarId).toHaveBeenCalledWith('new-avatar-id')
    })
  })

  describe('resyncAvatar', () => {
    beforeEach(async () => {
      await avatarController.spawn('test-avatar', testPosition)
      vi.clearAllMocks()
    })

    it('should throw error when avatar is not spawned', async () => {
      const unspawnedController = new AvatarController(
        mockMessageService,
        mockConfigProvider,
        mockEventBus,
        mockAnimationService,
      )

      await expect(unspawnedController.resyncAvatar()).rejects.toThrow('Avatar not spawned')
    })

    it('should send NAFR message with isFirstSync: true', async () => {
      await avatarController.resyncAvatar()

      expect(mockMessageService.sendNAFR).toHaveBeenCalledTimes(1)
    })

    it('should include complete avatar state in resync', async () => {
      await avatarController.resyncAvatar()
      expect(mockMessageService.sendNAFR).toHaveBeenCalledWith(
        expect.objectContaining({
          dataType: 'u',
          data: expect.objectContaining({
            isFirstSync: true,
            components: expect.objectContaining({
              '0': testPosition,
              '3': expect.objectContaining({ avatarSrc: expect.stringContaining('test-avatar') }),
            }),
          }),
        }),
      )
    })
  })

  describe('error handling for unspawned avatar', () => {
    it('should throw consistent error messages for all methods', async () => {
      const unspawnedController = new AvatarController(
        mockMessageService,
        mockConfigProvider,
        mockEventBus,
        mockAnimationService,
      )

      await expect(unspawnedController.move(testPosition)).rejects.toThrow('Avatar not spawned')
      await expect(unspawnedController.rotate(testRotation)).rejects.toThrow('Avatar not spawned')
      await expect(unspawnedController.updateState({})).rejects.toThrow('Avatar not spawned')
      await expect(unspawnedController.resyncAvatar()).rejects.toThrow('Avatar not spawned')
    })
  })

  describe('state management', () => {
    it('should initialize with null state', () => {
      const state = avatarController.getState()
      expect(state).toBeNull()
    })

    it('should preserve state across multiple operations', async () => {
      await avatarController.spawn('test-avatar', testPosition)
      await avatarController.move({ x: 10, y: 20, z: 30 })
      await avatarController.rotate({ x: 0.5, y: 0.5, z: 0.5, w: 0.5 })

      const state = avatarController.getState()
      expect(state).toEqual(
        expect.objectContaining({
          avatarId: 'test-avatar',
          position: { x: 10, y: 20, z: 30 },
          rotation: { x: 0.5, y: 0.5, z: 0.5, w: 0.5 },
          networkId: 'test-session-123',
          displayName: 'Test User',
        }),
      )
    })

    it('should handle destroy by clearing state', async () => {
      await avatarController.spawn('test-avatar', testPosition)
      await avatarController.destroy()

      const state = avatarController.getState()
      expect(state).toBeNull()
    })
  })

  describe('avatar ID format detection', () => {
    it('should detect organization avatars (UUID format)', async () => {
      const organizationAvatarId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

      await expect(avatarController.spawn(organizationAvatarId)).rejects.toThrow(
        'Organization avatar requires avatarSrc URL',
      )
    })

    it('should handle individual avatars (non-UUID format)', async () => {
      await expect(avatarController.spawn('Esajk7B', testPosition)).resolves.not.toThrow()

      const state = avatarController.getState()
      expect(state?.avatarId).toBe('Esajk7B')
    })

    it('should reject malformed UUID as individual avatar', async () => {
      await expect(avatarController.spawn('not-a-uuid', testPosition)).resolves.not.toThrow()

      const state = avatarController.getState()
      expect(state?.avatarId).toBe('not-a-uuid')
    })

    it('should handle organization avatar with avatarSrc', async () => {
      const organizationAvatarId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      const avatarSrc = 'https://example.com/org-avatar.gltf'

      await expect(
        avatarController.spawn(organizationAvatarId, testPosition, avatarSrc),
      ).resolves.not.toThrow()

      const state = avatarController.getState()
      expect(state?.avatarId).toBe(organizationAvatarId)
      expect(state?.avatarSrc).toBe(avatarSrc)
    })
  })
})
