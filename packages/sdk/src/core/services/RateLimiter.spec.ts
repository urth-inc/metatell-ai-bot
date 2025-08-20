import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimiter } from './RateLimiter.js'

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('check', () => {
    it('should allow requests within limit', () => {
      const limiter = new RateLimiter({ maxRequests: 3, windowMs: 1000 })

      expect(limiter.check('user1')).toBe(true)
      expect(limiter.check('user1')).toBe(true)
      expect(limiter.check('user1')).toBe(true)
    })

    it('should block requests exceeding limit', () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 })

      expect(limiter.check('user1')).toBe(true)
      expect(limiter.check('user1')).toBe(true)
      expect(limiter.check('user1')).toBe(false)
    })

    it('should reset after window expires', () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 })

      expect(limiter.check('user1')).toBe(true)
      expect(limiter.check('user1')).toBe(false)

      // Advance time past the window
      vi.advanceTimersByTime(1001)

      expect(limiter.check('user1')).toBe(true)
    })

    it('should handle different keys independently', () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 })

      expect(limiter.check('user1')).toBe(true)
      expect(limiter.check('user1')).toBe(false)
      expect(limiter.check('user2')).toBe(true)
      expect(limiter.check('user2')).toBe(false)
    })

    it('should use default key when not provided', () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 })

      expect(limiter.check()).toBe(true)
      expect(limiter.check()).toBe(true)
      expect(limiter.check()).toBe(false)
    })

    it('should use default config when not provided', () => {
      const limiter = new RateLimiter()

      // Default is 1 request per 15 seconds
      expect(limiter.check()).toBe(true)
      expect(limiter.check()).toBe(false)
    })
  })

  describe('wait', () => {
    it('should wait until rate limit resets', async () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 })

      limiter.check('user1')
      limiter.check('user1') // This will be blocked

      const waitPromise = limiter.wait('user1')

      // Initially should be waiting
      let resolved = false
      waitPromise.then(() => {
        resolved = true
      })

      await vi.advanceTimersByTimeAsync(500)
      expect(resolved).toBe(false)

      await vi.advanceTimersByTimeAsync(501)
      expect(resolved).toBe(true)
    })

    it('should not wait if not rate limited', async () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 })

      limiter.check('user1')

      const waitPromise = limiter.wait('user1')
      await vi.runAllTimersAsync()

      await expect(waitPromise).resolves.toBeUndefined()
    })
  })

  describe('reset', () => {
    it('should reset rate limit for a key', () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 })

      expect(limiter.check('user1')).toBe(true)
      expect(limiter.check('user1')).toBe(false)

      limiter.reset('user1')

      expect(limiter.check('user1')).toBe(true)
    })
  })

  describe('getTimeUntilReset', () => {
    it('should return time until reset', () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 })

      limiter.check('user1')

      expect(limiter.getTimeUntilReset('user1')).toBe(1000)

      vi.advanceTimersByTime(300)
      expect(limiter.getTimeUntilReset('user1')).toBe(700)

      vi.advanceTimersByTime(700)
      expect(limiter.getTimeUntilReset('user1')).toBe(0)
    })

    it('should return 0 for non-existent key', () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 })

      expect(limiter.getTimeUntilReset('unknown')).toBe(0)
    })

    it('should return 0 when window has expired', () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 })

      limiter.check('user1')
      vi.advanceTimersByTime(1001)

      expect(limiter.getTimeUntilReset('user1')).toBe(0)
    })
  })
})
