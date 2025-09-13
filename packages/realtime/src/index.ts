// Transport factory - hides implementation details
export { type CreateTransportOptions, createRealtimeTransport } from './create-transport.js'
export { type ErrorCode, ErrorCodes, RealtimeError } from './errors.js'
// For testing purposes only
export { MockAdapter } from './mock.js'
// Transport types only - not implementations
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
