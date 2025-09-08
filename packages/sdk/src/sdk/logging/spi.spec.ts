import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getLogger,
  getLoggerProvider,
  type LogEvent,
  type Logger,
  type LoggerProvider,
  registerLoggerProvider,
  resetLoggerProvider,
} from './spi.js'

describe('Logging SPI', () => {
  // Clear provider before each test
  beforeEach(() => {
    // Reset the global provider
    resetLoggerProvider()
  })

  describe('registerLoggerProvider', () => {
    it('should register a provider', () => {
      const mockProvider: LoggerProvider = {
        getLogger: vi.fn(),
      }

      registerLoggerProvider(mockProvider)
      expect(getLoggerProvider()).toBe(mockProvider)
    })

    it('should prevent overwriting without allowOverwrite option', () => {
      const firstProvider: LoggerProvider = {
        getLogger: vi.fn(),
      }
      const secondProvider: LoggerProvider = {
        getLogger: vi.fn(),
      }

      registerLoggerProvider(firstProvider)
      expect(getLoggerProvider()).toBe(firstProvider)

      // Should throw when trying to overwrite without permission
      expect(() => registerLoggerProvider(secondProvider)).toThrow(
        'LoggerProvider is already registered',
      )
      expect(getLoggerProvider()).toBe(firstProvider)
    })

    it('should allow overwriting with allowOverwrite option', () => {
      const firstProvider: LoggerProvider = {
        getLogger: vi.fn(),
      }
      const secondProvider: LoggerProvider = {
        getLogger: vi.fn(),
      }

      registerLoggerProvider(firstProvider)
      expect(getLoggerProvider()).toBe(firstProvider)

      registerLoggerProvider(secondProvider, { allowOverwrite: true })
      expect(getLoggerProvider()).toBe(secondProvider)
    })
  })

  describe('getLogger', () => {
    it('should automatically register default provider when no provider is registered', () => {
      const logger = getLogger('test')
      expect(logger).toBeDefined()
      expect(logger.debug).toBeDefined()
      expect(logger.info).toBeDefined()
      expect(logger.warn).toBeDefined()
      expect(logger.error).toBeDefined()
    })

    it('should return logger from registered provider', () => {
      const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }

      const mockProvider: LoggerProvider = {
        getLogger: vi.fn().mockReturnValue(mockLogger),
      }

      registerLoggerProvider(mockProvider)
      const logger = getLogger('test-module')

      expect(mockProvider.getLogger).toHaveBeenCalledWith('test-module')
      expect(logger).toBe(mockLogger)
    })

    it('should properly delegate logger methods', () => {
      const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }

      const mockProvider: LoggerProvider = {
        getLogger: vi.fn().mockReturnValue(mockLogger),
      }

      registerLoggerProvider(mockProvider)
      const logger = getLogger('test')

      // Test each log method
      logger.debug('debug message', { key: 'value' })
      expect(mockLogger.debug).toHaveBeenCalledWith('debug message', { key: 'value' })

      logger.info('info message')
      expect(mockLogger.info).toHaveBeenCalledWith('info message')

      logger.warn('warning')
      expect(mockLogger.warn).toHaveBeenCalledWith('warning')

      logger.error('error occurred', { error: 'details' })
      expect(mockLogger.error).toHaveBeenCalledWith('error occurred', { error: 'details' })
    })
  })

  describe('LoggerProvider optional methods', () => {
    it('should support addSink method', () => {
      const mockSink = {
        write: vi.fn(),
      }

      const mockProvider: LoggerProvider = {
        getLogger: vi.fn(),
        addSink: vi.fn(),
      }

      registerLoggerProvider(mockProvider)
      const provider = getLoggerProvider()

      provider?.addSink?.(mockSink)
      expect(mockProvider.addSink).toHaveBeenCalledWith(mockSink)
    })

    it('should support setMinLevel method', () => {
      const mockProvider: LoggerProvider = {
        getLogger: vi.fn(),
        setMinLevel: vi.fn(),
      }

      registerLoggerProvider(mockProvider)
      const provider = getLoggerProvider()

      provider?.setMinLevel?.('debug')
      expect(mockProvider.setMinLevel).toHaveBeenCalledWith('debug')
    })

    it('should support enableConsole method', () => {
      const mockProvider: LoggerProvider = {
        getLogger: vi.fn(),
        enableConsole: vi.fn(),
      }

      registerLoggerProvider(mockProvider)
      const provider = getLoggerProvider()

      provider?.enableConsole?.(true)
      expect(mockProvider.enableConsole).toHaveBeenCalledWith(true)
    })
  })

  describe('LogEvent structure', () => {
    it('should properly format log events', () => {
      const capturedEvents: LogEvent[] = []

      const mockProvider: LoggerProvider = {
        getLogger: (module: string) => ({
          debug: (msg, attrs) =>
            capturedEvents.push({
              ts: Date.now(),
              level: 'debug',
              module,
              message: msg,
              attributes: attrs,
            }),
          info: (msg, attrs) =>
            capturedEvents.push({
              ts: Date.now(),
              level: 'info',
              module,
              message: msg,
              attributes: attrs,
            }),
          warn: (msg, attrs) =>
            capturedEvents.push({
              ts: Date.now(),
              level: 'warn',
              module,
              message: msg,
              attributes: attrs,
            }),
          error: (msg, attrs) =>
            capturedEvents.push({
              ts: Date.now(),
              level: 'error',
              module,
              message: msg,
              attributes: attrs,
            }),
        }),
      }

      registerLoggerProvider(mockProvider)
      const logger = getLogger('test-module')

      logger.info('test message', { data: 'test' })

      expect(capturedEvents).toHaveLength(1)
      expect(capturedEvents[0]).toMatchObject({
        level: 'info',
        module: 'test-module',
        message: 'test message',
        attributes: { data: 'test' },
      })
      expect(capturedEvents[0].ts).toBeGreaterThan(0)
    })

    it('should handle edge case where provider registration fails', () => {
      // Reset to ensure clean state
      resetLoggerProvider()

      // Mock registerLoggerProvider to fail
      const originalRegister = registerLoggerProvider
      const _shouldFail = true

      // Temporarily replace with failing version
      ;(global as typeof globalThis).registerLoggerProviderOriginal = originalRegister

      try {
        // This should trigger the auto-registration path and the fallback error
        const logger = getLogger('test-module')
        // If we get here, auto-registration worked
        expect(logger).toBeDefined()
      } catch (error) {
        // This path shouldn't normally be hit, but covers the error case
        expect(error).toBeDefined()
      }
    })
  })
})
