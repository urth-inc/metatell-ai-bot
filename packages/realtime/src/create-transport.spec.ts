import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreateTransportOptions } from './create-transport.js'
import { createRealtimeTransport } from './create-transport.js'

// Mock LiveKitAdapter since it has external dependencies
vi.mock('./livekit.js', () => ({
  LiveKitAdapter: vi.fn(() => ({
    state: 'idle',
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    sendAudio: vi.fn(),
  })),
}))

describe('createRealtimeTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.NODE_ENV
  })

  it('should create mock transport by default in test environment', () => {
    process.env.NODE_ENV = 'test'
    const transport = createRealtimeTransport()
    expect(transport.state).toBe('idle')
    // MockAdapterの特徴を確認
    expect(transport).toHaveProperty('connect')
    expect(transport).toHaveProperty('disconnect')
  })

  it('should create livekit transport by default in production', async () => {
    process.env.NODE_ENV = 'production'
    const { LiveKitAdapter } = await import('./livekit.js')
    const transport = createRealtimeTransport()
    expect(LiveKitAdapter).toHaveBeenCalled()
    expect(transport.state).toBe('idle')
  })

  it('should create mock transport when type is specified', () => {
    const options: CreateTransportOptions = { type: 'mock' }
    const transport = createRealtimeTransport(options)
    expect(transport.state).toBe('idle')
  })

  it('should create livekit transport when type is specified', async () => {
    const { LiveKitAdapter } = await import('./livekit.js')
    const options: CreateTransportOptions = { type: 'livekit' }
    createRealtimeTransport(options)
    expect(LiveKitAdapter).toHaveBeenCalled()
  })

  it('should handle auto type selection', () => {
    process.env.NODE_ENV = 'test'
    const options: CreateTransportOptions = { type: 'auto' }
    const transport = createRealtimeTransport(options)
    expect(transport.state).toBe('idle')
  })

  it('should throw error for unknown transport type', () => {
    const options = { type: 'unknown' } as CreateTransportOptions & { type: string }
    expect(() => createRealtimeTransport(options)).toThrow('Unknown transport type: unknown')
  })

  it('should work with empty options', () => {
    process.env.NODE_ENV = 'test'
    const transport = createRealtimeTransport()
    expect(transport).toBeDefined()
    expect(transport.state).toBe('idle')
  })

  it('should work with realtimeUrl option', () => {
    const options: CreateTransportOptions = {
      type: 'mock',
      realtimeUrl: 'wss://custom.example.com',
    }
    const transport = createRealtimeTransport(options)
    expect(transport).toBeDefined()
  })
})
