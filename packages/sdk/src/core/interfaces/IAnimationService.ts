import type { VRMAnimation } from '../types/animation.js'

/**
 * Service interface for managing VRM animations
 */
export interface IAnimationService {
  /**
   * Get available animations for an avatar
   * @param avatarId - The avatar ID
   * @returns Promise resolving to array of available animations
   */
  getAvailableAnimations(avatarId: string): Promise<VRMAnimation[]>

  /**
   * Load animation data from cache or API
   * @param animationId - The animation ID
   * @returns Promise resolving to animation data
   */
  loadAnimation(animationId: string): Promise<VRMAnimation>

  /**
   * Validate if animation exists
   * @param animationId - The animation ID
   * @returns Promise resolving to boolean
   */
  validateAnimation(animationId: string): Promise<boolean>

  /**
   * Get default animations (presets)
   * @returns Array of preset animations
   */
  getDefaultAnimations(): VRMAnimation[]

  /**
   * Clear animation cache
   */
  clearCache(): void
}
