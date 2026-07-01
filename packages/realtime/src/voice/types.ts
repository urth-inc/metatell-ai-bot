// Use type-only imports to avoid circular dependencies.
import type { VoiceCapableClient } from '@metatell/bot-core'
import type { RealtimeTransport } from '../transport.js'

/**
 * Voice metadata.
 */
export interface VoiceMetadata {
  /** Sender identity. */
  fromIdentity?: string
  /** Sender SID for future expansion. */
  fromSid?: string
  /** Track SID for future expansion. */
  trackSid?: string
}

/**
 * Voice handlers.
 */
export interface VoiceHandlers {
  /**
   * Handles received PCM data (48 kHz, PCM16, mono).
   * @param pcm - Received PCM data.
   * @param meta - Metadata.
   */
  onRemotePcm?: (pcm: Int16Array, meta: VoiceMetadata) => Promise<void> | void

  /**
   * Local PCM source, such as TTS.
   * @returns AsyncIterable that yields 10 ms or 20 ms PCM frames.
   */
  getLocalPcmStream?: () => AsyncIterable<Int16Array>
}

/**
 * Options for attachVoice.
 */
export interface AttachVoiceOptions {
  /** Frame duration in milliseconds. Default: 20. */
  frameDurationMs?: 10 | 20
  /** Sample rate for metadata. Internally fixed at 48 kHz. Default: 48000. */
  sampleRate?: 48000 | 24000 | 16000
  /** Channel count. Sending requires mono audio. Default: 1. */
  channels?: 1 | 2
  /** Starts publishing automatically. Default: true. */
  autoStartPublish?: boolean
  /** Adds the audio topic automatically. Default: true. */
  enableTopicAutoAdd?: boolean
  /** Log tag. Default: 'voice.bridge'. */
  loggerTag?: string
}

/**
 * VoiceAttachment interface.
 */
export interface VoiceAttachment {
  /** Detaches the bridge. */
  detach(): Promise<void>
}

/**
 * Internal state management only. Not exported from the public entrypoint.
 */
export interface AttachmentState {
  agent: VoiceCapableClient
  transport: RealtimeTransport
  original: {
    sendVoiceFrame?: VoiceCapableClient['sendVoiceFrame']
    muteVoice?: VoiceCapableClient['muteVoice']
  }
  removeListener?: () => void
  abortController?: AbortController
  isPublishing: boolean
  expectedSamples: 480 | 960
}
