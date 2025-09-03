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

    // デフォルトアニメーション
    const defaultAnimations = this.getDefaultAnimations()

    try {
      // アバター情報を取得して利用可能なアニメーションを確認
      const avatarUrl = `${this.apiBaseUrl}/api/v1/avatars/${avatarId}`

      this.logger.debug('Fetching avatar animations', { avatarUrl })

      const response = await fetch(avatarUrl)

      this.logger.debug('Avatar API response', {
        avatarUrl,
        status: response.status,
        ok: response.ok,
      })

      if (!response.ok) {
        // 404の場合は組織アバターの可能性があるのでデフォルトを返す
        if (response.status === 404) {
          this.logger.debug(
            'Avatar not found in individual avatars, might be organization avatar',
            { avatarId },
          )
          this.avatarAnimationsCache.set(avatarId, defaultAnimations)
          return defaultAnimations
        }
        throw new Error(`Failed to fetch avatar info: ${response.status}`)
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
      const customAnimations: VRMAnimation[] = (avatarData.animations || []).map((anim) => ({
        id: anim.id,
        name: anim.alias || anim.name,
        vrmaFilePath: anim.vrmaFilePath,
        type: 'custom' as const,
        loop: false, // デフォルトはループなし
      }))

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
      this.avatarAnimationsCache.set(avatarId, defaultAnimations)
      return defaultAnimations
    }
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

  /**
   * Set current avatar ID for animation context
   */
  setCurrentAvatarId(avatarId: string): void {
    // アバターIDが変更された場合、そのアバターのアニメーションを事前取得
    this.getAvailableAnimations(avatarId).catch((error) => {
      this.logger.warn('Failed to preload avatar animations', { avatarId, error })
    })
    this.logger.debug('Current avatar ID set', { avatarId })
  }
}
