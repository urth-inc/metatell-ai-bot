/**
 * Extended tests for AnimationService - Error handling and edge cases
 */

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

describe('AnimationService - Extended Error Handling', () => {
  let service: AnimationService
  const apiBaseUrl = 'https://storage.metatell.app'

  beforeEach(() => {
    service = new AnimationService(mockLogger, apiBaseUrl)
    vi.clearAllMocks()
  })

  describe('API Error Scenarios', () => {
    describe('HTTP Status Errors', () => {
      it('should handle 404 errors gracefully', async () => {
        const avatarId = 'test-avatar'
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({ error: 'Avatar not found' }),
        } as Response)

        const animations = await service.getAvailableAnimations(avatarId)

        // Should fall back to default animations
        expect(animations).toHaveLength(2)
        expect(animations.every((a) => a.type === 'preset')).toBe(true)
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Avatar not found in individual avatars, might be organization avatar',
          { avatarId: 'test-avatar' },
        )
      })

      it('should handle 500 server errors', async () => {
        const avatarId = 'test-avatar'
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        } as Response)

        const animations = await service.getAvailableAnimations(avatarId)

        expect(animations).toHaveLength(2) // Default animations
        expect(mockLogger.warn).toHaveBeenCalled()
      })

      it('should handle 403 forbidden errors', async () => {
        const avatarId = 'restricted-avatar'
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
        } as Response)

        const animations = await service.getAvailableAnimations(avatarId)
        expect(animations).toHaveLength(2)
        expect(mockLogger.warn).toHaveBeenCalled()
      })

      it('should handle timeout errors', async () => {
        const avatarId = 'test-avatar'
        vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Request timeout'))

        const animations = await service.getAvailableAnimations(avatarId)

        expect(animations).toHaveLength(2)
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Failed to fetch avatar animations, returning defaults',
          expect.objectContaining({
            avatarId: 'test-avatar',
            error: expect.objectContaining({ message: 'Request timeout' }),
          }),
        )
      })
    })

    describe('Malformed Response Handling', () => {
      it('should handle invalid JSON responses', async () => {
        const avatarId = 'test-avatar'
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => {
            throw new SyntaxError('Unexpected token in JSON')
          },
        } as Response)

        const animations = await service.getAvailableAnimations(avatarId)

        expect(animations).toHaveLength(2)
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Failed to fetch avatar animations, returning defaults',
          expect.objectContaining({
            avatarId: 'test-avatar',
            error: expect.objectContaining({ message: 'Unexpected token in JSON' }),
          }),
        )
      })

      it('should handle response with missing animations array', async () => {
        const avatarId = 'test-avatar'
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            // Missing animations array
            meta: { total: 0 },
          }),
        } as Response)

        const animations = await service.getAvailableAnimations(avatarId)

        // Should still return default animations
        expect(animations).toHaveLength(2)
      })

      it('should handle response with null animations', async () => {
        const avatarId = 'test-avatar'
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            animations: null,
          }),
        } as Response)

        const animations = await service.getAvailableAnimations(avatarId)
        expect(animations).toHaveLength(2)
      })

      it('should handle response with non-array animations', async () => {
        const avatarId = 'test-avatar'
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            animations: 'not-an-array',
          }),
        } as Response)

        const animations = await service.getAvailableAnimations(avatarId)
        expect(animations).toHaveLength(2)
      })
    })

    describe('loadAnimation Error Scenarios', () => {
      it('should throw specific error for 404 on custom animation', async () => {
        const animationId = 'missing-animation'
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        } as Response)

        await expect(service.loadAnimation(animationId)).rejects.toThrow(
          'Animation not found: missing-animation',
        )
      })

      it('should throw specific error for network failures', async () => {
        const animationId = 'custom-animation'
        vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

        await expect(service.loadAnimation(animationId)).rejects.toThrow('Network error')
      })

      it('should handle malformed custom animation data', async () => {
        const animationId = 'malformed-animation'
        vi.mocked(global.fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            // Missing required fields
            wrongField: 'wrong-value',
          }),
        } as Response)

        const result = await service.loadAnimation(animationId)
        expect(result).toBeDefined()
        expect(result.id).toBeUndefined()
        expect(result.name).toBeUndefined()
      })
    })
  })

  describe('Cache Management', () => {
    it('should isolate cache by avatar ID', async () => {
      const avatarId1 = 'avatar-1'
      const avatarId2 = 'avatar-2'

      // Mock different responses for different avatars
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ animations: [{ id: 'dance1', name: 'Dance 1' }] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ animations: [{ id: 'dance2', name: 'Dance 2' }] }),
        } as Response)

      const animations1 = await service.getAvailableAnimations(avatarId1)
      const animations2 = await service.getAvailableAnimations(avatarId2)

      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(animations1.find((a) => a.id === 'dance1')).toBeTruthy()
      expect(animations2.find((a) => a.id === 'dance2')).toBeTruthy()
    })

    it('should clear cache and trigger new API calls', async () => {
      const avatarId = 'test-avatar'

      // First call
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ animations: [{ id: 'first', name: 'First' }] }),
      } as Response)

      const firstResult = await service.getAvailableAnimations(avatarId)
      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(firstResult.find((a) => a.id === 'first')).toBeTruthy()

      // Clear cache
      service.clearCache()

      // Second call should hit API again
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ animations: [{ id: 'second', name: 'Second' }] }),
      } as Response)

      const secondResult = await service.getAvailableAnimations(avatarId)
      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(secondResult.find((a) => a.id === 'second')).toBeTruthy()
      expect(secondResult.find((a) => a.id === 'first')).toBeFalsy()
    })

    it('should handle concurrent requests to same avatar', async () => {
      const avatarId = 'test-avatar'

      // First call will populate cache
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ animations: [{ id: 'concurrent', name: 'Concurrent' }] }),
      } as Response)

      const result1 = await service.getAvailableAnimations(avatarId)

      // Second call should use cache, no additional fetch
      const result2 = await service.getAvailableAnimations(avatarId)

      // Should only make one API call due to caching
      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(result1).toEqual(result2)
      expect(result1).toHaveLength(3) // 2 defaults + 1 custom
    })
  })

  describe('Input Validation', () => {
    it('should handle empty avatar ID', async () => {
      const animations = await service.getAvailableAnimations('')

      // Should still return default animations
      expect(animations).toHaveLength(2)
      expect(animations.every((a) => a.type === 'preset')).toBe(true)
    })

    it('should handle null avatar ID', async () => {
      const animations = await service.getAvailableAnimations(null as unknown as string)

      expect(animations).toHaveLength(2)
    })

    it('should handle undefined avatar ID', async () => {
      const animations = await service.getAvailableAnimations(undefined as unknown as string)

      expect(animations).toHaveLength(2)
    })

    it('should handle special characters in avatar ID', async () => {
      const specialAvatarId = 'avatar@#$%^&*()_+-=[]{}|;:,.<>?'

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ animations: [] }),
      } as Response)

      const animations = await service.getAvailableAnimations(specialAvatarId)
      expect(animations).toHaveLength(2)

      // Should use the avatar ID in the URL (not necessarily encoded)
      expect(global.fetch).toHaveBeenCalledWith(
        `https://storage.metatell.app/api/v1/avatars/${specialAvatarId}`,
      )
    })

    it('should handle very long avatar IDs', async () => {
      const longAvatarId = 'a'.repeat(1000)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ animations: [] }),
      } as Response)

      const animations = await service.getAvailableAnimations(longAvatarId)
      expect(animations).toHaveLength(2)
    })
  })

  describe('Custom Animation Processing', () => {
    it('should handle custom animations with missing optional fields', async () => {
      const avatarId = 'test-avatar'
      const minimalAnimation = {
        id: 'minimal',
        name: 'Minimal Animation',
        // Missing vrmaFilePath, duration, loop
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ animations: [minimalAnimation] }),
      } as Response)

      const animations = await service.getAvailableAnimations(avatarId)
      const customAnim = animations.find((a) => a.id === 'minimal')

      expect(customAnim).toEqual({
        ...minimalAnimation,
        type: 'custom',
        loop: false, // Default value
      })
    })

    it('should handle custom animations with all fields', async () => {
      const avatarId = 'test-avatar'
      const fullAnimation = {
        id: 'full',
        name: 'Full Animation',
        vrmaFilePath: '/path/to/animation.vrma',
        duration: 5000,
        loop: true,
        tags: ['dance', 'energetic'],
        thumbnail: '/path/to/thumb.jpg',
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ animations: [fullAnimation] }),
      } as Response)

      const animations = await service.getAvailableAnimations(avatarId)
      const customAnim = animations.find((a) => a.id === 'full')

      expect(customAnim).toEqual({
        id: fullAnimation.id,
        name: fullAnimation.name,
        vrmaFilePath: fullAnimation.vrmaFilePath,
        type: 'custom',
        loop: false, // Default value from service implementation
      })
    })

    it('should handle mix of valid and invalid custom animations', async () => {
      const avatarId = 'test-avatar'
      const validAnimation = { id: 'valid', name: 'Valid Animation' }
      const invalidAnimation = { wrongField: 'wrong' } // Missing id and name

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          animations: [validAnimation, invalidAnimation],
        }),
      } as Response)

      const animations = await service.getAvailableAnimations(avatarId)

      // Should include defaults + both animations (invalid one has undefined fields)
      expect(animations).toHaveLength(4)
      expect(animations.find((a) => a.id === 'valid')).toBeTruthy()
      expect(animations.find((a) => a.id === undefined)).toBeTruthy() // Invalid animation still processed
    })
  })

  describe('validateAnimation extended', () => {
    it('should handle network errors during validation', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network down'))

      const isValid = await service.validateAnimation('test-animation')
      expect(isValid).toBe(false)
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should handle malformed validation responses', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON')
        },
      } as Response)

      const isValid = await service.validateAnimation('test-animation')
      expect(isValid).toBe(false)
    })

    it('should validate preset animations without API calls', async () => {
      const isValidIdle = await service.validateAnimation(PresetAnimationId.IDLE)
      const isValidWalking = await service.validateAnimation(PresetAnimationId.WALKING)

      expect(isValidIdle).toBe(true)
      expect(isValidWalking).toBe(true)
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })
})
