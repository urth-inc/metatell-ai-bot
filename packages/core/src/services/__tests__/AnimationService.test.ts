import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '../../logging/spi.js'
import { PresetAnimationId } from '../../types/animation.js'
import { AnimationService } from '../AnimationService.js'

const mockLogger: Logger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}

global.fetch = vi.fn()

const adminApiBaseUrl = 'https://v-air-admin-development.urth.workers.dev'
const avatarId = 'avatar-1'
const customAnimation = {
  id: 'cb612a7f-157d-42df-a988-6590b5709880',
  name: 'Custom Motion',
  alias: 'Avatar Motion',
  vrmaFilePath: 'vrm-animation-files/custom.vrma',
}

function avatarResponse(
  animations: Array<{
    id: string
    name: string
    alias?: string
    vrmaFilePath: string
  }> = [],
): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ animations }),
  } as Response
}

describe('AnimationService', () => {
  let service: AnimationService

  beforeEach(() => {
    service = new AnimationService(mockLogger, adminApiBaseUrl)
    vi.clearAllMocks()
  })

  describe('getAvailableAnimations', () => {
    it('should return presets and animations configured on the avatar', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(avatarResponse([customAnimation]))

      const animations = await service.getAvailableAnimations(avatarId)

      expect(animations).toEqual([
        {
          id: PresetAnimationId.IDLE,
          name: 'Idle',
          type: 'preset',
          loop: true,
        },
        {
          id: PresetAnimationId.WALKING,
          name: 'Walking',
          type: 'preset',
          loop: true,
        },
        {
          id: customAnimation.id,
          name: customAnimation.alias,
          vrmaFilePath: customAnimation.vrmaFilePath,
          type: 'custom',
          loop: false,
        },
      ])
      expect(global.fetch).toHaveBeenCalledWith(`${adminApiBaseUrl}/api/v1/avatars/${avatarId}`)
    })

    it('should return presets when the avatar API request fails', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      const animations = await service.getAvailableAnimations(avatarId)

      expect(animations.map((animation) => animation.id)).toEqual([
        PresetAnimationId.IDLE,
        PresetAnimationId.WALKING,
      ])
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to fetch avatar animations, returning defaults',
        expect.objectContaining({
          avatarId,
          error: expect.objectContaining({ message: 'Network error' }),
        }),
      )
    })

    it('should retry after the avatar API recovers from a failure', async () => {
      vi.mocked(global.fetch)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(avatarResponse([customAnimation]))

      const fallbackAnimations = await service.getAvailableAnimations(avatarId)
      const recoveredAnimations = await service.getAvailableAnimations(avatarId)

      expect(fallbackAnimations.map((animation) => animation.id)).toEqual([
        PresetAnimationId.IDLE,
        PresetAnimationId.WALKING,
      ])
      expect(recoveredAnimations.some((animation) => animation.id === customAnimation.id)).toBe(
        true,
      )
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('should include URL and HTTP response details in failure metadata', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      } as Response)

      await service.getAvailableAnimations(avatarId)

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to fetch avatar animations, returning defaults',
        expect.objectContaining({
          error: expect.objectContaining({
            message: `Failed to fetch avatar animations from ${adminApiBaseUrl}/api/v1/avatars/${avatarId}: 503 Service Unavailable`,
          }),
        }),
      )
    })

    it('should cache the available list by avatar ID', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(avatarResponse())

      const first = await service.getAvailableAnimations(avatarId)
      const second = await service.getAvailableAnimations(avatarId)

      expect(second).toBe(first)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('loadAnimation', () => {
    it('should return a preset without an API request', async () => {
      const animation = await service.loadAnimation(PresetAnimationId.IDLE)

      expect(animation).toEqual({
        id: PresetAnimationId.IDLE,
        name: 'Idle',
        type: 'preset',
        loop: true,
      })
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('should load a custom animation from the current avatar details', async () => {
      service.setCurrentAvatarId(avatarId)
      vi.mocked(global.fetch).mockResolvedValueOnce(avatarResponse([customAnimation]))

      const animation = await service.loadAnimation(customAnimation.id)

      expect(animation).toEqual({
        id: customAnimation.id,
        name: customAnimation.alias,
        vrmaFilePath: customAnimation.vrmaFilePath,
        type: 'custom',
        loop: false,
      })
      const requestedUrls = vi.mocked(global.fetch).mock.calls.map(([url]) => String(url))
      expect(requestedUrls).toEqual([`${adminApiBaseUrl}/api/v1/avatars/${avatarId}`])
      expect(requestedUrls.some((url) => url.includes('/api/v1/animations/'))).toBe(false)
    })

    it('should reject an animation that is not configured on the current avatar', async () => {
      service.setCurrentAvatarId(avatarId)
      vi.mocked(global.fetch).mockResolvedValueOnce(avatarResponse())

      await expect(service.loadAnimation('not-configured')).rejects.toThrow(
        `Animation not available for avatar ${avatarId}: not-configured`,
      )
    })

    it('should reject a custom animation before an avatar is set', async () => {
      await expect(service.loadAnimation(customAnimation.id)).rejects.toThrow(
        `Cannot load animation without a current avatar: ${customAnimation.id}`,
      )
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  describe('validateAnimation', () => {
    it('should validate presets without a current avatar or API request', async () => {
      await expect(service.validateAnimation(PresetAnimationId.IDLE)).resolves.toBe(true)
      await expect(service.validateAnimation(PresetAnimationId.WALKING)).resolves.toBe(true)
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('should validate only IDs in the current avatar available list', async () => {
      service.setCurrentAvatarId(avatarId)
      vi.mocked(global.fetch).mockResolvedValueOnce(avatarResponse([customAnimation]))

      await expect(service.validateAnimation(customAnimation.id)).resolves.toBe(true)
      await expect(service.validateAnimation('wave')).resolves.toBe(false)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('should validate a non-UUID ID when it is listed on the current avatar', async () => {
      const namedAnimation = { ...customAnimation, id: 'avatar-specific-motion' }
      service.setCurrentAvatarId(avatarId)
      vi.mocked(global.fetch).mockResolvedValueOnce(avatarResponse([namedAnimation]))

      await expect(service.validateAnimation(namedAnimation.id)).resolves.toBe(true)
    })

    it('should not reuse a custom animation after the current avatar changes', async () => {
      service.setCurrentAvatarId('avatar-a')
      vi.mocked(global.fetch).mockResolvedValueOnce(avatarResponse([customAnimation]))
      await expect(service.validateAnimation(customAnimation.id)).resolves.toBe(true)

      service.setCurrentAvatarId('avatar-b')
      vi.mocked(global.fetch).mockResolvedValueOnce(avatarResponse())

      await expect(service.validateAnimation(customAnimation.id)).resolves.toBe(false)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('cache and presets', () => {
    it('should expose only idle and walking as presets', () => {
      expect(service.getDefaultAnimations().map((animation) => animation.id)).toEqual([
        PresetAnimationId.IDLE,
        PresetAnimationId.WALKING,
      ])
    })

    it('should fetch avatar details again after clearing the cache', async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(avatarResponse())
        .mockResolvedValueOnce(avatarResponse())

      await service.getAvailableAnimations(avatarId)
      service.clearCache()
      await service.getAvailableAnimations(avatarId)

      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })
})
