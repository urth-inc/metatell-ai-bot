/**
 * Core type definitions for MetatellClient facade API
 */

// Basic types
export type Vec3 = { x: number; y: number; z: number } // Unit: meters.
export type Euler = { x: number; y: number; z: number } // Unit: degrees.
export type User = {
  id: string
  name: string | null
  isBot?: boolean
  position?: Vec3
  rotation?: Euler
}
export type BotInfo = { name: string; version: string; roomId: string; sessionId?: string }
export type AvatarAsset = {
  id: string
  name: string
  thumbnailUrl: string
  modelUrl: string
  tags?: string[]
}
export type Animation = {
  id: string
  url?: string
  name?: string
  loop?: boolean
  speed?: number
  duration?: number
  transitionDuration?: number
}

// Configuration options
export interface CreateClientOptions {
  /**
   * WebSocket server URL
   * - Format: ws(s)://<host>. No path is required. Example: wss://metatell.app
   * - For Metatell domains (metatell.app, metatell-stg.app, metatell-dev.app),
   *   tenant subdomains are automatically removed.
   *   Example: https://urth.metatell-stg.app -> wss://metatell-stg.app
   */
  serverUrl: string
  roomId: string
  token?: string // Authentication token. Whether it is required depends on the environment.
  username?: string // Bot name.
  avatarId?: string // Avatar ID. Uses the default when omitted.
  debug?: boolean // Debug mode.
  logger?: 'silent' | 'info' | 'debug' // Log level.
  reconnect?: { enabled?: boolean; maxDelayMs?: number }
}

// Audio-related types
export type PcmInput = Int16Array | AsyncIterable<Int16Array> | NodeJS.ReadableStream

export interface PcmInputOptions {
  sampleRateHz: number // For example, 16000, 24000, or 48000.
  channels: 1 | 2
}

export interface PlaybackControls {
  /** Stops the current audio playback. */
  stop(): Promise<void>
  /** Promise that resolves when playback finishes. */
  finished: Promise<void>
}

// Type-safe event system
// Message event data type definition.
export interface MessageEventData {
  body?: string
  senderId?: string
  type?: string
  timestamp?: number
}

export interface MetatellClientEvents {
  connected: () => void
  disconnected: (reason?: string) => void
  error: (error: MetatellError) => void
  message: (data: MessageEventData) => void
  'chat-message': (message: {
    from: User
    text: string
    mention?: {
      sessionId: string
      name: string
    }
  }) => void
  'user-join': (user: User) => void
  'user-leave': (user: User) => void
}

// Error class hierarchy
export class MetatellError extends Error {
  constructor(
    public code: string,
    message: string,
    public cause?: unknown,
  ) {
    super(message)
    this.name = 'MetatellError'
  }
}

export class AuthError extends MetatellError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, cause)
    this.name = 'AuthError'
  }
}

export class NetworkError extends MetatellError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, cause)
    this.name = 'NetworkError'
  }
}

export class NotFoundError extends MetatellError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, cause)
    this.name = 'NotFoundError'
  }
}

export class RateLimitError extends MetatellError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, cause)
    this.name = 'RateLimitError'
  }
}

export class UnsupportedAudioFormatError extends MetatellError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, cause)
    this.name = 'UnsupportedAudioFormatError'
  }
}
