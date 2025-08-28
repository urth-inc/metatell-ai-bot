import { describe, expect, it, vi } from 'vitest'
import { ErrorCodes } from './errors.js'
import { MockAdapter } from './mock.js'
import type { RealtimeEvent } from './transport.js'

describe('MockAdapter', () => {
  it('should initialize with idle state', () => {
    const adapter = new MockAdapter()
    expect(adapter.state).toBe('idle')
  })

  describe('connect', () => {
    it('should transition from idle to connected', async () => {
      const adapter = new MockAdapter()
      const events: RealtimeEvent[] = []

      adapter.on((e) => events.push(e))

      await adapter.connect({
        url: 'wss://mock.livekit.cloud',
        tokenProvider: async () => 'mock-token',
      })

      expect(adapter.state).toBe('connected')
      expect(events).toEqual([
        { type: 'state', state: 'connecting' },
        { type: 'state', state: 'connected' },
      ])
    })

    it('should emit participant-joined after connection', async () => {
      const adapter = new MockAdapter()
      const events: RealtimeEvent[] = []

      adapter.on((e) => events.push(e))

      await adapter.connect({
        url: 'wss://mock.livekit.cloud',
        tokenProvider: async () => 'mock-token',
      })

      // Wait for participant event
      await new Promise((resolve) => setTimeout(resolve, 150))

      const participantEvent = events.find((e) => e.type === 'participant-joined')
      expect(participantEvent).toMatchObject({
        type: 'participant-joined',
        identity: 'mock-participant',
        sid: 'mock-sid-123',
      })
    })

    it('should throw if already connecting', async () => {
      const adapter = new MockAdapter()

      const promise1 = adapter.connect({
        url: 'wss://mock.livekit.cloud',
        tokenProvider: async () => 'mock-token',
      })

      const promise2 = adapter.connect({
        url: 'wss://mock.livekit.cloud',
        tokenProvider: async () => 'mock-token',
      })

      await expect(promise2).rejects.toThrow(ErrorCodes.ALREADY_CONNECTING)
      await promise1
    })
  })

  describe('send', () => {
    it('should echo back sent data', async () => {
      const adapter = new MockAdapter()
      const events: RealtimeEvent[] = []

      adapter.on((e) => {
        if (e.type === 'data') events.push(e)
      })

      await adapter.connect({
        url: 'wss://mock.livekit.cloud',
        tokenProvider: async () => 'mock-token',
        topics: ['control', 'events'],
      })

      await adapter.send('control', JSON.stringify({ cmd: 'hello' }))

      // Wait for echo
      await new Promise((resolve) => setTimeout(resolve, 20))

      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        type: 'data',
        topic: 'control',
        from: 'mock-echo',
      })

      const dataEvent = events[0]
      if (!dataEvent || dataEvent.type !== 'data') {
        throw new Error('Expected data event')
      }
      const payload = new TextDecoder().decode(dataEvent.payload)
      expect(JSON.parse(payload)).toEqual({ cmd: 'hello' })
    })

    it('should throw for unknown topic', async () => {
      const adapter = new MockAdapter()

      await adapter.connect({
        url: 'wss://mock.livekit.cloud',
        tokenProvider: async () => 'mock-token',
        topics: ['control'],
      })

      await expect(adapter.send('unknown', 'data')).rejects.toThrow(ErrorCodes.UNKNOWN_TOPIC)
    })

    it('should throw if not connected', async () => {
      const adapter = new MockAdapter()

      await expect(adapter.send('control', 'data')).rejects.toThrow(ErrorCodes.NOT_CONNECTED)
    })
  })

  describe('audio publisher', () => {
    it('should start and stop audio publisher', async () => {
      const adapter = new MockAdapter()
      const logger = vi.fn()

      await adapter.connect({
        url: 'wss://mock.livekit.cloud',
        tokenProvider: async () => 'mock-token',
        logger,
      })

      await adapter.startAudioPublisher()
      expect(logger).toHaveBeenCalledWith('info', 'Mock audio publisher started')

      await adapter.stopAudioPublisher()
      expect(logger).toHaveBeenCalledWith('info', 'Mock audio publisher stopped', {
        totalFrames: 0,
      })
    })

    it('should count pushed frames', async () => {
      const adapter = new MockAdapter()
      const logger = vi.fn()

      await adapter.connect({
        url: 'wss://mock.livekit.cloud',
        tokenProvider: async () => 'mock-token',
        logger,
      })

      await adapter.startAudioPublisher()

      const frame = new Int16Array(480) // 10ms at 48kHz
      for (let i = 0; i < 100; i++) {
        await adapter.pushPcmFrame(frame)
      }

      expect(logger).toHaveBeenCalledWith('debug', 'Mock audio frames pushed: 100', {
        frameSize: 480,
      })

      await adapter.stopAudioPublisher()
      expect(logger).toHaveBeenCalledWith('info', 'Mock audio publisher stopped', {
        totalFrames: 100,
      })
    })

    it('should throw if audio not started', async () => {
      const adapter = new MockAdapter()

      await adapter.connect({
        url: 'wss://mock.livekit.cloud',
        tokenProvider: async () => 'mock-token',
      })

      const frame = new Int16Array(480)
      await expect(adapter.pushPcmFrame(frame)).rejects.toThrow(ErrorCodes.AUDIO_NOT_STARTED)
    })
  })

  describe('disconnect', () => {
    it('should transition to disconnected state', async () => {
      const adapter = new MockAdapter()
      const events: RealtimeEvent[] = []

      adapter.on((e) => events.push(e))

      await adapter.connect({
        url: 'wss://mock.livekit.cloud',
        tokenProvider: async () => 'mock-token',
      })

      await adapter.disconnect()

      expect(adapter.state).toBe('disconnected')
      const stateEvents = events.filter((e) => e.type === 'state')
      expect(stateEvents[stateEvents.length - 1]).toEqual({
        type: 'state',
        state: 'disconnected',
      })
    })
  })
})
