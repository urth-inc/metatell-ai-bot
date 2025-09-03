import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRetry, retry, retryUntilSuccess, waitUntil } from './retry.js'

describe('retry utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('createRetry', () => {
    it('should use default configuration', async () => {
      const customRetry = createRetry()
      const fn = vi.fn().mockResolvedValue('success')

      const promise = customRetry.retryUntilSuccess(fn, (result) => result === 'success')
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should use custom configuration', async () => {
      const customRetry = createRetry({
        maxAttempts: 3,
        initialDelayMs: 100,
        backoffMultiplier: 3,
      })

      const fn = vi.fn().mockResolvedValue('fail')

      const promise = customRetry.retryUntilSuccess(fn, (result) => result === 'success')

      // First attempt
      await vi.advanceTimersByTimeAsync(0)
      expect(fn).toHaveBeenCalledTimes(1)

      // Second attempt after 100ms
      await vi.advanceTimersByTimeAsync(100)
      expect(fn).toHaveBeenCalledTimes(2)

      // Third attempt after 300ms (100 * 3)
      await vi.advanceTimersByTimeAsync(300)
      expect(fn).toHaveBeenCalledTimes(3)

      const result = await promise
      expect(result).toBe('fail')
    })
  })

  describe('retryUntilSuccess', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      const promise = retryUntilSuccess(fn, (result) => result === 'success')
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry on failure and eventually succeed', async () => {
      const fn = vi
        .fn()
        .mockResolvedValueOnce('fail')
        .mockResolvedValueOnce('fail')
        .mockResolvedValue('success')

      const promise = retryUntilSuccess(fn, (result) => result === 'success')

      // First attempt fails
      await vi.advanceTimersByTimeAsync(0)
      expect(fn).toHaveBeenCalledTimes(1)

      // Wait for first retry delay (1000ms)
      await vi.advanceTimersByTimeAsync(1000)
      expect(fn).toHaveBeenCalledTimes(2)

      // Wait for second retry delay (2000ms)
      await vi.advanceTimersByTimeAsync(2000)
      expect(fn).toHaveBeenCalledTimes(3)

      const result = await promise
      expect(result).toBe('success')
    })

    it('should return last result after max attempts', async () => {
      const fn = vi.fn().mockResolvedValue('fail')

      const promise = retryUntilSuccess(fn, (result) => result === 'success')

      // Advance through all attempts
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(i === 0 ? 0 : Math.min(1000 * 2 ** (i - 1), 32000))
      }

      const result = await promise
      expect(result).toBe('fail')
      expect(fn).toHaveBeenCalledTimes(10)
    })

    it('should apply exponential backoff with max delay', async () => {
      const fn = vi.fn().mockResolvedValue('fail')

      const promise = retryUntilSuccess(fn, (result) => result === 'success')

      // Track delays: 1000, 2000, 4000, 8000, 16000, 32000 (capped), 32000...
      const expectedDelays = [0, 1000, 2000, 4000, 8000, 16000, 32000, 32000, 32000, 32000]

      for (let i = 0; i < expectedDelays.length; i++) {
        await vi.advanceTimersByTimeAsync(expectedDelays[i])
        expect(fn).toHaveBeenCalledTimes(i + 1)
      }

      const result = await promise
      expect(result).toBe('fail')
    })

    it('should handle async operations', async () => {
      const fn = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return 'async-result'
      })

      const promise = retryUntilSuccess(fn, (result) => result === 'async-result')

      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(50) // Wait for async operation

      const result = await promise
      expect(result).toBe('async-result')
    })
  })

  describe('waitUntil', () => {
    it('should resolve immediately if condition is true', async () => {
      const condition = vi.fn().mockReturnValue(true)

      const promise = waitUntil(condition)
      await vi.advanceTimersByTimeAsync(0)

      await promise
      expect(condition).toHaveBeenCalledTimes(1)
    })

    it('should wait until condition becomes true', async () => {
      const condition = vi
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValue(true)

      const promise = waitUntil(condition)

      await vi.advanceTimersByTimeAsync(0) // First check
      expect(condition).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1000) // Second check after 1s
      expect(condition).toHaveBeenCalledTimes(2)

      await vi.advanceTimersByTimeAsync(2000) // Third check after 2s
      expect(condition).toHaveBeenCalledTimes(3)

      await promise
    })

    it('should handle async conditions', async () => {
      const condition = vi
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true)

      const promise = waitUntil(condition)

      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(2000)

      await promise
      expect(condition).toHaveBeenCalledTimes(3)
    })

    it('should finish after max attempts even if condition never becomes true', async () => {
      const condition = vi.fn().mockReturnValue(false)

      const promise = waitUntil(condition)

      // Advance through all 10 attempts
      const delays = [0, 1000, 2000, 4000, 8000, 16000, 32000, 32000, 32000, 32000]
      for (const delay of delays) {
        await vi.advanceTimersByTimeAsync(delay)
      }

      await promise // Should not throw, just finish
      expect(condition).toHaveBeenCalledTimes(10)
    })
  })

  describe('default retry instance', () => {
    it('should be usable directly', async () => {
      const fn = vi.fn().mockResolvedValue('direct')

      const promise = retry.retryUntilSuccess(fn, (result) => result === 'direct')
      const result = await promise

      expect(result).toBe('direct')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should support waitUntil directly', async () => {
      const condition = vi.fn().mockReturnValue(true)

      const promise = retry.waitUntil(condition)
      await vi.advanceTimersByTimeAsync(0)

      await promise
      expect(condition).toHaveBeenCalledTimes(1)
    })
  })
})
