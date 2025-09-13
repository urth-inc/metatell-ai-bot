import { ServiceIdentifier } from '../ServiceIdentifier.js'
import type { AnimationPlaybackResult, AnimationPlayOptions } from '../types/animation.js'

export interface Position {
  x: number
  y: number
  z: number
}

export interface Rotation {
  x: number
  y: number
  z: number
  w: number
}

export interface AvatarState {
  networkId: string
  position: Position
  rotation: Rotation
  avatarId: string
  avatarSrc?: string
  displayName?: string
  currentAnimation?: string
}

export interface IAvatarController {
  spawn(avatarId: string, position?: Position, avatarSrc?: string): Promise<void>
  move(position: Position): Promise<void>
  rotate(rotation: Rotation): Promise<void>
  updateState(state: Partial<AvatarState>): Promise<void>
  getState(): AvatarState | null
  destroy(): Promise<void>
  /**
   * Resync avatar state for newly joined users
   * Sends the complete avatar state with isFirstSync flag
   */
  resyncAvatar(): Promise<void>

  /**
   * Play an animation on the avatar
   * @param animationId - The animation ID (preset or custom UUID)
   * @param options - Animation playback options
   * @returns Promise resolving to playback result
   */
  playAnimation(
    animationId: string,
    options?: AnimationPlayOptions,
  ): Promise<AnimationPlaybackResult>

  /**
   * Get current animation ID
   * @returns Current animation ID or null
   */
  getCurrentAnimation(): string | null

  /**
   * Stop current animation
   */
  stopAnimation(): Promise<void>
}

// Service identifier token for dependency injection
export abstract class AvatarController extends ServiceIdentifier<IAvatarController> {}
