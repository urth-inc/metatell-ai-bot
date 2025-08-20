import { describe, expect, it, vi } from 'vitest'
import { RateLimitedQueue, TokenBucketRateLimiter } from './rate.js'

describe('TokenBucketRateLimiter', () => {
  it('should allow requests within rate limit', () => {
    const limiter = new TokenBucketRateLimiter(2) // 2 per second

    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(false)
  })

  it('should refill tokens over time', async () => {
    const limiter = new TokenBucketRateLimiter(2) // 2 per second

    // Use all tokens
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(false)

    // Wait for refill
    await new Promise((resolve) => setTimeout(resolve, 600))

    // Should have at least 1 token refilled
    expect(limiter.tryAcquire()).toBe(true)
  })

  it('should update rate dynamically', () => {
    const limiter = new TokenBucketRateLimiter(1)

    expect(limiter.getRate()).toBe(1)

    // Use the initial token
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(false) // No more tokens

    // Update rate
    limiter.setRate(5)
    expect(limiter.getRate()).toBe(5)

    // The setRate doesn't add tokens immediately, just changes the rate
    // So we should still have no tokens
    expect(limiter.tryAcquire()).toBe(false)
  })
})

describe('RateLimitedQueue', () => {
  it('should execute function without rate limit', async () => {
    const queue = new RateLimitedQueue()
    const fn = vi.fn().mockResolvedValue('result')

    const result = await queue.execute('test', fn)

    expect(result).toBe('result')
    expect(fn).toHaveBeenCalledOnce()
  })

  it('should apply rate limit to specific key', async () => {
    const queue = new RateLimitedQueue()
    queue.setRate('messages', 2) // 2 per second

    const fn = vi.fn().mockResolvedValue('result')

    // First two should succeed immediately
    await queue.execute('messages', fn)
    await queue.execute('messages', fn)

    // Third should wait for rate limit
    const start = Date.now()
    await queue.execute('messages', fn)
    const elapsed = Date.now() - start

    expect(elapsed).toBeGreaterThanOrEqual(90) // Should wait at least 100ms
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('should throw error after max attempts', async () => {
    const queue = new RateLimitedQueue()
    queue.setRate('test', 1) // 1 per second, but we'll consume all tokens quickly

    const fn = vi.fn().mockResolvedValue('result')

    // First execution should succeed (uses initial token)
    await queue.execute('test', fn)
    expect(fn).toHaveBeenCalledOnce()

    // Immediately change rate to very low to prevent refill
    queue.setRate('test', 0.01) // Very low rate (0.01 per second = 1 per 100 seconds)

    // Second execution should fail after retries because no tokens available
    try {
      await queue.execute('test', fn)
      expect.fail('Expected error to be thrown')
    } catch (error) {
      expect((error as Error).message).toBe('Rate limit exceeded for test')
    }

    // Function should still have been called only once
    expect(fn).toHaveBeenCalledOnce()
  })

  it('should handle different keys independently', async () => {
    const queue = new RateLimitedQueue()
    queue.setRate('messages', 1)
    queue.setRate('moves', 2)

    const msgFn = vi.fn().mockResolvedValue('msg')
    const moveFn = vi.fn().mockResolvedValue('move')

    // Messages limited to 1/s
    await queue.execute('messages', msgFn)

    // Moves limited to 2/s (should work)
    await queue.execute('moves', moveFn)
    await queue.execute('moves', moveFn)

    expect(msgFn).toHaveBeenCalledOnce()
    expect(moveFn).toHaveBeenCalledTimes(2)
  })

  it('should return undefined rate for unknown key', () => {
    const queue = new RateLimitedQueue()

    expect(queue.getRate('unknown')).toBeUndefined()

    queue.setRate('known', 5)
    expect(queue.getRate('known')).toBe(5)
  })
})
