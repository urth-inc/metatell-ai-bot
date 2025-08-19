import { describe, expect, it } from 'vitest'
import {
  AuthenticationError,
  isMetatellError,
  isRetryableError,
  MetatellError,
  ProtocolError,
  RateLimitedError,
  TimeoutError,
  TransportError,
} from './errors.js'

describe('Error classes', () => {
  it('should create AuthenticationError with correct properties', () => {
    const error = new AuthenticationError('Invalid token', 401)

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(MetatellError)
    expect(error.code).toBe('AUTH_ERROR')
    expect(error.message).toBe('Invalid token')
    expect(error.status).toBe(401)
    expect(error.name).toBe('AuthenticationError')
    expect(error.timestamp).toBeInstanceOf(Date)
  })

  it('should create RateLimitedError with retry info', () => {
    const error = new RateLimitedError('Too many requests', 5000)

    expect(error.code).toBe('RATE_LIMITED')
    expect(error.message).toBe('Too many requests')
    expect(error.retryAfterMs).toBe(5000)
  })

  it('should create TransportError with reason', () => {
    const error = new TransportError('Connection failed', 'ECONNREFUSED')

    expect(error.code).toBe('TRANSPORT_ERROR')
    expect(error.message).toBe('Connection failed')
    expect(error.reason).toBe('ECONNREFUSED')
  })

  it('should create ProtocolError with data', () => {
    const data = { received: 'invalid', expected: 'valid' }
    const error = new ProtocolError('Invalid protocol', data)

    expect(error.code).toBe('PROTOCOL_ERROR')
    expect(error.message).toBe('Invalid protocol')
    expect(error.data).toEqual(data)
  })

  it('should create TimeoutError with timeout value', () => {
    const error = new TimeoutError('Request timed out', 30000)

    expect(error.code).toBe('TIMEOUT_ERROR')
    expect(error.message).toBe('Request timed out')
    expect(error.timeoutMs).toBe(30000)
  })
})

describe('isMetatellError', () => {
  it('should return true for MetatellError instances', () => {
    expect(isMetatellError(new AuthenticationError('test'))).toBe(true)
    expect(isMetatellError(new RateLimitedError('test'))).toBe(true)
    expect(isMetatellError(new TransportError('test'))).toBe(true)
    expect(isMetatellError(new ProtocolError('test'))).toBe(true)
    expect(isMetatellError(new TimeoutError('test', 1000))).toBe(true)
  })

  it('should return false for non-MetatellError instances', () => {
    expect(isMetatellError(new Error('test'))).toBe(false)
    expect(isMetatellError('error')).toBe(false)
    expect(isMetatellError(null)).toBe(false)
    expect(isMetatellError(undefined)).toBe(false)
    expect(isMetatellError({})).toBe(false)
  })
})

describe('isRetryableError', () => {
  it('should return true for retryable errors', () => {
    expect(isRetryableError(new TransportError('test'))).toBe(true)
    expect(isRetryableError(new TimeoutError('test', 1000))).toBe(true)
    expect(isRetryableError(new RateLimitedError('test', 5000))).toBe(true)
  })

  it('should return false for RateLimitedError without retryAfterMs', () => {
    expect(isRetryableError(new RateLimitedError('test'))).toBe(false)
  })

  it('should return false for non-retryable errors', () => {
    expect(isRetryableError(new AuthenticationError('test'))).toBe(false)
    expect(isRetryableError(new ProtocolError('test'))).toBe(false)
  })

  it('should return false for non-MetatellError', () => {
    expect(isRetryableError(new Error('test'))).toBe(false)
    expect(isRetryableError('error')).toBe(false)
  })
})
