import type { IAnimationService } from '../interfaces/IAnimationService.js'
import type { Logger } from '../logging/spi.js'
import type { VRMAnimation } from '../types/animation.js'
import { PresetAnimationId } from '../types/animation.js'

/**
 * Service for managing VRM animations
 */
export class AnimationService implements IAnimationService {
  private animationCache: Map<string, VRMAnimation> = new Map()
  private avatarAnimationsCache: Map<string, VRMAnimation[]> = new Map()

  constructor(
    private logger: Logger,
    private apiBaseUrl: string,
  ) {}

  /**
   * Get available animations for an avatar
   */
  async getAvailableAnimations(avatarId: string): Promise<VRMAnimation[]> {
    // Check cache first
    const cached = this.avatarAnimationsCache.get(avatarId)
    if (cached) {
      return cached
    }

    // アバターのアニメーション取得はstorage APIではなく、単にデフォルトを返す
    // 組織アバターのアニメーション情報は現在のAPIでは取得できない
    this.logger.debug('Returning default animations for avatar', { avatarId })
    const animations = this.getDefaultAnimations()
    this.avatarAnimationsCache.set(avatarId, animations)
    return animations
  }

  /**
   * Load animation data
   */
  async loadAnimation(animationId: string): Promise<VRMAnimation> {
    // Check cache
    const cached = this.animationCache.get(animationId)
    if (cached) {
      return cached
    }

    // Check if it's a preset animation
    const presetAnimation = this.getDefaultAnimations().find((a) => a.id === animationId)
    if (presetAnimation) {
      this.animationCache.set(animationId, presetAnimation)
      return presetAnimation
    }

    // For custom animations, we need to fetch from API
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/v1/animations/${animationId}`)
      if (!response.ok) {
        throw new Error(`Animation not found: ${animationId}`)
      }

      const animationData = (await response.json()) as {
        id: string
        name?: string
        vrmaFilePath?: string
        duration?: number
        loop?: boolean
      }
      const animation: VRMAnimation = {
        id: animationData.id,
        name: animationData.name,
        vrmaFilePath: animationData.vrmaFilePath,
        type: 'custom',
        duration: animationData.duration,
        loop: animationData.loop,
      }

      this.animationCache.set(animationId, animation)
      return animation
    } catch (error) {
      this.logger.error('Failed to load animation', { animationId, error })
      throw error
    }
  }

  /**
   * Validate if animation exists
   */
  async validateAnimation(animationId: string): Promise<boolean> {
    try {
      await this.loadAnimation(animationId)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get default preset animations
   */
  getDefaultAnimations(): VRMAnimation[] {
    return [
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
    ]
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.animationCache.clear()
    this.avatarAnimationsCache.clear()
    this.logger.debug('Animation cache cleared')
  }
}
