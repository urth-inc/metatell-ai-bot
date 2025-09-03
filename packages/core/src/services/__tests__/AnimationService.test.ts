import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '../../logging/spi.js'
import { PresetAnimationId } from '../../types/animation.js'
import { AnimationService } from '../AnimationService.js'

// Mock logger
const mockLogger: Logger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}

// Mock fetch
global.fetch = vi.fn()

describe('AnimationService', () => {
  let service: AnimationService
  const apiBaseUrl = 'https://storage.metatell.app:443'

  beforeEach(() => {
    service = new AnimationService(mockLogger, apiBaseUrl)
    vi.clearAllMocks()
  })

  describe('getAvailableAnimations', () => {
    it('should return default animations when API call fails', async () => {
      const avatarId = 'test-avatar-id'

      // Mock failed API call
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      const animations = await service.getAvailableAnimations(avatarId)

      expect(animations).toHaveLength(10) // Number of default animations
      expect(animations[0]).toEqual({
        id: PresetAnimationId.IDLE,
        name: 'Idle',
        type: 'preset',
        loop: true,
      })
    })

    it('should return combined default and custom animations on success', async () => {
      const avatarId = 'test-avatar-id'
      const customAnimation = {
        id: 'custom-dance',
        name: 'Custom Dance',
        vrmaFilePath: '/animations/custom-dance.vrma',
        duration: 5000,
        loop: true,
      }

      // Mock successful API call
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          animations: [customAnimation],
        }),
      } as Response)

      const animations = await service.getAvailableAnimations(avatarId)

      expect(animations).toHaveLength(11) // 10 default + 1 custom
      expect(animations[animations.length - 1]).toEqual({
        ...customAnimation,
        type: 'custom',
      })
    })

    it('should cache animations for subsequent calls', async () => {
      const avatarId = 'test-avatar-id'

      // Mock successful API call
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ animations: [] }),
      } as Response)

      // First call
      await service.getAvailableAnimations(avatarId)

      // Second call should use cache
      await service.getAvailableAnimations(avatarId)

      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('loadAnimation', () => {
    it('should return preset animation without API call', async () => {
      const animation = await service.loadAnimation(PresetAnimationId.GREETING)

      expect(animation).toEqual({
        id: PresetAnimationId.GREETING,
        name: 'Greeting',
        type: 'preset',
        duration: 2000,
        loop: false,
      })
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('should fetch custom animation from API', async () => {
      const animationId = 'custom-animation'
      const animationData = {
        id: animationId,
        name: 'Custom Animation',
        vrmaFilePath: '/animations/custom.vrma',
        duration: 3000,
        loop: false,
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => animationData,
      } as Response)

      const animation = await service.loadAnimation(animationId)

      expect(animation).toEqual({
        ...animationData,
        type: 'custom',
      })
      expect(global.fetch).toHaveBeenCalledWith(`${apiBaseUrl}/api/v1/animations/${animationId}`)
    })

    it('should throw error for non-existent animation', async () => {
      const animationId = 'non-existent'

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      } as Response)

      await expect(service.loadAnimation(animationId)).rejects.toThrow(
        `Animation not found: ${animationId}`,
      )
    })
  })

  describe('validateAnimation', () => {
    it('should return true for valid preset animation', async () => {
      const isValid = await service.validateAnimation(PresetAnimationId.IDLE)
      expect(isValid).toBe(true)
    })

    it('should return false for invalid animation', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
      } as Response)

      const isValid = await service.validateAnimation('invalid-animation')
      expect(isValid).toBe(false)
    })
  })

  describe('getDefaultAnimations', () => {
    it('should return all preset animations', () => {
      const animations = service.getDefaultAnimations()

      expect(animations).toHaveLength(10)
      expect(animations.every((a) => a.type === 'preset')).toBe(true)
      expect(animations.map((a) => a.id)).toContain(PresetAnimationId.IDLE)
      expect(animations.map((a) => a.id)).toContain(PresetAnimationId.WALKING)
      expect(animations.map((a) => a.id)).toContain(PresetAnimationId.GREETING)
    })
  })

  describe('clearCache', () => {
    it('should clear all caches', async () => {
      const avatarId = 'test-avatar-id'

      // Populate cache
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ animations: [] }),
      } as Response)

      await service.getAvailableAnimations(avatarId)
      expect(global.fetch).toHaveBeenCalledTimes(1)

      // Clear cache
      service.clearCache()

      // Next call should hit API again
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ animations: [] }),
      } as Response)

      await service.getAvailableAnimations(avatarId)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })
})
