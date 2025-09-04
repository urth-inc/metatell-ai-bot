/**
 * VRM Animation Types and Interfaces
 */

/**
 * VRM animation definition
 */
export interface VRMAnimation {
  id: string
  name?: string
  vrmaFilePath?: string
  type: 'preset' | 'custom'
  duration?: number
  loop?: boolean
}

/**
 * Animation playback options
 */
export interface AnimationPlayOptions {
  loop?: boolean
  fadeIn?: number
  fadeOut?: number
  timeScale?: number
  startTime?: number
}

/**
 * Animation playback result
 */
export interface AnimationPlaybackResult {
  playbackId: string
  animationId: string
  startedAt: number
  expectedDuration?: number
}

/**
 * Animation event
 */
export interface AnimationEvent {
  type: 'started' | 'completed' | 'failed'
  playbackId: string
  animationId: string
  timestamp: number
  error?: Error
}

/**
 * Animation NAF message structure
 */
export interface AnimationNAFMessage {
  dataType: 'animation'
  data: {
    networkId: string
    owner: string
    animationId: string
    playbackId: string
    options?: AnimationPlayOptions
    timestamp: number
  }
}

/**
 * Animation loop behavior
 */
export enum AnimationLoopBehavior {
  NONE = 'none',
  LOOP = 'loop',
  PING_PONG = 'pingPong',
}

/**
 * Preset animation IDs
 */
export enum PresetAnimationId {
  IDLE = 'idle',
  WALKING = 'walking',
  GREETING = 'greeting',
  THANKFUL = 'thankful',
  JUMPING = 'jumping',
  JUMPING_UP = 'jumping_up',
  JUMPING_DOWN = 'jumping_down',
  CROUCH = 'crouch',
  DANCE = 'dance',
  WAVE = 'wave',
  NOD = 'nod',
  SHAKE_HEAD = 'shake_head',
}

/**
 * Animation configuration for SDK
 */
export interface AnimationConfig {
  fallbackAnimations?: VRMAnimation[]
  defaultLoopBehavior?: AnimationLoopBehavior
  enableAnimationEvents?: boolean
  animationTimeout?: number
}
