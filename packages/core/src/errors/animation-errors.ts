/**
 * Animation-related error classes
 */

/**
 * Base class for animation errors
 */
export class AnimationError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message)
    this.name = 'AnimationError'
  }
}

/**
 * Error thrown when animation is not found
 */
export class AnimationNotFoundError extends AnimationError {
  constructor(animationId: string) {
    super(`Animation '${animationId}' not found`)
    this.name = 'AnimationNotFoundError'
  }
}

/**
 * Error thrown when avatar is not spawned
 */
export class AvatarNotSpawnedError extends AnimationError {
  constructor(message = 'Avatar must be spawned to play animation') {
    super(message)
    this.name = 'AvatarNotSpawnedError'
  }
}

/**
 * Error thrown when animation playback fails
 */
export class AnimationPlaybackError extends AnimationError {
  constructor(message: string, cause?: Error) {
    super(message, cause)
    this.name = 'AnimationPlaybackError'
  }
}

/**
 * Error thrown when animation operation times out
 */
export class AnimationTimeoutError extends AnimationError {
  constructor(message = 'Animation operation timed out') {
    super(message)
    this.name = 'AnimationTimeoutError'
  }
}

/**
 * Error thrown when VRM animation file loading fails
 */
export class VRMAnimationLoadError extends AnimationError {
  constructor(filePath: string, cause?: Error) {
    super(`Failed to load VRM animation from: ${filePath}`, cause)
    this.name = 'VRMAnimationLoadError'
  }
}
