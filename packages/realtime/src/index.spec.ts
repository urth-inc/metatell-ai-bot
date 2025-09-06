import { describe, expect, it } from 'vitest'
import { ErrorCodes, LiveKitAdapter, MockAdapter, RealtimeError } from './index.js'

describe('Realtime Index', () => {
  describe('exports', () => {
    it('should export ErrorCodes', () => {
      expect(ErrorCodes).toBeDefined()
      expect(typeof ErrorCodes).toBe('object')
    })

    it('should export RealtimeError', () => {
      expect(RealtimeError).toBeDefined()
      expect(typeof RealtimeError).toBe('function')
    })

    it('should export LiveKitAdapter', () => {
      expect(LiveKitAdapter).toBeDefined()
      expect(typeof LiveKitAdapter).toBe('function')
    })

    it('should export MockAdapter', () => {
      expect(MockAdapter).toBeDefined()
      expect(typeof MockAdapter).toBe('function')
    })
  })

  describe('RealtimeError', () => {
    it('should create RealtimeError with code and message', () => {
      const error = new RealtimeError('CONNECTION_FAILED', 'Failed to connect')

      expect(error).toBeInstanceOf(Error)
      expect(error.code).toBe('CONNECTION_FAILED')
      expect(error.message).toBe('Failed to connect')
    })
  })
})
