import { ServiceIdentifier } from '../ServiceIdentifier.js'
import type { AnimationPlaybackResult, AnimationPlayOptions } from '../types/animation.js'
import type { NetworkedAvatarData, VrmAvatarStatusData } from '../types/remote-avatar.js'

export interface Position {
  x: number
  y: number
  z: number
}

export interface Rotation {
  x: number
  y: number
  z: number
  w?: number
}

export interface AvatarState {
  networkId: string
  position: Position
  /** Model-local quaternion; rotate()/rotateTo() retain this meaning. */
  rotation: Rotation
  /** Root quaternion in world space (the root has no parent). */
  rootRotation?: Rotation
  scale?: Position
  networkedAvatar?: NetworkedAvatarData
  /** Camera/controller positions are rig-local metres, rotations are local quaternions. */
  headPosition?: Position
  headRotation?: Rotation
  leftHandPosition?: Position
  leftHandRotation?: Rotation
  leftHandVisible?: boolean
  rightHandPosition?: Position
  rightHandRotation?: Rotation
  rightHandVisible?: boolean
  animation?: VrmAvatarStatusData
  avatarId: string
  avatarSrc?: string
  displayName?: string
  currentAnimation?: string
}

/** Optional initial pose in the per-field coordinate spaces above; excludes identity/assets. */
export type AvatarPose = Pick<
  AvatarState,
  | 'rotation'
  | 'rootRotation'
  | 'scale'
  | 'networkedAvatar'
  | 'headPosition'
  | 'headRotation'
  | 'leftHandPosition'
  | 'leftHandRotation'
  | 'leftHandVisible'
  | 'rightHandPosition'
  | 'rightHandRotation'
  | 'rightHandVisible'
>

export interface IAvatarController {
  spawn(
    avatarId: string,
    position?: Position,
    avatarSrc?: string,
    pose?: Partial<AvatarPose>,
  ): Promise<void>
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
   * @param animationId - A preset ID or an ID returned for the current avatar
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
