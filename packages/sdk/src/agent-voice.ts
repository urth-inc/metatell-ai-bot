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
function getRealtimeUrl(client: VoiceCapableClient): string {
  // Use environment variable if provided
  if (process.env.METATELL_REALTIME_URL) {
    console.log('[Voice] Using realtime URL from env:', process.env.METATELL_REALTIME_URL)
    return process.env.METATELL_REALTIME_URL
  }

  // Try to derive from client configuration if possible
  let derivedUrl = 'wss://localhost:7880' // Default fallback

  // Determine LiveKit URL based on server URL
  if ('options' in client && client.options && typeof client.options === 'object') {
    const options = client.options as { serverUrl?: string }
    if (options.serverUrl) {
      if (options.serverUrl.includes('metatell-stg.app')) {
        // Staging environment
        derivedUrl = 'wss://metatell-staging-5uyteddc.livekit.cloud'
      } else if (options.serverUrl.includes('metatell.app')) {
        // Production environment
        derivedUrl = 'wss://metatell-j60u6y2i.livekit.cloud'
      } else if (
        options.serverUrl.includes('localhost') ||
        options.serverUrl.includes('127.0.0.1')
      ) {
        // Development environment
        derivedUrl = 'wss://metatell-development-dddrbuyu.livekit.cloud'
      }
    }
  }

  console.log('[Voice] Derived realtime URL:', derivedUrl)
  return derivedUrl
}

/**
 * Get realtime service token
 * @internal
 */
async function getRealtimeToken(client: VoiceCapableClient): Promise<string> {
  // Try to get session ID for identity
  const sessionId = client.getSessionId()
  if (!sessionId) {
    throw new Error('Client session not established. Cannot get realtime token.')
  }

  // Extract roomId and serverUrl from client if possible
  let roomId = 'unknown-room'
  let serverUrl = 'wss://urth.metatell-stg.app'

  if (
    'options' in client &&
    client.options &&
    typeof client.options === 'object' &&
    client.options !== null
  ) {
    const options = client.options as { roomId?: string; serverUrl?: string }
    if ('roomId' in options && options.roomId) {
      roomId = options.roomId
    }
    if ('serverUrl' in options && options.serverUrl) {
      serverUrl = options.serverUrl
    }
  }

  // Use v-air_client compatible endpoint for LiveKit token
  // POST /livekit/api/token with roomName and identity
  try {
    // Convert WebSocket URL to HTTP URL for API call
    const httpUrl = serverUrl.replace(/^wss?:\/\//, 'https://')
    const baseUrl = httpUrl
    const tokenUrl = `${baseUrl}/livekit/api/token`

    // v-air_clientと同じ形式でroomNameを構成
    const channelName = `microphone:${roomId}`

    console.log('[Voice] Requesting LiveKit token from:', tokenUrl)
    console.log('[Voice] Request payload:', { roomName: channelName, identity: sessionId })

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roomName: channelName,
        identity: sessionId,
      }),
    })

    console.log('[Voice] Token response status:', response.status, response.statusText)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Voice] Token response body:', errorText)
      throw new Error(`Failed to get LiveKit token: ${response.statusText} - ${errorText}`)
    }

    const data = (await response.json()) as { token?: string }
    console.log('[Voice] Token response data:', data)

    if (!data.token) {
      throw new Error('LiveKit token not found in response')
    }

    console.log('[Voice] Successfully obtained LiveKit token (length:', data.token.length, ')')
    return data.token
  } catch (error) {
    console.error('[Voice] Failed to get LiveKit token:', error)
    // Fallback to placeholder for development
    console.warn('[Voice] Using placeholder token for development')
    return 'realtime-token-placeholder'
  }
}
