/**
 * Test for ChannelService
 */

import type { Channel } from 'phoenix'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelService } from './ChannelService.js'

// Mock logger
vi.mock('../logging/index.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Mock Phoenix channel
const createMockChannel = (): Channel => {
  const mockPush = {
    receive: vi.fn().mockReturnThis(),
  }

  return {
    push: vi.fn().mockReturnValue(mockPush),
    state: 'joined',
    topic: 'test:channel',
    join: vi.fn(),
    leave: vi.fn(),
    off: vi.fn(),
    on: vi.fn(),
    onError: vi.fn(),
    onClose: vi.fn(),
    canPush: vi.fn().mockReturnValue(true),
    isJoined: vi.fn().mockReturnValue(true),
    isJoining: vi.fn().mockReturnValue(false),
    isLeaving: vi.fn().mockReturnValue(false),
  } as Channel
}

describe('ChannelService', () => {
  let channelService: ChannelService
  let mockChannel: Channel

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    channelService = new ChannelService()
    mockChannel = createMockChannel()
  })

  afterEach(async () => {
    await vi.runAllTimersAsync() // Ensure all pending timers are flushed
    vi.useRealTimers()
    // Clear any pending promise rejections
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  describe('push', () => {
    it('should push event successfully', async () => {
      const payload = { message: 'test' }
      const response = { success: true }

      const mockPush = mockChannel.push('test_event', payload) as ReturnType<Channel['push']>
      mockPush.receive.mockImplementation(
        (status: string, callback: (response?: unknown) => void) => {
          if (status === 'ok') {
            // Call callback asynchronously to simulate real behavior
            setTimeout(() => callback(response), 0)
          }
          return mockPush
        },
      )

      const resultPromise = channelService.push(mockChannel, 'test_event', payload)

      // Advance timers to trigger the callback
      await vi.runAllTimersAsync()

      const result = await resultPromise

      expect(result).toEqual(response)
      expect(mockChannel.push).toHaveBeenCalledWith('test_event', payload)
    })

    it('should handle push error', async () => {
      const payload = { message: 'test' }
      const errorResponse = { reason: 'test error' }

      const mockPush = mockChannel.push('test_event', payload) as ReturnType<Channel['push']>
      mockPush.receive.mockImplementation(
        (status: string, callback: (response?: unknown) => void) => {
          if (status === 'error') {
            callback(errorResponse)
          }
          return mockPush
        },
      )

      await expect(channelService.push(mockChannel, 'test_event', payload)).rejects.toThrow(
        "Push 'test_event' failed",
      )
    })

    it('should handle push timeout', async () => {
      const payload = { message: 'test' }

      const mockPush = mockChannel.push('test_event', payload) as ReturnType<Channel['push']>
      mockPush.receive.mockImplementation(
        (status: string, callback: (response?: unknown) => void) => {
          if (status === 'timeout') {
            callback()
          }
          return mockPush
        },
      )

      await expect(channelService.push(mockChannel, 'test_event', payload)).rejects.toThrow(
        "Push 'test_event' timed out",
      )
    })

    it('should retry on failure', async () => {
      const payload = { message: 'test' }
      const response = { success: true }

      let callCount = 0
      const mockPush = mockChannel.push('test_event', payload) as ReturnType<Channel['push']>
      mockPush.receive.mockImplementation(
        (status: string, callback: (response?: unknown) => void) => {
          callCount++
          if (callCount < 3) {
            if (status === 'error') {
              callback({ reason: 'temporary error' })
            }
          } else {
            if (status === 'ok') {
              callback(response)
            }
          }
          return mockPush
        },
      )

      const resultPromise = channelService.push(mockChannel, 'test_event', payload, {
        retries: 2,
        retryDelayMs: 100,
      })

      // Fast-forward through retries
      await vi.advanceTimersByTimeAsync(300)

      const result = await resultPromise

      expect(result).toEqual(response)
      expect(mockChannel.push).toHaveBeenCalledTimes(3)
    })

    it('should use exponential backoff for retries', async () => {
      const payload = { message: 'test' }

      const mockPush = {
        receive: vi
          .fn()
          .mockImplementation((status: string, callback: (response?: unknown) => void) => {
            if (status === 'error') {
              // Immediately trigger error callback
              setTimeout(() => callback({ reason: 'error' }), 0)
            }
            return mockPush
          }),
      }

      vi.mocked(mockChannel.push).mockReturnValue(mockPush as ReturnType<Channel['push']>)

      // Add promise rejection handler
      const resultPromise = channelService.push(mockChannel, 'test_event', payload, {
        retries: 3,
        retryDelayMs: 100,
      })
      resultPromise.catch(() => {}) // Prevent unhandled rejection

      // Advance timers to trigger all retries
      await vi.advanceTimersByTimeAsync(1000)

      // Now properly test the rejection
      await expect(resultPromise).rejects.toThrow('Push')
      expect(mockChannel.push).toHaveBeenCalledTimes(4) // Initial + 3 retries
    })
  })

  describe('pushSequence', () => {
    it('should execute operations sequentially', async () => {
      const operations = [
        { event: 'event1', payload: { id: 1 } },
        { event: 'event2', payload: { id: 2 } },
        { event: 'event3', payload: { id: 3 } },
      ]

      let pushCount = 0
      const mockPush = {
        receive: vi
          .fn()
          .mockImplementation((status: string, callback: (response?: unknown) => void) => {
            if (status === 'ok') {
              pushCount++
              setTimeout(() => callback({ id: pushCount }), 0)
            }
            return mockPush
          }),
      }

      vi.mocked(mockChannel.push).mockReturnValue(mockPush as ReturnType<Channel['push']>)

      const resultsPromise = channelService.pushSequence(mockChannel, operations)
      await vi.runAllTimersAsync()
      const results = await resultsPromise

      expect(results).toHaveLength(3)
      expect(results[0]).toEqual({ status: 'ok', data: { id: 1 } })
      expect(results[1]).toEqual({ status: 'ok', data: { id: 2 } })
      expect(results[2]).toEqual({ status: 'ok', data: { id: 3 } })
      expect(mockChannel.push).toHaveBeenCalledTimes(3)
    })

    it('should call onSuccess callback', async () => {
      const onSuccess = vi.fn()
      const operations = [{ event: 'event1', payload: { id: 1 }, onSuccess }]

      const mockPush = {
        receive: vi
          .fn()
          .mockImplementation((status: string, callback: (response?: unknown) => void) => {
            if (status === 'ok') {
              setTimeout(() => callback({ success: true }), 0)
            }
            return mockPush
          }),
      }

      vi.mocked(mockChannel.push).mockReturnValue(mockPush as ReturnType<Channel['push']>)

      const resultsPromise = channelService.pushSequence(mockChannel, operations)
      await vi.runAllTimersAsync()
      await resultsPromise

      expect(onSuccess).toHaveBeenCalledWith({ success: true })
    })

    it('should stop on error without error handler', async () => {
      const operations = [
        { event: 'event1', payload: { id: 1 } },
        { event: 'event2', payload: { id: 2 } }, // This will fail
        { event: 'event3', payload: { id: 3 } }, // This should not execute
      ]

      let callCount = 0
      vi.mocked(mockChannel.push).mockImplementation(() => {
        callCount++
        const mockPush = {
          receive: vi.fn().mockImplementation(function (
            this: ReturnType<Channel['push']>,
            status: string,
            callback: (response?: unknown) => void,
          ) {
            if (callCount === 2) {
              // Second call should trigger error or timeout
              if (status === 'error') {
                setTimeout(() => callback({ reason: 'error' }), 0)
              } else if (status === 'timeout') {
                setTimeout(() => callback(), 0)
              }
              // Don't call 'ok' for second push
            } else if (status === 'ok') {
              setTimeout(() => callback({ id: callCount }), 0)
            }
            return this // Return 'this' for chaining
          }),
        }
        return mockPush as ReturnType<Channel['push']>
      })

      const resultsPromise = channelService.pushSequence(mockChannel, operations)
      await vi.runAllTimersAsync()
      const results = await resultsPromise

      expect(results).toHaveLength(2) // Should stop after error
      expect(results[0]).toEqual({ status: 'ok', data: { id: 1 } })
      expect(results[1]).toEqual({ status: 'error', error: expect.stringContaining('Push') })
      expect(mockChannel.push).toHaveBeenCalledTimes(2) // Only first 2 operations
    })

    it('should continue on error with error handler', async () => {
      const onError = vi.fn()
      const operations = [
        { event: 'event1', payload: { id: 1 } },
        { event: 'event2', payload: { id: 2 }, onError },
        { event: 'event3', payload: { id: 3 } },
      ]

      let callCount = 0
      vi.mocked(mockChannel.push).mockImplementation(() => {
        callCount++
        const mockPush = {
          receive: vi.fn().mockImplementation(function (
            this: ReturnType<Channel['push']>,
            status: string,
            callback: (response?: unknown) => void,
          ) {
            if (callCount === 2) {
              // Second call should trigger error or timeout
              if (status === 'error') {
                setTimeout(() => callback({ reason: 'error' }), 0)
              } else if (status === 'timeout') {
                setTimeout(() => callback(), 0)
              }
              // Don't call 'ok' for second push
            } else if (status === 'ok') {
              setTimeout(() => callback({ id: callCount }), 0)
            }
            return this // Return 'this' for chaining
          }),
        }
        return mockPush as ReturnType<Channel['push']>
      })

      const resultsPromise = channelService.pushSequence(mockChannel, operations)
      await vi.runAllTimersAsync()
      const results = await resultsPromise

      expect(results).toHaveLength(3)
      expect(results[1]).toEqual({ status: 'error', error: expect.stringContaining('Push') })
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(mockChannel.push).toHaveBeenCalledTimes(3)
    })
  })

  describe('pushParallel', () => {
    it('should execute operations in parallel', async () => {
      const operations = [
        { event: 'event1', payload: { id: 1 } },
        { event: 'event2', payload: { id: 2 } },
        { event: 'event3', payload: { id: 3 } },
      ]

      const createMockPush = (id: number) => ({
        receive: vi
          .fn()
          .mockImplementation((status: string, callback: (response?: unknown) => void) => {
            if (status === 'ok') {
              setTimeout(() => callback({ id }), 0)
            }
            return createMockPush(id)
          }),
      })

      let callCount = 0
      vi.mocked(mockChannel.push).mockImplementation(() => {
        callCount++
        return createMockPush(callCount) as ReturnType<Channel['push']>
      })

      const resultsPromise = channelService.pushParallel(mockChannel, operations)
      await vi.runAllTimersAsync()
      const results = await resultsPromise

      expect(results).toHaveLength(3)
      expect(results[0]).toEqual({ status: 'ok', data: { id: 1 } })
      expect(results[1]).toEqual({ status: 'ok', data: { id: 2 } })
      expect(results[2]).toEqual({ status: 'ok', data: { id: 3 } })
      expect(mockChannel.push).toHaveBeenCalledTimes(3)
    })

    it('should handle individual failures', async () => {
      const onError = vi.fn()
      const operations = [
        { event: 'event1', payload: { id: 1 } },
        { event: 'event2', payload: { id: 2 }, onError },
        { event: 'event3', payload: { id: 3 } },
      ]

      let callCount = 0
      vi.mocked(mockChannel.push).mockImplementation((_event) => {
        callCount++
        const id = callCount
        const mockPush = {
          receive: vi
            .fn()
            .mockImplementation((status: string, callback: (response?: unknown) => void) => {
              if (id === 2 && status === 'error') {
                setTimeout(() => callback({ reason: 'error' }), 0)
              } else if (status === 'ok' && id !== 2) {
                setTimeout(() => callback({ id }), 0)
              }
              return mockPush
            }),
        }
        return mockPush as ReturnType<Channel['push']>
      })

      const resultsPromise = channelService.pushParallel(mockChannel, operations)
      await vi.runAllTimersAsync()
      const results = await resultsPromise

      expect(results).toHaveLength(3)
      expect(results[0]).toEqual({ status: 'ok', data: { id: 1 } })
      expect(results[1]).toEqual({ status: 'error', error: expect.stringContaining('Push') })
      expect(results[2]).toEqual({ status: 'ok', data: { id: 3 } })
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('subscribe', () => {
    it('should subscribe to channel events', () => {
      const handler = vi.fn()
      const mockRef = 123

      vi.mocked(mockChannel.on).mockReturnValue(mockRef)

      const unsubscribe = channelService.subscribe(mockChannel, 'test_event', handler)

      expect(mockChannel.on).toHaveBeenCalledWith('test_event', handler)

      unsubscribe()

      expect(mockChannel.off).toHaveBeenCalledWith('test_event', mockRef)
    })
  })

  describe('waitForEvent', () => {
    it('should resolve when event is received', async () => {
      const payload = { data: 'test' }
      let handler: (payload?: unknown) => void

      vi.mocked(mockChannel.on).mockImplementation((_event, fn) => {
        handler = fn
        return 123
      })

      const promise = channelService.waitForEvent(mockChannel, 'test_event')

      // Trigger the event
      handler?.(payload)

      const result = await promise

      expect(result).toEqual(payload)
      expect(mockChannel.off).toHaveBeenCalledWith('test_event', 123)
    })

    it('should timeout if event is not received', async () => {
      vi.mocked(mockChannel.on).mockReturnValue(123)

      const promise = channelService.waitForEvent(mockChannel, 'test_event', 1000)
      promise.catch(() => {}) // Prevent unhandled rejection

      await vi.advanceTimersByTimeAsync(1000)

      // Now properly test the rejection
      await expect(promise).rejects.toThrow('Timeout waiting for event')
      expect(mockChannel.off).toHaveBeenCalledWith('test_event', 123)
    })
  })
})
