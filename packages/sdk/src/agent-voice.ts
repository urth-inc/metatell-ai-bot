import type { VoiceCapableClient } from '@metatell/bot-core'

// Type definitions for when @metatell/bot-realtime is not available
export interface VoiceHandlers {
  onRemotePcm?: (pcm: Int16Array, meta: { fromIdentity?: string }) => Promise<void> | void
  getLocalPcmStream?: () => AsyncIterable<Int16Array>
}

export interface AttachVoiceOptions {
  frameDurationMs?: 10 | 20
  sampleRate?: 48000 | 24000 | 16000
  channels?: 1 | 2
  autoStartPublish?: boolean
  enableTopicAutoAdd?: boolean
  loggerTag?: string
}

export interface CreateTransportOptions {
  type?: 'auto' | 'livekit' | 'mock'
  realtimeUrl?: string
}

export interface VoiceAttachment {
  detach: () => Promise<void>
}

export interface RealtimeTransport {
  connect(options: { url: string; tokenProvider: () => Promise<string> }): Promise<void>
  disconnect(): Promise<void>
}

/**
 * Voice configuration for AgentClient
 */
export interface AgentVoiceConfig extends AttachVoiceOptions {
  /**
   * Voice handlers for STT/TTS integration
   */
  handlers: VoiceHandlers

  /**
   * Transport configuration
   */
  transport?: CreateTransportOptions
}

/**
 * Extended voice attachment with transport management
 */
export interface AgentVoiceAttachment extends VoiceAttachment {
  /**
   * The underlying transport (for advanced use cases)
   */
  readonly transport: RealtimeTransport
}

// Type for the realtime module
type RealtimeModule = {
  createRealtimeTransport: (options: CreateTransportOptions) => RealtimeTransport
  attachVoice: (
    client: VoiceCapableClient,
    transport: RealtimeTransport,
    handlers: VoiceHandlers,
    options: AttachVoiceOptions,
  ) => VoiceAttachment
}

// Dynamic import wrapper
let realtimeModule: RealtimeModule | null = null

async function getRealtimeModule(): Promise<RealtimeModule> {
  if (realtimeModule) return realtimeModule

  try {
    const module = await import('@metatell/bot-realtime')
    // Cast to our expected interface since dynamic imports lose type info
    realtimeModule = module as unknown as RealtimeModule
    return realtimeModule
  } catch (_error) {
    throw new Error(
      'Voice capabilities require @metatell/bot-realtime package. ' +
        'Please install it with: npm install @metatell/bot-realtime',
    )
  }
}

/**
 * Enable voice capabilities on a voice-capable client
 * This is the high-level API that hides transport details
 *
 * @example
 * ```ts
 * // With MetatellClient
 * const client = createMetatellClient({ serverUrl, roomId })
 * const voice = await enableVoice(client, { handlers: {...} })
 *
 * // With AgentClient
 * const agent = createAgentClient({ apiKey })
 * const voice = await enableVoice(agent, { handlers: {...} })
 *
 * // Later...
 * await voice.detach()
 * ```
 */
export async function enableVoice(
  client: VoiceCapableClient,
  config: AgentVoiceConfig,
): Promise<AgentVoiceAttachment> {
  const { handlers, transport: transportOptions = {}, ...attachOptions } = config

  // Dynamically import @metatell/bot-realtime
  const { createRealtimeTransport, attachVoice } = await getRealtimeModule()

  // Create transport (implementation details hidden)
  const transport = createRealtimeTransport(transportOptions)

  // Connect transport
  // URL and token are managed internally based on client configuration
  await transport.connect({
    url: getRealtimeUrl(client),
    tokenProvider: async () => getRealtimeToken(client),
  })

  // Attach voice bridge
  const attachment = attachVoice(client, transport, handlers, attachOptions)

  // Return extended attachment
  return {
    ...attachment,
    transport,
    detach: async () => {
      await attachment.detach()
      await transport.disconnect()
    },
  }
}

/**
 * Get realtime service URL from client configuration
 * @internal
 */
function getRealtimeUrl(_client: VoiceCapableClient): string {
  // Use environment variable if provided
  if (process.env.METATELL_REALTIME_URL) {
    console.log('[Voice] Using realtime URL from env:', process.env.METATELL_REALTIME_URL)
    return process.env.METATELL_REALTIME_URL
  }

  // Try to derive from client configuration if possible
  // This is a temporary solution - in production, this should be properly implemented
  let derivedUrl = 'wss://localhost:7880' // Default fallback

  // Try common LiveKit subdomain patterns based on current staging setup
  // urth.metatell-stg.app -> livekit.metatell-stg.app or ws.metatell-stg.app
  if (process.env.NODE_ENV !== 'test') {
    derivedUrl = 'wss://livekit.metatell-stg.app'
  }

  console.log('[Voice] Derived realtime URL:', derivedUrl)
  return derivedUrl
}

/**
 * Get realtime service token
 * @internal
 */
async function getRealtimeToken(_client: VoiceCapableClient): Promise<string> {
  // In production, this would request a token from the API
  // using the client's existing authentication
  // For now, return a placeholder
  return 'realtime-token-placeholder'
}
