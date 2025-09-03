import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DefaultLoggerProvider } from '../../../sdk/logging/providers/default.js'
import { registerLoggerProvider } from '../../../sdk/logging/spi.js'
import { AnimationNotFoundError, AvatarNotSpawnedError } from '../../errors/animation-errors.js'
import type { IAnimationService } from '../../interfaces/IAnimationService.js'
import type { IConfigurationProvider } from '../../interfaces/IConfigurationProvider.js'
import type { IEventBus } from '../../interfaces/IEventBus.js'
import { SystemEvents } from '../../interfaces/IEventBus.js'
import type { IMessageService } from '../../interfaces/IMessageService.js'
import type { AnimationPlayOptions } from '../../types/animation.js'
import { AvatarController } from '../AvatarController.js'

// Mock services
const mockMessageService: IMessageService = {
  sendMessage: vi.fn(),
  sendNAF: vi.fn(),
  sendNAFR: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}

const mockConfigProvider: IConfigurationProvider = {
  getConfiguration: vi.fn(() => ({
    storageUrl: 'https://storage.metatell.app:443',
    profile: {
      displayName: 'Test Bot',
      avatarId: 'test-avatar',
    },
    debug: false,
  })),
  updateConfiguration: vi.fn(),
  validate: vi.fn(),
}

const mockEventBus: IEventBus = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  once: vi.fn(),
  removeAllListeners: vi.fn(),
}

const mockAnimationService: IAnimationService = {
  getAvailableAnimations: vi.fn(),
  loadAnimation: vi.fn(),
  validateAnimation: vi.fn(),
}

describe('AvatarController - Animation Features', () => {
  let controller: AvatarController
  const sessionId = 'test-session-id'
  const avatarId = 'test-avatar-id'

  beforeAll(() => {
    // Register logger provider for tests
    registerLoggerProvider(new DefaultLoggerProvider())
  })

  beforeEach(async () => {
    vi.clearAllMocks()

    controller = new AvatarController(
      mockMessageService,
      mockConfigProvider,
      mockEventBus,
      mockAnimationService,
    )

    // Simulate room joined event to set session ID
    const onCallback = vi
      .mocked(mockEventBus.on)
      .mock.calls.find((call) => call[0] === SystemEvents.ROOM_JOINED)?.[1]
    if (onCallback) {
      onCallback({ session_id: sessionId })
    }

    // Mock successful NAF messages
    vi.mocked(mockMessageService.sendNAF).mockResolvedValue(undefined)
    vi.mocked(mockMessageService.sendNAFR).mockResolvedValue(undefined)

    // Spawn avatar to enable animation methods
    await controller.spawn(avatarId, { x: 0, y: 0, z: 0 })

    vi.clearAllMocks()
  })

  describe('playAnimation', () => {
    it('should throw error if avatar not spawned', async () => {
      const newController = new AvatarController(
        mockMessageService,
        mockConfigProvider,
        mockEventBus,
        mockAnimationService,
      )

      await expect(newController.playAnimation('test-animation')).rejects.toThrow(
        AvatarNotSpawnedError,
      )
    })

    it('should validate animation exists', async () => {
      vi.mocked(mockAnimationService.validateAnimation).mockResolvedValueOnce(false)

      await expect(controller.playAnimation('invalid-animation')).rejects.toThrow(
        AnimationNotFoundError,
      )

      expect(mockAnimationService.validateAnimation).toHaveBeenCalledWith('invalid-animation')
    })

    it('should send animation NAF message', async () => {
      const animationId = 'greeting'
      const options: AnimationPlayOptions = {
        loop: false,
        timeScale: 1.5,
      }

      vi.mocked(mockAnimationService.validateAnimation).mockResolvedValueOnce(true)
      vi.mocked(mockAnimationService.loadAnimation).mockResolvedValueOnce({
        id: animationId,
        name: 'Greeting',
        type: 'preset',
        duration: 2000,
        loop: false,
      })

      const result = await controller.playAnimation(animationId, options)

      expect(result).toMatchObject({
        animationId,
        playbackId: expect.any(String),
        startedAt: expect.any(Number),
        expectedDuration: 2000 / 1.5, // duration / timeScale
      })

      expect(mockMessageService.sendNAFR).toHaveBeenCalledWith(
        expect.objectContaining({
          dataType: 'um',
          data: expect.objectContaining({
            d: expect.arrayContaining([
              expect.objectContaining({
                components: expect.objectContaining({
                  13: expect.objectContaining({
                    status: animationId,
                    animationRunId: result.playbackId,
                  }),
                }),
              }),
            ]),
          }),
        }),
      )
    })

    it('should emit animation:played event', async () => {
      const animationId = 'dance'

      vi.mocked(mockAnimationService.validateAnimation).mockResolvedValueOnce(true)

      const result = await controller.playAnimation(animationId)

      expect(mockEventBus.emit).toHaveBeenCalledWith('animation:played', {
        animationId,
        playbackId: result.playbackId,
        options: undefined,
      })
    })

    it('should update internal state', async () => {
      const animationId = 'walking'

      vi.mocked(mockAnimationService.validateAnimation).mockResolvedValueOnce(true)

      await controller.playAnimation(animationId)

      expect(controller.getCurrentAnimation()).toBe(animationId)

      const state = controller.getState()
      expect(state?.currentAnimation).toBe(animationId)
    })
  })

  describe('stopAnimation', () => {
    it('should throw error if avatar not spawned', async () => {
      const newController = new AvatarController(
        mockMessageService,
        mockConfigProvider,
        mockEventBus,
        mockAnimationService,
      )

      await expect(newController.stopAnimation()).rejects.toThrow(AvatarNotSpawnedError)
    })

    it('should send idle animation message', async () => {
      await controller.stopAnimation()

      expect(mockMessageService.sendNAFR).toHaveBeenCalledWith(
        expect.objectContaining({
          dataType: 'um',
          data: expect.objectContaining({
            d: expect.arrayContaining([
              expect.objectContaining({
                components: expect.objectContaining({
                  13: expect.objectContaining({
                    status: 'idle',
                    animationRunId: expect.any(String),
                  }),
                }),
              }),
            ]),
          }),
        }),
      )
    })

    it('should clear animation state', async () => {
      // First play an animation
      vi.mocked(mockAnimationService.validateAnimation).mockResolvedValueOnce(true)
      await controller.playAnimation('dance')

      expect(controller.getCurrentAnimation()).toBe('dance')

      // Stop animation
      await controller.stopAnimation()

      expect(controller.getCurrentAnimation()).toBeNull()

      const state = controller.getState()
      expect(state?.currentAnimation).toBeUndefined()
    })

    it('should emit animation:stopped event', async () => {
      // Play animation first
      vi.mocked(mockAnimationService.validateAnimation).mockResolvedValueOnce(true)
      await controller.playAnimation('wave')
      vi.clearAllMocks()

      await controller.stopAnimation()

      expect(mockEventBus.emit).toHaveBeenCalledWith('animation:stopped', {
        animationId: 'idle',
        playbackId: expect.any(String),
      })
    })
  })

  describe('getCurrentAnimation', () => {
    it('should return null initially', () => {
      expect(controller.getCurrentAnimation()).toBeNull()
    })

    it('should return current animation after playing', async () => {
      const animationId = 'jumping'

      vi.mocked(mockAnimationService.validateAnimation).mockResolvedValueOnce(true)
      await controller.playAnimation(animationId)

      expect(controller.getCurrentAnimation()).toBe(animationId)
    })

    it('should return null after stopping', async () => {
      vi.mocked(mockAnimationService.validateAnimation).mockResolvedValueOnce(true)
      await controller.playAnimation('nod')
      await controller.stopAnimation()

      expect(controller.getCurrentAnimation()).toBeNull()
    })
  })

  describe('calculateExpectedDuration', () => {
    it('should calculate duration with timeScale', async () => {
      const animationId = 'greeting'
      const options: AnimationPlayOptions = {
        timeScale: 2, // Double speed
      }

      vi.mocked(mockAnimationService.validateAnimation).mockResolvedValueOnce(true)
      vi.mocked(mockAnimationService.loadAnimation).mockResolvedValueOnce({
        id: animationId,
        name: 'Greeting',
        type: 'preset',
        duration: 2000,
        loop: false,
      })

      const result = await controller.playAnimation(animationId, options)

      expect(result.expectedDuration).toBe(1000) // 2000 / 2
    })

    it('should return undefined if animation has no duration', async () => {
      const animationId = 'idle'

      vi.mocked(mockAnimationService.validateAnimation).mockResolvedValueOnce(true)
      vi.mocked(mockAnimationService.loadAnimation).mockResolvedValueOnce({
        id: animationId,
        name: 'Idle',
        type: 'preset',
        loop: true,
        // No duration
      })

      const result = await controller.playAnimation(animationId)

      expect(result.expectedDuration).toBeUndefined()
    })

    it('should return undefined if animation service throws', async () => {
      const animationId = 'test'

      vi.mocked(mockAnimationService.validateAnimation).mockResolvedValueOnce(true)
      vi.mocked(mockAnimationService.loadAnimation).mockRejectedValueOnce(
        new Error('Failed to load'),
      )

      const result = await controller.playAnimation(animationId)

      expect(result.expectedDuration).toBeUndefined()
    })
  })
})
