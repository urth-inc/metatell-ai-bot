import type { AgentClient } from '@metatell/bot-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InvalidAudioFrameError } from '../errors.js'
import { MockAdapter } from '../mock.js'
import type { RealtimeEvent } from '../transport.js'
import { attachVoice } from './agent-bridge.js'
import type { VoiceHandlers } from './types.js'

// Type for accessing MockAdapter internals in tests
interface MockAdapterInternal {
  activeTopics: Set<string>
  listeners: Set<(e: RealtimeEvent) => void>
}

// Mock AgentClient
function createMockAgent(): AgentClient {
  return {
    sendVoiceFrame: vi.fn().mockRejectedValue(new Error('Voice not implemented')),
    muteVoice: vi.fn().mockResolvedValue(undefined),
  } as unknown as AgentClient
}

describe('agent-bridge', () => {
  let agent: AgentClient
  let transport: MockAdapter
  let handlers: VoiceHandlers

  beforeEach(async () => {
    agent = createMockAgent()
    transport = new MockAdapter()
    // Spy on transport methods
    vi.spyOn(transport, 'pushPcmFrame')
    vi.spyOn(transport, 'startAudioPublisher')
    vi.spyOn(transport, 'stopAudioPublisher')

    // Connect transport for tests that need it
    await transport.connect({
      url: 'wss://test',
      tokenProvider: async () => 'test-token',
    })

    handlers = {
      onRemotePcm: vi.fn(),
      getLocalPcmStream: vi.fn(),
    }
  })

  afterEach(async () => {
    await transport.disconnect()
    vi.clearAllMocks()
  })

  describe('attachVoice', () => {
    it('should return detach function', async () => {
      const attachment = attachVoice(agent, transport, handlers)
      expect(attachment).toHaveProperty('detach')
      expect(typeof attachment.detach).toBe('function')
      await attachment.detach()
    })

    it('should add audio topic if not present', async () => {
      // MockAdapter has activeTopics
      const mockTransport = transport as unknown as MockAdapterInternal
      const activeTopics = mockTransport.activeTopics
      activeTopics.delete('audio')
      expect(activeTopics.has('audio')).toBe(false)

      const attachment = attachVoice(agent, transport, handlers)
      expect(activeTopics.has('audio')).toBe(true)

      await attachment.detach()
    })

    it('should not add audio topic if disabled', async () => {
      const mockTransport = transport as unknown as MockAdapterInternal
      const activeTopics = mockTransport.activeTopics
      activeTopics.delete('audio')

      const attachment = attachVoice(agent, transport, handlers, {
        enableTopicAutoAdd: false,
      })
      expect(activeTopics.has('audio')).toBe(false)

      await attachment.detach()
    })
  })

  describe('receive processing', () => {
    it('should call onRemotePcm when audio data received', async () => {
      const attachment = attachVoice(agent, transport, handlers)

      // Wait for mock audio to be emitted (participant joins after 100ms, then audio starts)
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(handlers.onRemotePcm).toHaveBeenCalled()
      const mockHandler = handlers.onRemotePcm as ReturnType<typeof vi.fn>
      const call = mockHandler.mock.calls[0]
      expect(call[0]).toBeInstanceOf(Int16Array)
      expect(call[0].length).toBe(960) // 20ms at 48kHz
      expect(call[1]).toMatchObject({ fromIdentity: 'mock-participant' })

      await attachment.detach()
    })

    it('should handle onRemotePcm errors gracefully', async () => {
      handlers.onRemotePcm = vi.fn().mockRejectedValue(new Error('Handler error'))

      const attachment = attachVoice(agent, transport, handlers)

      // Should not throw even if handler fails
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(handlers.onRemotePcm).toHaveBeenCalled()

      await attachment.detach()
    })

    it('should not setup receive if no handler', async () => {
      delete handlers.onRemotePcm
      const mockTransport = transport as unknown as MockAdapterInternal
      const listenersCount = mockTransport.listeners.size

      const attachment = attachVoice(agent, transport, handlers)

      // No new listener should be added
      expect(mockTransport.listeners.size).toBe(listenersCount)

      await attachment.detach()
    })
  })

  describe('send patching', () => {
    it('should patch sendVoiceFrame to use transport', async () => {
      // Set autoStartPublish to true and provide a stream
      handlers.getLocalPcmStream = vi.fn().mockImplementation(async function* () {
        yield new Int16Array(960)
      })

      const attachment = attachVoice(agent, transport, handlers, {
        autoStartPublish: true,
      })

      // Wait for auto publish to start
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Start audio publisher first
      await transport.startAudioPublisher()

      const pcm = new Int16Array(960) // 20ms frame
      await agent.sendVoiceFrame(pcm)

      expect(transport.pushPcmFrame).toHaveBeenCalledWith(pcm)

      await attachment.detach()
    })

    it('should validate frame size for 20ms', async () => {
      const attachment = attachVoice(agent, transport, handlers, {
        frameDurationMs: 20,
      })

      const invalidPcm = new Int16Array(480) // Wrong size for 20ms

      await expect(agent.sendVoiceFrame(invalidPcm)).rejects.toThrow(InvalidAudioFrameError)
      await expect(agent.sendVoiceFrame(invalidPcm)).rejects.toThrow('expected=960')

      await attachment.detach()
    })

    it('should validate frame size for 10ms', async () => {
      const attachment = attachVoice(agent, transport, handlers, {
        frameDurationMs: 10,
      })

      await transport.startAudioPublisher()

      const validPcm = new Int16Array(480) // Correct for 10ms
      await agent.sendVoiceFrame(validPcm)
      expect(transport.pushPcmFrame).toHaveBeenCalledWith(validPcm)

      const invalidPcm = new Int16Array(960) // Wrong size for 10ms
      await expect(agent.sendVoiceFrame(invalidPcm)).rejects.toThrow('expected=480')

      await attachment.detach()
    })

    it('should restore original sendVoiceFrame after detach', async () => {
      const _originalSendVoice = agent.sendVoiceFrame
      const attachment = attachVoice(agent, transport, handlers)

      await transport.startAudioPublisher()

      // Patched version works
      const pcm = new Int16Array(960)
      await agent.sendVoiceFrame(pcm)
      expect(transport.pushPcmFrame).toHaveBeenCalled()

      await attachment.detach()

      // Original throws again
      await expect(agent.sendVoiceFrame(pcm)).rejects.toThrow('Voice not implemented')
    })
  })

  describe('mute control', () => {
    it('should patch muteVoice to use transport', async () => {
      transport.setMicEnabled = vi.fn()
      const attachment = attachVoice(agent, transport, handlers)

      await agent.muteVoice(true)
      expect(transport.setMicEnabled).toHaveBeenCalledWith(false)

      await agent.muteVoice(false)
      expect(transport.setMicEnabled).toHaveBeenCalledWith(true)

      await attachment.detach()
    })

    it('should fallback to original if no setMicEnabled', async () => {
      // Create a transport without setMicEnabled
      const transportNoMic = new MockAdapter()
      await transportNoMic.connect({
        url: 'wss://test',
        tokenProvider: async () => 'test-token',
      })

      // Spy on transport to verify setMicEnabled is not called
      const setMicSpy = vi.spyOn(
        transportNoMic as unknown as { setMicEnabled: (enabled: boolean) => void },
        'setMicEnabled',
      )
      delete (transportNoMic as unknown as { setMicEnabled?: (enabled: boolean) => void })
        .setMicEnabled

      const attachment = attachVoice(agent, transportNoMic, handlers)

      // muteVoice should work without error (fallback to original)
      await expect(agent.muteVoice(true)).resolves.toBeUndefined()

      // Verify setMicEnabled was not called (it doesn't exist)
      expect(setMicSpy).not.toHaveBeenCalled()

      // Verify function was patched (it's a different function now)
      const patchedFunction = agent.muteVoice

      await attachment.detach()

      // Verify function was restored
      expect(agent.muteVoice).not.toBe(patchedFunction)

      await transportNoMic.disconnect()
    })

    it('should restore original muteVoice after detach', async () => {
      transport.setMicEnabled = vi.fn()
      const originalMute = agent.muteVoice
      const attachment = attachVoice(agent, transport, handlers)

      await agent.muteVoice(true)
      expect(transport.setMicEnabled).toHaveBeenCalled()

      await attachment.detach()

      // Clear previous calls
      vi.clearAllMocks()
      await agent.muteVoice(false)
      expect(transport.setMicEnabled).not.toHaveBeenCalled()
      expect(originalMute).toHaveBeenCalledWith(false)
    })
  })

  describe('auto publish', () => {
    it('should start publisher when autoStartPublish is true', async () => {
      handlers.getLocalPcmStream = vi.fn().mockImplementation(async function* () {
        yield new Int16Array(960)
      })

      const attachment = attachVoice(agent, transport, handlers, {
        autoStartPublish: true,
      })

      // Give time for async start
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(transport.startAudioPublisher).toHaveBeenCalled()
      expect(handlers.getLocalPcmStream).toHaveBeenCalled()

      await attachment.detach()
    })

    it('should not start publisher when autoStartPublish is false', async () => {
      const attachment = attachVoice(agent, transport, handlers, {
        autoStartPublish: false,
      })

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(transport.startAudioPublisher).not.toHaveBeenCalled()

      await attachment.detach()
    })

    it('should handle stream chunks with different sizes', async () => {
      const frames: Int16Array[] = []
      transport.pushPcmFrame = vi.fn().mockImplementation(async (frame) => {
        frames.push(frame)
      })

      handlers.getLocalPcmStream = vi.fn().mockImplementation(async function* () {
        yield new Int16Array(1920) // 40ms - will be chunked
        yield new Int16Array(480) // 10ms - will be padded
        yield new Int16Array(960) // 20ms - exact
      })

      const attachment = attachVoice(agent, transport, handlers, {
        frameDurationMs: 20,
      })

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Should have received proper frames
      expect(frames.length).toBeGreaterThanOrEqual(3)
      expect(frames.every((f) => f.length === 960)).toBe(true)

      await attachment.detach()
    })

    it('should stop on detach', async () => {
      let keepRunning = true
      handlers.getLocalPcmStream = vi.fn().mockImplementation(async function* () {
        while (keepRunning) {
          yield new Int16Array(960)
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
      })

      const attachment = attachVoice(agent, transport, handlers)
      await new Promise((resolve) => setTimeout(resolve, 50))

      const mockPushPcm = transport.pushPcmFrame as ReturnType<typeof vi.fn>
      const callCount = mockPushPcm.mock.calls.length
      expect(callCount).toBeGreaterThan(0)

      keepRunning = false
      await attachment.detach()
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(transport.stopAudioPublisher).toHaveBeenCalled()
    })
  })

  describe('multiple attachments', () => {
    it('should detach previous when attaching again', async () => {
      // This test verifies that multiple attachments are properly managed
      // and the previous attachment is auto-detached

      // First attachment
      const attachment1 = attachVoice(agent, transport, handlers)

      // Verify patching occurred
      const patchedFunction1 = agent.sendVoiceFrame

      // Second attachment - should auto-detach first
      const attachment2 = attachVoice(agent, transport, handlers)

      // Verify it's a new patched function
      const patchedFunction2 = agent.sendVoiceFrame
      expect(patchedFunction2).not.toBe(patchedFunction1)

      // Manually detach second attachment
      await attachment2.detach()

      // Verify detach is idempotent (safe to call multiple times)
      await attachment1.detach()
      await attachment2.detach()

      // Function should be restored (will throw original error)
      // Note: The restored function is a bound version, not the exact original reference
      const restoredFunction = agent.sendVoiceFrame
      expect(restoredFunction).not.toBe(patchedFunction1)
      expect(restoredFunction).not.toBe(patchedFunction2)
    })

    it('should handle multiple agents independently', async () => {
      const agent2 = createMockAgent()
      const transport2 = new MockAdapter()
      vi.spyOn(transport2, 'pushPcmFrame')

      await transport2.connect({
        url: 'wss://test',
        tokenProvider: async () => 'test-token',
      })

      const attachment1 = attachVoice(agent, transport, handlers)
      const attachment2 = attachVoice(agent2, transport2, handlers)

      await transport.startAudioPublisher()
      await transport2.startAudioPublisher()

      const pcm = new Int16Array(960)
      await agent.sendVoiceFrame(pcm)
      await agent2.sendVoiceFrame(pcm)

      expect(transport.pushPcmFrame).toHaveBeenCalledWith(pcm)
      expect(transport2.pushPcmFrame).toHaveBeenCalledWith(pcm)

      await attachment1.detach()

      // agent1 restored, agent2 still patched
      await expect(agent.sendVoiceFrame(pcm)).rejects.toThrow('Voice not implemented')
      await agent2.sendVoiceFrame(pcm)

      await attachment2.detach()
      await transport2.disconnect()
    })
  })

  describe('error handling', () => {
    it('should handle publisher start failure', async () => {
      transport.startAudioPublisher = vi.fn().mockRejectedValue(new Error('Start failed'))

      handlers.getLocalPcmStream = vi.fn().mockImplementation(async function* () {
        yield new Int16Array(960)
      })

      // Should not throw
      const attachment = attachVoice(agent, transport, handlers)
      await new Promise((resolve) => setTimeout(resolve, 50))

      await attachment.detach()
    })

    it('should handle stream errors', async () => {
      handlers.getLocalPcmStream = vi.fn().mockImplementation(async function* () {
        yield new Int16Array(960)
        throw new Error('Stream error')
      })

      const attachment = attachVoice(agent, transport, handlers)
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Should have processed first frame before error
      expect(transport.pushPcmFrame).toHaveBeenCalledTimes(1)

      await attachment.detach()
    })

    it('should handle detach errors gracefully', async () => {
      transport.stopAudioPublisher = vi.fn().mockRejectedValue(new Error('Stop failed'))

      const attachment = attachVoice(agent, transport, handlers)
      await transport.startAudioPublisher()

      // Should not throw
      await attachment.detach()

      // Methods should still be restored
      await expect(agent.sendVoiceFrame(new Int16Array(960))).rejects.toThrow(
        'Voice not implemented',
      )
    })
  })
})
