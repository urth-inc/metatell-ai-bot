import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from './EventBus.js'

describe('EventBus', () => {
  let eventBus: EventBus

  beforeEach(() => {
    eventBus = new EventBus()
  })

  describe('on', () => {
    it('should register event handler', () => {
      const handler = vi.fn()
      eventBus.on('test', handler)

      eventBus.emit('test', 'data')
      expect(handler).toHaveBeenCalledWith('data')
    })

    it('should register multiple handlers for same event', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      eventBus.on('test', handler1)
      eventBus.on('test', handler2)

      eventBus.emit('test', 'data')
      expect(handler1).toHaveBeenCalledWith('data')
      expect(handler2).toHaveBeenCalledWith('data')
    })

    it('should handle different event types', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      eventBus.on('event1', handler1)
      eventBus.on('event2', handler2)

      eventBus.emit('event1', 'data1')
      expect(handler1).toHaveBeenCalledWith('data1')
      expect(handler2).not.toHaveBeenCalled()
    })
  })

  describe('off', () => {
    it('should unregister event handler', () => {
      const handler = vi.fn()
      eventBus.on('test', handler)
      eventBus.off('test', handler)

      eventBus.emit('test', 'data')
      expect(handler).not.toHaveBeenCalled()
    })

    it('should only remove specific handler', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      eventBus.on('test', handler1)
      eventBus.on('test', handler2)
      eventBus.off('test', handler1)

      eventBus.emit('test', 'data')
      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).toHaveBeenCalledWith('data')
    })

    it('should handle non-existent event gracefully', () => {
      const handler = vi.fn()
      expect(() => eventBus.off('nonexistent', handler)).not.toThrow()
    })
  })

  describe('emit', () => {
    it('should emit event without data', () => {
      const handler = vi.fn()
      eventBus.on('test', handler)

      eventBus.emit('test')
      expect(handler).toHaveBeenCalledWith(undefined)
    })

    it('should emit event with data', () => {
      const handler = vi.fn()
      const data = { id: 1, name: 'test' }

      eventBus.on('test', handler)
      eventBus.emit('test', data)

      expect(handler).toHaveBeenCalledWith(data)
    })

    it('should handle non-existent event gracefully', () => {
      expect(() => eventBus.emit('nonexistent', 'data')).not.toThrow()
    })

    it('should catch synchronous errors in handlers', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error')
      })
      const normalHandler = vi.fn()

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      eventBus.on('test', errorHandler)
      eventBus.on('test', normalHandler)

      eventBus.emit('test', 'data')

      expect(errorHandler).toHaveBeenCalled()
      expect(normalHandler).toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in event handler for "test":',
        expect.any(Error),
      )

      consoleErrorSpy.mockRestore()
    })

    it('should catch asynchronous errors in handlers', async () => {
      const errorHandler = vi.fn(async () => {
        throw new Error('Async handler error')
      })

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      eventBus.on('test', errorHandler)
      eventBus.emit('test', 'data')

      // Wait for promise rejection to be handled
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in event handler for "test":',
        expect.any(Error),
      )

      consoleErrorSpy.mockRestore()
    })
  })

  describe('once', () => {
    it('should execute handler only once', () => {
      const handler = vi.fn()
      eventBus.once('test', handler)

      eventBus.emit('test', 'data1')
      eventBus.emit('test', 'data2')

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith('data1')
    })

    it('should remove handler after execution', () => {
      const handler = vi.fn()
      eventBus.once('test', handler)

      eventBus.emit('test', 'data')
      expect(handler).toHaveBeenCalledTimes(1)

      // Try to manually remove the handler (should not throw)
      expect(() => eventBus.off('test', handler)).not.toThrow()
    })
  })

  describe('removeAllListeners', () => {
    it('should remove all listeners for specific event', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      const handler3 = vi.fn()

      eventBus.on('event1', handler1)
      eventBus.on('event1', handler2)
      eventBus.on('event2', handler3)

      eventBus.removeAllListeners('event1')

      eventBus.emit('event1', 'data')
      eventBus.emit('event2', 'data')

      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).not.toHaveBeenCalled()
      expect(handler3).toHaveBeenCalledWith('data')
    })

    it('should remove all listeners when no event specified', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      const handler3 = vi.fn()

      eventBus.on('event1', handler1)
      eventBus.on('event2', handler2)
      eventBus.on('event3', handler3)

      eventBus.removeAllListeners()

      eventBus.emit('event1', 'data')
      eventBus.emit('event2', 'data')
      eventBus.emit('event3', 'data')

      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).not.toHaveBeenCalled()
      expect(handler3).not.toHaveBeenCalled()
    })
  })
})
