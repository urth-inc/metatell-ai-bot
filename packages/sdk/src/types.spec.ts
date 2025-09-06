/**
 * Test for SDK type definitions and error classes
 */

import { describe, expect, it } from 'vitest'
import {
  AuthError,
  MetatellError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  UnsupportedAudioFormatError,
} from './types.js'

describe('Error classes', () => {
  describe('MetatellError', () => {
    it('should create error with code and message', () => {
      const error = new MetatellError('TEST_ERROR', 'Test error message')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(MetatellError)
      expect(error.code).toBe('TEST_ERROR')
      expect(error.message).toBe('Test error message')
      expect(error.cause).toBeUndefined()
    })

    it('should create error with cause', () => {
      const cause = new Error('Original error')
      const error = new MetatellError('WRAPPED_ERROR', 'Wrapped error message', cause)

      expect(error.code).toBe('WRAPPED_ERROR')
      expect(error.message).toBe('Wrapped error message')
      expect(error.cause).toBe(cause)
    })

    it('should have correct error name', () => {
      const error = new MetatellError('TEST', 'test')
      expect(error.name).toBe('MetatellError')
    })

    it('should have proper stack trace', () => {
      const error = new MetatellError('TEST', 'test')
      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('MetatellError')
    })
  })

  describe('AuthError', () => {
    it('should extend MetatellError', () => {
      const error = new AuthError('AUTH_FAILED', 'Authentication failed')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(MetatellError)
      expect(error).toBeInstanceOf(AuthError)
      expect(error.code).toBe('AUTH_FAILED')
      expect(error.message).toBe('Authentication failed')
    })

    it('should support cause parameter', () => {
      const cause = new Error('Token expired')
      const error = new AuthError('TOKEN_EXPIRED', 'Authentication token expired', cause)

      expect(error.cause).toBe(cause)
    })

    it('should have correct error name', () => {
      const error = new AuthError('TEST', 'test')
      expect(error.name).toBe('AuthError')
    })
  })

  describe('NetworkError', () => {
    it('should extend MetatellError', () => {
      const error = new NetworkError('CONNECTION_FAILED', 'Failed to connect')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(MetatellError)
      expect(error).toBeInstanceOf(NetworkError)
      expect(error.code).toBe('CONNECTION_FAILED')
      expect(error.message).toBe('Failed to connect')
    })

    it('should support network-specific error scenarios', () => {
      const timeoutError = new NetworkError('TIMEOUT', 'Connection timeout')
      expect(timeoutError.code).toBe('TIMEOUT')

      const dnsError = new NetworkError('DNS_FAILED', 'DNS resolution failed')
      expect(dnsError.code).toBe('DNS_FAILED')
    })

    it('should have correct error name', () => {
      const error = new NetworkError('TEST', 'test')
      expect(error.name).toBe('NetworkError')
    })
  })

  describe('NotFoundError', () => {
    it('should extend MetatellError', () => {
      const error = new NotFoundError('RESOURCE_NOT_FOUND', 'Resource not found')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(MetatellError)
      expect(error).toBeInstanceOf(NotFoundError)
      expect(error.code).toBe('RESOURCE_NOT_FOUND')
      expect(error.message).toBe('Resource not found')
    })

    it('should handle various not-found scenarios', () => {
      const avatarError = new NotFoundError('AVATAR_NOT_FOUND', 'Avatar asset not found')
      expect(avatarError.code).toBe('AVATAR_NOT_FOUND')

      const animationError = new NotFoundError('ANIMATION_NOT_FOUND', 'Animation not found')
      expect(animationError.code).toBe('ANIMATION_NOT_FOUND')
    })

    it('should have correct error name', () => {
      const error = new NotFoundError('TEST', 'test')
      expect(error.name).toBe('NotFoundError')
    })
  })

  describe('RateLimitError', () => {
    it('should extend MetatellError', () => {
      const error = new RateLimitError('RATE_LIMIT_EXCEEDED', 'Rate limit exceeded')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(MetatellError)
      expect(error).toBeInstanceOf(RateLimitError)
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED')
      expect(error.message).toBe('Rate limit exceeded')
    })

    it('should support rate limit details', () => {
      const details = { limit: 100, window: '1m', remaining: 0 }
      const error = new RateLimitError('MESSAGES_LIMIT', 'Message rate limit exceeded', details)

      expect(error.cause).toBe(details)
    })

    it('should have correct error name', () => {
      const error = new RateLimitError('TEST', 'test')
      expect(error.name).toBe('RateLimitError')
    })
  })

  describe('UnsupportedAudioFormatError', () => {
    it('should extend MetatellError', () => {
      const error = new UnsupportedAudioFormatError('INVALID_FORMAT', 'Unsupported audio format')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(MetatellError)
      expect(error).toBeInstanceOf(UnsupportedAudioFormatError)
      expect(error.code).toBe('INVALID_FORMAT')
      expect(error.message).toBe('Unsupported audio format')
    })

    it('should handle various audio format errors', () => {
      const sampleRateError = new UnsupportedAudioFormatError(
        'INVALID_SAMPLE_RATE',
        'Sample rate 11025Hz is not supported',
      )
      expect(sampleRateError.message).toContain('11025Hz')

      const channelError = new UnsupportedAudioFormatError(
        'INVALID_CHANNELS',
        'Only mono and stereo audio are supported',
      )
      expect(channelError.message).toContain('mono and stereo')
    })

    it('should have correct error name', () => {
      const error = new UnsupportedAudioFormatError('TEST', 'test')
      expect(error.name).toBe('UnsupportedAudioFormatError')
    })
  })

  describe('Error inheritance chain', () => {
    it('should maintain proper prototype chain', () => {
      const authError = new AuthError('TEST', 'test')
      const networkError = new NetworkError('TEST', 'test')
      const notFoundError = new NotFoundError('TEST', 'test')
      const rateLimitError = new RateLimitError('TEST', 'test')
      const audioError = new UnsupportedAudioFormatError('TEST', 'test')

      // All should be instances of Error
      expect(authError).toBeInstanceOf(Error)
      expect(networkError).toBeInstanceOf(Error)
      expect(notFoundError).toBeInstanceOf(Error)
      expect(rateLimitError).toBeInstanceOf(Error)
      expect(audioError).toBeInstanceOf(Error)

      // All should be instances of MetatellError
      expect(authError).toBeInstanceOf(MetatellError)
      expect(networkError).toBeInstanceOf(MetatellError)
      expect(notFoundError).toBeInstanceOf(MetatellError)
      expect(rateLimitError).toBeInstanceOf(MetatellError)
      expect(audioError).toBeInstanceOf(MetatellError)

      // Each should be instance of its own class
      expect(authError).toBeInstanceOf(AuthError)
      expect(networkError).toBeInstanceOf(NetworkError)
      expect(notFoundError).toBeInstanceOf(NotFoundError)
      expect(rateLimitError).toBeInstanceOf(RateLimitError)
      expect(audioError).toBeInstanceOf(UnsupportedAudioFormatError)

      // Should not be instances of sibling classes
      expect(authError).not.toBeInstanceOf(NetworkError)
      expect(networkError).not.toBeInstanceOf(AuthError)
    })
  })

  describe('Error serialization', () => {
    it('should serialize to JSON properly', () => {
      const error = new MetatellError('TEST_CODE', 'Test message', { detail: 'extra info' })

      const json = JSON.stringify(error)
      const parsed = JSON.parse(json)

      // Standard Error properties are not enumerable, but our custom properties should be
      expect(parsed.code).toBe('TEST_CODE')
      expect(parsed.cause).toEqual({ detail: 'extra info' })
    })

    it('should work with console.log and toString', () => {
      const error = new MetatellError('TEST_CODE', 'Test message')

      expect(error.toString()).toBe('MetatellError: Test message')
      expect(String(error)).toBe('MetatellError: Test message')
    })
  })

  describe('Error catching patterns', () => {
    it('should support instanceof checks in catch blocks', () => {
      const throwAndCatch = (error: Error) => {
        try {
          throw error
        } catch (e) {
          if (e instanceof AuthError) {
            return 'auth'
          } else if (e instanceof NetworkError) {
            return 'network'
          } else if (e instanceof NotFoundError) {
            return 'notfound'
          } else if (e instanceof RateLimitError) {
            return 'ratelimit'
          } else if (e instanceof UnsupportedAudioFormatError) {
            return 'audio'
          } else if (e instanceof MetatellError) {
            return 'metatell'
          }
          return 'unknown'
        }
      }

      expect(throwAndCatch(new AuthError('TEST', 'test'))).toBe('auth')
      expect(throwAndCatch(new NetworkError('TEST', 'test'))).toBe('network')
      expect(throwAndCatch(new NotFoundError('TEST', 'test'))).toBe('notfound')
      expect(throwAndCatch(new RateLimitError('TEST', 'test'))).toBe('ratelimit')
      expect(throwAndCatch(new UnsupportedAudioFormatError('TEST', 'test'))).toBe('audio')
      expect(throwAndCatch(new MetatellError('TEST', 'test'))).toBe('metatell')
      expect(throwAndCatch(new Error('test'))).toBe('unknown')
    })
  })
})
