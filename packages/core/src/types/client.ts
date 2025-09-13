import type { VoiceCapableClient } from './voice.js'

/**
 * User information
 */
export interface User {
  /** User ID */
  id: string
  /** Display name */
  name: string
  /** Whether user is a bot */
  isBot: boolean
  /** Current position in 3D space */
  position?: { x: number; y: number; z: number }
  /** Current rotation */
  rotation?: { x: number; y: number; z: number; w: number }
}

/**
 * 3D vector
 */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * Euler rotation angles (degrees)
 */
export interface Euler {
  x: number
  y: number
  z: number
}

/**
 * Animation specification
 */
export interface Animation {
  /** Animation ID (for preset animations) */
  id?: string
  /** Animation URL (for custom animations) */
  url?: string
  /** Animation name */
  name?: string
  /** Duration in seconds */
  duration?: number
  /** Whether to loop */
  loop?: boolean
  /** Transition duration in seconds */
  transitionDuration?: number
}

/**
 * Avatar asset information
 */
export interface AvatarAsset {
  id: string
  name: string
  thumbnailUrl: string
  modelUrl: string
}

/**
 * Audio playback controls
 */
export interface PlaybackControls {
  /** Stop playback */
  stop: () => Promise<void>
  /** Promise that resolves when playback completes */
  finished: Promise<void>
}

/**
 * PCM audio input options
 */
export interface PcmInputOptions {
  /** Sample rate (Hz) */
  sampleRate: number
  /** Number of audio channels */
  channels: number
}

/**
 * Bot information
 */
export interface BotInfo {
  name: string
  version: string
  roomId: string
  sessionId?: string
}

/**
 * MetatellClient events
 */
export interface MetatellClientEvents {
  connected: () => void
  disconnected: () => void
  'user-join': (user: User) => void
  'user-leave': (user: User) => void
  'chat-message': (event: {
    from: User
    text: string
    mention?: {
      sessionId: string
      name: string
    }
  }) => void
  message: (data: unknown) => void
}

/**
 * Main client interface for interacting with Metatell services
 * Extends VoiceCapableClient to support voice features
 */
export interface MetatellClient extends VoiceCapableClient {
  /**
   * Connect to Metatell server and join the specified room
   * @throws {AuthError} If authentication token is invalid
   * @throws {NetworkError} If network connection fails
   */
  connect(): Promise<void>

  /**
   * Disconnect from the server
   */
  disconnect(): Promise<void>

  /** Room-related operations */
  readonly room: {
    /** Get list of users currently in the room */
    getUsers(): Promise<User[]>

    /** Get users within specified radius */
    getNearbyUsers(radius?: number): Promise<User[]>
  }

  /** Get list of users currently in the room (sync version) */
  getUsers(): User[]

  /** Chat-related operations */
  readonly chat: {
    /** Send message to entire room */
    send(text: string): Promise<void>

    /**
     * Subscribe to all chat messages
     * Receives all messages regardless of mentions
     */
    onMessage(
      handler: (event: {
        from: User
        text: string
        mention?: {
          sessionId: string
          name: string
        }
        /** Utility function to reply to the received message */
        reply: (text: string) => Promise<void>
      }) => void,
    ): void
  }

  /** Bot avatar operations */
  readonly avatar: {
    /**
     * Select/change avatar
     * @param assetId Organization avatar ID, etc.
     */
    select(assetId: string): Promise<void>

    /**
     * Play animation
     * @param animation Animation specification to play
     * @throws {NotFoundError} If specified animation doesn't exist
     */
    play(animation: Animation): Promise<void>

    /**
     * Move to specified coordinates
     * @param position Target coordinates (meters)
     */
    moveTo(position: Vec3): Promise<void>

    /**
     * Rotate to specified angle
     * @param rotation Rotation angle (Euler angles in degrees)
     */
    rotateTo(rotation: Euler): Promise<void>

    /**
     * Look at specified coordinates
     * @param target Target coordinates to look at (meters)
     */
    lookAt(target: Vec3): Promise<void>

    /** Get current position */
    getPosition(): Vec3 | null

    /** Get list of available avatar assets */
    getAvailableAssets(): Promise<AvatarAsset[]>

    /** Get list of available animations for current avatar */
    getAvailableAnimations(): Promise<Animation[]>
  }

  /** Voice-related operations */
  readonly voice: {
    /**
     * Inject 16-bit PCM data to make bot speak
     * SDK internally resamples to 48kHz/mono and splits into 10ms frames
     * @param input Int16Array, AsyncIterable<Int16Array>, or NodeJS.ReadableStream
     * @param options Input PCM format
     * @returns Object for controlling playback
     * @throws {UnsupportedAudioFormatError} If unsupported format is specified
     */
    playPcm(input: unknown, options: PcmInputOptions): Promise<PlaybackControls>
  }

  /** Get bot's own information */
  getInfo(): Promise<BotInfo>

  /** Get connection status */
  getStatus(): { connected: boolean; connecting: boolean }

  /** Get rate limit settings */
  getRateLimit(key: 'messages' | 'moves' | 'looks'): number | undefined

  /** Set rate limit */
  setRateLimit(key: 'messages' | 'moves' | 'looks', perSecond: number): void

  /**
   * Subscribe to SDK events
   * @param event Event name
   * @param listener Event handler
   */
  on<E extends keyof MetatellClientEvents>(event: E, listener: MetatellClientEvents[E]): this

  /**
   * Unsubscribe from SDK events
   */
  off<E extends keyof MetatellClientEvents>(event: E, listener: MetatellClientEvents[E]): this
}
