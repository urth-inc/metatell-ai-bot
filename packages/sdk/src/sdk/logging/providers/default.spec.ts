import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LogSink } from '../spi.js'
import { DefaultLoggerProvider, getRingBuffer } from './default.js'

describe('DefaultLoggerProvider', () => {
  let provider: DefaultLoggerProvider
  let consoleSpy: {
    debug: ReturnType<typeof vi.spyOn>
    info: ReturnType<typeof vi.spyOn>
    warn: ReturnType<typeof vi.spyOn>
    error: ReturnType<typeof vi.spyOn>
  }

  beforeEach(() => {
    provider = new DefaultLoggerProvider()
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    }
  })

  afterEach(() => {
    consoleSpy.debug.mockRestore()
    consoleSpy.info.mockRestore()
    consoleSpy.warn.mockRestore()
    consoleSpy.error.mockRestore()
  })

  describe('getLogger', () => {
    it('should create a logger instance', () => {
      const logger = provider.getLogger('TestModule')
      expect(logger).toBeDefined()
      expect(logger.debug).toBeDefined()
      expect(logger.info).toBeDefined()
      expect(logger.warn).toBeDefined()
      expect(logger.error).toBeDefined()
    })

    it('should log messages to console when enabled', () => {
      const logger = provider.getLogger('TestModule')

      logger.info('Test message')

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] [TestModule] Test message'),
      )
    })

    it('should not log debug messages when log level is info', () => {
      provider.setLogLevel('info')
      const logger = provider.getLogger('TestModule')

      logger.debug('Debug message')

      expect(consoleSpy.debug).not.toHaveBeenCalled()
    })

    it('should log debug messages when log level is debug', () => {
      provider.setLogLevel('debug')
      const logger = provider.getLogger('TestModule')

      logger.debug('Debug message')

      expect(consoleSpy.debug).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] [TestModule] Debug message'),
      )
    })
  })

  describe('enableConsole', () => {
    it('should disable console output when set to false', () => {
      provider.enableConsole(false)
      const logger = provider.getLogger('TestModule')

      logger.info('Test message')

      expect(consoleSpy.info).not.toHaveBeenCalled()
    })

    it('should enable console output when set to true', () => {
      provider.enableConsole(false)
      provider.enableConsole(true)
      const logger = provider.getLogger('TestModule')

      logger.info('Test message')

      expect(consoleSpy.info).toHaveBeenCalled()
    })
  })

  describe('registerSink', () => {
    it('should send log events to registered sinks', () => {
      const mockSink: LogSink = {
        write: vi.fn(),
      }

      provider.registerSink(mockSink)
      const logger = provider.getLogger('TestModule')

      logger.info('Test message', { foo: 'bar' })

      expect(mockSink.write).toHaveBeenCalledWith({
        ts: expect.any(Number),
        level: 'info',
        module: 'TestModule',
        message: 'Test message',
        attributes: { foo: 'bar' },
      })
    })

    it('should support multiple sinks', () => {
      const mockSink1: LogSink = { write: vi.fn() }
      const mockSink2: LogSink = { write: vi.fn() }

      provider.registerSink(mockSink1)
      provider.registerSink(mockSink2)
      const logger = provider.getLogger('TestModule')

      logger.info('Test message')

      expect(mockSink1.write).toHaveBeenCalled()
      expect(mockSink2.write).toHaveBeenCalled()
    })
  })

  describe('getRingBuffer', () => {
    it('should return a ring buffer instance', () => {
      const buffer = getRingBuffer()

      expect(buffer).toBeDefined()
      expect(buffer?.drain).toBeDefined()
      expect(buffer?.clear).toBeDefined()
      expect(buffer?.size).toBeDefined()
    })

    it('should capture log records in the ring buffer', () => {
      const logger = provider.getLogger('TestModule')
      const buffer = getRingBuffer()

      buffer?.clear()
      logger.info('Test message')

      const records = buffer?.drain()
      expect(records).toHaveLength(1)
      expect(records?.[0]).toMatchObject({
        level: 'info',
        module: 'TestModule',
        msg: 'Test message',
      })
    })
  })
})
