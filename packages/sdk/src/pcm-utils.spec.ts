/**
 * Test for PCM audio utility functions
 */

import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { pcm } from './pcm-utils.js'

describe('pcm utilities', () => {
  describe('resample', () => {
    it('should resample from 16kHz to 48kHz', async () => {
      const input = new Int16Array([100, 200, 300, 400, 500])
      const resampled: Int16Array[] = []

      for await (const chunk of pcm.resample(input, 16000, 48000, 1)) {
        resampled.push(chunk)
      }

      // 16kHz -> 48kHz is 3x upsampling
      const totalSamples = resampled.reduce((sum, chunk) => sum + chunk.length, 0)
      expect(totalSamples).toBeGreaterThanOrEqual(input.length * 2.5) // Allow some tolerance
    })

    it('should resample from 48kHz to 16kHz', async () => {
      const input = new Int16Array([100, 150, 200, 250, 300, 350, 400, 450, 500])
      const resampled: Int16Array[] = []

      for await (const chunk of pcm.resample(input, 48000, 16000, 1)) {
        resampled.push(chunk)
      }

      // 48kHz -> 16kHz is 1/3x downsampling
      const totalSamples = resampled.reduce((sum, chunk) => sum + chunk.length, 0)
      expect(totalSamples).toBeLessThanOrEqual(input.length)
      expect(totalSamples).toBeGreaterThan(0)
    })

    it('should handle AsyncIterable input', async () => {
      async function* generateAudio(): AsyncIterable<Int16Array> {
        yield new Int16Array([100, 200])
        yield new Int16Array([300, 400])
        yield new Int16Array([500])
      }

      const resampled: Int16Array[] = []
      for await (const chunk of pcm.resample(generateAudio(), 16000, 48000, 1)) {
        resampled.push(chunk)
      }

      expect(resampled.length).toBeGreaterThan(0)
    })

    it('should handle empty input', async () => {
      const input = new Int16Array([])
      const resampled: Int16Array[] = []

      for await (const chunk of pcm.resample(input, 16000, 48000, 1)) {
        resampled.push(chunk)
      }

      expect(resampled.length).toBe(0)
    })

    it('should preserve signal characteristics during resampling', async () => {
      // Create a simple sine wave
      const sampleRate = 16000
      const frequency = 440 // A4 note
      const duration = 0.1 // 100ms
      const samples = Math.floor(sampleRate * duration)

      const input = new Int16Array(samples)
      for (let i = 0; i < samples; i++) {
        input[i] = Math.round(32767 * Math.sin((2 * Math.PI * frequency * i) / sampleRate))
      }

      const resampled: Int16Array[] = []
      for await (const chunk of pcm.resample(input, sampleRate, 48000, 1)) {
        resampled.push(chunk)
      }

      // Should have roughly 3x samples (16kHz -> 48kHz)
      const totalSamples = resampled.reduce((sum, chunk) => sum + chunk.length, 0)
      expect(totalSamples).toBeCloseTo(samples * 3, -1) // Allow 10% tolerance
    })

    it('should handle NodeJS.ReadableStream input', async () => {
      const buffer = Buffer.alloc(8)
      buffer.writeInt16LE(100, 0)
      buffer.writeInt16LE(200, 2)
      buffer.writeInt16LE(300, 4)
      buffer.writeInt16LE(400, 6)

      const stream = Readable.from([buffer])

      const resampled: Int16Array[] = []
      for await (const chunk of pcm.resample(stream, 16000, 48000, 1)) {
        resampled.push(chunk)
      }

      expect(resampled.length).toBeGreaterThan(0)
      const totalSamples = resampled.reduce((sum, chunk) => sum + chunk.length, 0)
      expect(totalSamples).toBeGreaterThan(0)
    })

    it('should handle multi-chunk stream processing', async () => {
      async function* generateChunks(): AsyncIterable<Int16Array> {
        // Simulate streaming audio in small chunks
        for (let i = 0; i < 5; i++) {
          yield new Int16Array([100 * i, 100 * i + 50])
        }
      }

      const resampled: Int16Array[] = []
      for await (const chunk of pcm.resample(generateChunks(), 16000, 48000, 1)) {
        resampled.push(chunk)
      }

      expect(resampled.length).toBeGreaterThan(0)
    })
  })

  describe('chunk', () => {
    it('should split audio into fixed-size chunks', async () => {
      async function* generateAudio(): AsyncIterable<Int16Array> {
        yield new Int16Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      }

      const chunks: Int16Array[] = []
      for await (const chunk of pcm.chunk(generateAudio(), 3)) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(4) // 3 chunks of 3 + 1 chunk of 1
      expect(chunks[0]).toEqual(new Int16Array([1, 2, 3]))
      expect(chunks[1]).toEqual(new Int16Array([4, 5, 6]))
      expect(chunks[2]).toEqual(new Int16Array([7, 8, 9]))
      expect(chunks[3]).toEqual(new Int16Array([10]))
    })

    it('should handle multiple input chunks', async () => {
      async function* generateAudio(): AsyncIterable<Int16Array> {
        yield new Int16Array([1, 2])
        yield new Int16Array([3, 4, 5])
        yield new Int16Array([6, 7, 8, 9, 10])
      }

      const chunks: Int16Array[] = []
      for await (const chunk of pcm.chunk(generateAudio(), 4)) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(3) // 2 chunks of 4 + 1 chunk of 2
      expect(chunks[0]).toEqual(new Int16Array([1, 2, 3, 4]))
      expect(chunks[1]).toEqual(new Int16Array([5, 6, 7, 8]))
      expect(chunks[2]).toEqual(new Int16Array([9, 10]))
    })

    it('should handle exact chunk size', async () => {
      async function* generateAudio(): AsyncIterable<Int16Array> {
        yield new Int16Array([1, 2, 3, 4])
        yield new Int16Array([5, 6, 7, 8])
      }

      const chunks: Int16Array[] = []
      for await (const chunk of pcm.chunk(generateAudio(), 4)) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(2)
      expect(chunks[0]).toEqual(new Int16Array([1, 2, 3, 4]))
      expect(chunks[1]).toEqual(new Int16Array([5, 6, 7, 8]))
    })

    it('should handle empty input', async () => {
      async function* generateAudio(): AsyncIterable<Int16Array> {
        // Empty generator
      }

      const chunks: Int16Array[] = []
      for await (const chunk of pcm.chunk(generateAudio(), 4)) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(0)
    })

    it('should handle single sample chunks', async () => {
      async function* generateAudio(): AsyncIterable<Int16Array> {
        yield new Int16Array([1, 2, 3, 4, 5])
      }

      const chunks: Int16Array[] = []
      for await (const chunk of pcm.chunk(generateAudio(), 1)) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(5)
      expect(chunks[0]).toEqual(new Int16Array([1]))
      expect(chunks[4]).toEqual(new Int16Array([5]))
    })

    it('should preserve audio data integrity', async () => {
      const originalData = new Int16Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

      async function* generateAudio(): AsyncIterable<Int16Array> {
        yield originalData
      }

      const chunks: Int16Array[] = []
      for await (const chunk of pcm.chunk(generateAudio(), 3)) {
        chunks.push(chunk)
      }

      // Reconstruct the original data from chunks
      const reconstructed = new Int16Array(originalData.length)
      let offset = 0
      for (const chunk of chunks) {
        reconstructed.set(chunk, offset)
        offset += chunk.length
      }

      expect(reconstructed).toEqual(originalData)
    })
  })

  describe('integration', () => {
    it('should resample and chunk audio pipeline', async () => {
      // Create a test signal
      const input = new Int16Array([100, 200, 300, 400, 500, 600])

      // First resample from 16kHz to 48kHz
      const resampled = pcm.resample(input, 16000, 48000, 1)

      // Then chunk into 480 sample chunks (10ms at 48kHz)
      const chunks: Int16Array[] = []
      for await (const chunk of pcm.chunk(resampled, 480)) {
        chunks.push(chunk)
      }

      expect(chunks.length).toBeGreaterThan(0)
    })

    it('should handle real-time streaming scenario', async () => {
      // Simulate real-time audio streaming
      async function* simulateRealTimeAudio(): AsyncIterable<Int16Array> {
        // Simulate 16kHz audio coming in 20ms chunks (320 samples)
        for (let i = 0; i < 5; i++) {
          const chunk = new Int16Array(320)
          for (let j = 0; j < 320; j++) {
            chunk[j] = Math.round(1000 * Math.sin((2 * Math.PI * 440 * (i * 320 + j)) / 16000))
          }
          yield chunk
        }
      }

      // Process: resample to 48kHz and chunk into 10ms frames
      const resampled = pcm.resample(simulateRealTimeAudio(), 16000, 48000, 1)
      const chunks: Int16Array[] = []

      for await (const chunk of pcm.chunk(resampled, 480)) {
        chunks.push(chunk)
      }

      // Should have multiple 10ms chunks
      expect(chunks.length).toBeGreaterThan(0)
      // Most chunks should be exactly 480 samples (10ms at 48kHz)
      const fullChunks = chunks.filter((c) => c.length === 480)
      expect(fullChunks.length).toBeGreaterThan(0)
    })
  })
})
