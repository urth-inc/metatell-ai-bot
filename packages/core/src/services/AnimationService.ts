import type { IAnimationService } from '../interfaces/IAnimationService.js'
import type { Logger } from '../logging/spi.js'
import type { VRMAnimation } from '../types/animation.js'
import { PresetAnimationId } from '../types/animation.js'

/**
 * Service for managing VRM animations
 */
export class AnimationService implements IAnimationService {
  private avatarAnimationsCache: Map<string, VRMAnimation[]> = new Map()
  private currentAvatarId: string | null = null

  constructor(
    private logger: Logger,
    private adminApiBaseUrl: string,
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

    // デフォルトアニメーション
    const defaultAnimations = this.getDefaultAnimations()

    try {
      // アバター情報を取得して利用可能なアニメーションを確認
      const avatarUrl = `${this.adminApiBaseUrl}/api/v1/avatars/${avatarId}`

      this.logger.debug('Fetching avatar animations', { avatarUrl })

      const response = await fetch(avatarUrl)

      this.logger.debug('Avatar API response', {
        avatarUrl,
        status: response.status,
        ok: response.ok,
      })

      if (!response.ok) {
        throw new Error(
          `Failed to fetch avatar animations from ${avatarUrl}: ${response.status} ${response.statusText}`,
        )
      }

      const avatarData = (await response.json()) as {
        id: string
        name: string
        animations?: Array<{
          id: string
          name: string
          vrmaFilePath: string
          alias?: string
        }>
      }

      // アバター固有のアニメーションをVRMAnimation形式に変換
      const customAnimations: VRMAnimation[] = Array.isArray(avatarData.animations)
        ? avatarData.animations.map((anim) => ({
            id: anim.id,
            name: anim.alias || anim.name,
            vrmaFilePath: anim.vrmaFilePath,
            type: 'custom' as const,
            loop: false, // デフォルトはループなし
          }))
        : []

      // デフォルトアニメーションとカスタムアニメーションを結合
      const allAnimations = [...defaultAnimations, ...customAnimations]

      this.logger.debug('Avatar animations loaded', {
        avatarId,
        defaultCount: defaultAnimations.length,
        customCount: customAnimations.length,
      })

      this.avatarAnimationsCache.set(avatarId, allAnimations)
      return allAnimations
    } catch (error) {
      this.logger.warn('Failed to fetch avatar animations, returning defaults', { avatarId, error })
      return defaultAnimations
    }
  }

  /**
   * Load animation data
   */
  async loadAnimation(animationId: string): Promise<VRMAnimation> {
    // Check if it's a preset animation
    const presetAnimation = this.getDefaultAnimations().find((a) => a.id === animationId)
    if (presetAnimation) {
      return presetAnimation
    }

    try {
      if (!this.currentAvatarId) {
        throw new Error(`Cannot load animation without a current avatar: ${animationId}`)
      }

      const availableAnimations = await this.getAvailableAnimations(this.currentAvatarId)
      const animation = availableAnimations.find((item) => item.id === animationId)
      if (!animation) {
        throw new Error(
          `Animation not available for avatar ${this.currentAvatarId}: ${animationId}`,
        )
      }

      return animation
    } catch (error) {
      this.logger.error('Failed to load animation', {
        animationId,
        avatarId: this.currentAvatarId,
        error,
      })
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
    this.avatarAnimationsCache.clear()
    this.logger.debug('Animation cache cleared')
  }

  /**
   * Set current avatar ID for animation context
   */
  setCurrentAvatarId(avatarId: string): void {
    this.currentAvatarId = avatarId
    this.logger.debug('Current avatar ID set', { avatarId })
  }
}
