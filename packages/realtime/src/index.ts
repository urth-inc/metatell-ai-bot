export { type ErrorCode, ErrorCodes, RealtimeError } from './errors.js'

export { LiveKitAdapter } from './livekit.js'
export { MockAdapter } from './mock.js'
export type {
  ConnectionState,
  RealtimeEvent,
  RealtimeOptions,
  RealtimeTransport,
  TokenProvider,
} from './transport.js'

// Voice bridge exports
export { attachVoice } from './voice/agent-bridge.js'
export type {
  AttachVoiceOptions,
  VoiceAttachment,
  VoiceHandlers,
  VoiceMetadata,
} from './voice/types.js'
