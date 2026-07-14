import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnimationNotFoundError, AvatarNotSpawnedError } from '../../errors/animation-errors.js'
import type { IConfigurationProvider } from '../../interfaces/IConfigurationProvider.js'
import type { IEventBus } from '../../interfaces/IEventBus.js'
import { SystemEvents } from '../../interfaces/IEventBus.js'
import type { IMessageService } from '../../interfaces/IMessageService.js'
import { DefaultLoggerProvider } from '../../logging/providers/default.js'
import type { Logger } from '../../logging/spi.js'
import { registerLoggerProvider } from '../../logging/spi.js'
import type { AnimationPlayOptions } from '../../types/animation.js'
import { AnimationService } from '../AnimationService.js'
import { AvatarController } from '../AvatarController.js'

const mockMessageService: IMessageService = {
  sendMessage: vi.fn(),
  sendNAF: vi.fn(),
  sendNAFR: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}

const mockConfigProvider: IConfigurationProvider = {
  getConfiguration: vi.fn(() => ({
    storageUrl: 'https://storage.metatell.app',
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

const mockLogger: Logger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}

global.fetch = vi.fn()

const adminApiBaseUrl = 'https://v-air-admin-development.urth.workers.dev'
const sessionId = 'test-session-id'
const avatarId = 'test-avatar-id'
const customAnimation = {
  id: 'cb612a7f-157d-42df-a988-6590b5709880',
  name: 'Custom Motion',
  vrmaFilePath: 'vrm-animation-files/custom.vrma',
}

function avatarResponse(): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ animations: [customAnimation] }),
  } as Response
}

describe('AvatarController - Animation Features', () => {
  let controller: AvatarController
  let animationService: AnimationService

  beforeAll(() => {
    const loggerProvider = new DefaultLoggerProvider()
    loggerProvider.enableConsole(false)
    registerLoggerProvider(loggerProvider, { allowOverwrite: true })
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(global.fetch).mockResolvedValue(avatarResponse())
    vi.mocked(mockMessageService.sendNAF).mockResolvedValue(undefined)
    vi.mocked(mockMessageService.sendNAFR).mockResolvedValue(undefined)

    animationService = new AnimationService(mockLogger, adminApiBaseUrl)
    controller = new AvatarController(
      mockMessageService,
      mockConfigProvider,
      mockEventBus,
      animationService,
    )

    const roomJoinedCallback = vi
      .mocked(mockEventBus.on)
      .mock.calls.find((call) => call[0] === SystemEvents.ROOM_JOINED)?.[1]
    roomJoinedCallback?.({ session_id: sessionId })

    await controller.spawn(avatarId, { x: 0, y: 0, z: 0 })
    vi.clearAllMocks()
  })

  describe('playAnimation', () => {
    it('should throw if the avatar has not spawned', async () => {
      const newController = new AvatarController(
        mockMessageService,
        mockConfigProvider,
        mockEventBus,
        animationService,
      )

      await expect(newController.playAnimation('walking')).rejects.toThrow(AvatarNotSpawnedError)
    })

    it('should reject an ID absent from the current avatar available list', async () => {
      await expect(controller.playAnimation('wave')).rejects.toThrow(AnimationNotFoundError)

      expect(global.fetch).toHaveBeenCalledWith(`${adminApiBaseUrl}/api/v1/avatars/${avatarId}`)
      expect(mockMessageService.sendNAF).not.toHaveBeenCalled()
    })

    it('should validate UUID animations instead of bypassing the available list', async () => {
      const unavailableUuid = '2bb3c8aa-1ae7-4b45-82df-c5bb2421bc7b'

      await expect(controller.playAnimation(unavailableUuid)).rejects.toThrow(
        AnimationNotFoundError,
      )

      expect(global.fetch).toHaveBeenCalledWith(`${adminApiBaseUrl}/api/v1/avatars/${avatarId}`)
      expect(mockMessageService.sendNAF).not.toHaveBeenCalled()
    })

    it('should send a NAF message for an available avatar animation', async () => {
      const options: AnimationPlayOptions = {
        loop: false,
        timeScale: 1.5,
      }

      const result = await controller.playAnimation(customAnimation.id, options)

      expect(result).toMatchObject({
        animationId: customAnimation.id,
        playbackId: expect.any(String),
        startedAt: expect.any(Number),
        expectedDuration: undefined,
      })
      expect(mockMessageService.sendNAF).toHaveBeenCalledWith(
        expect.objectContaining({
          dataType: 'um',
          data: expect.objectContaining({
            d: expect.arrayContaining([
              expect.objectContaining({
                components: expect.objectContaining({
                  13: expect.objectContaining({
                    status: customAnimation.id,
                    animationRunId: result.playbackId,
                  }),
                }),
              }),
            ]),
          }),
        }),
      )
    })

    it('should emit animation:played for an available avatar animation', async () => {
      const result = await controller.playAnimation(customAnimation.id)

      expect(mockEventBus.emit).toHaveBeenCalledWith('animation:played', {
        animationId: customAnimation.id,
        playbackId: result.playbackId,
        options: undefined,
      })
    })

    it('should update the current animation state for a preset', async () => {
      await controller.playAnimation('walking')

      expect(controller.getCurrentAnimation()).toBe('walking')
      expect(controller.getState()?.currentAnimation).toBe('walking')
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  describe('stopAnimation', () => {
    it('should throw if the avatar has not spawned', async () => {
      const newController = new AvatarController(
        mockMessageService,
        mockConfigProvider,
        mockEventBus,
        animationService,
      )

      await expect(newController.stopAnimation()).rejects.toThrow(AvatarNotSpawnedError)
    })

    it('should send the idle animation message', async () => {
      await controller.stopAnimation()

      expect(mockMessageService.sendNAF).toHaveBeenCalledWith(
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

    it('should clear the current animation state', async () => {
      await controller.playAnimation('walking')

      await controller.stopAnimation()

      expect(controller.getCurrentAnimation()).toBeNull()
      expect(controller.getState()?.currentAnimation).toBeUndefined()
    })

    it('should emit animation:stopped after returning to idle', async () => {
      await controller.playAnimation('walking')
      vi.mocked(mockEventBus.emit).mockClear()

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

    it('should return the avatar animation after playing it', async () => {
      await controller.playAnimation(customAnimation.id)

      expect(controller.getCurrentAnimation()).toBe(customAnimation.id)
    })

    it('should return null after stopping', async () => {
      await controller.playAnimation('walking')
      await controller.stopAnimation()

      expect(controller.getCurrentAnimation()).toBeNull()
    })
  })

  describe('expected duration', () => {
    it('should apply timeScale to a loaded animation duration', async () => {
      vi.spyOn(animationService, 'loadAnimation').mockResolvedValue({
        id: 'timed-animation',
        name: 'Timed Animation',
        type: 'custom',
        duration: 2000,
        loop: false,
      })

      const result = await controller.playAnimation('timed-animation', { timeScale: 2 })

      expect(result.expectedDuration).toBe(1000)
    })

    it('should return undefined when the animation has no duration', async () => {
      const result = await controller.playAnimation('idle')

      expect(result.expectedDuration).toBeUndefined()
    })

    it('should return undefined when loading duration metadata fails', async () => {
      vi.spyOn(animationService, 'loadAnimation')
        .mockResolvedValueOnce({
          id: 'walking',
          name: 'Walking',
          type: 'preset',
          loop: true,
        })
        .mockRejectedValueOnce(new Error('Failed to load'))

      const result = await controller.playAnimation('walking')

      expect(result.expectedDuration).toBeUndefined()
    })
  })
})
