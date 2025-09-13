import { LiveKitAdapter } from './livekit.js'
import { MockAdapter } from './mock.js'
import type { RealtimeTransport } from './transport.js'

export interface CreateTransportOptions {
  /**
   * Transport type
   * - 'auto': Automatically select based on environment
   * - 'livekit': Use LiveKit (WebRTC) transport
   * - 'mock': Use mock transport for testing
   */
  type?: 'auto' | 'livekit' | 'mock'

  /**
   * Override the default realtime service URL
   * @default Automatically determined based on API endpoint
   */
  realtimeUrl?: string
}

/**
 * Create a RealtimeTransport instance
 * This factory hides the implementation details from SDK users
 */
export function createRealtimeTransport(options: CreateTransportOptions = {}): RealtimeTransport {
  const { type = 'auto' } = options

  // Determine transport type
  let transportType = type
  if (type === 'auto') {
    // In production, this would check environment and capabilities
    // For now, default to mock in test environment, livekit otherwise
    transportType = process.env.NODE_ENV === 'test' ? 'mock' : 'livekit'
  }

  // Create appropriate transport
  switch (transportType) {
    case 'livekit':
      return new LiveKitAdapter()

    case 'mock':
      return new MockAdapter()

    default:
      throw new Error(`Unknown transport type: ${transportType}`)
  }
}
