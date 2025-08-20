import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DefaultLoggerProvider, getRingBuffer } from './default.js'
import { getRingBuffer as getCoreRingBuffer, disableConsole } from '../../../utils/logging/logger-factory.js'
import type { LogSink } from '../spi.js'

describe('DefaultLoggerProvider - Integration Tests', () => {
  let provider: DefaultLoggerProvider
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>
    info: ReturnType<typeof vi.spyOn>
    warn: ReturnType<typeof vi.spyOn>
    error: ReturnType<typeof vi.spyOn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Spy on console methods
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    }
    
    provider = new DefaultLoggerProvider()
  })

  afterEach(() => {
    consoleSpy.log.mockRestore()
    consoleSpy.info.mockRestore()
    consoleSpy.warn.mockRestore()
    consoleSpy.error.mockRestore()
  })

  describe('getLogger', () => {
    it('should create a logger that logs messages', () => {
      // Enable console output
      provider.enableConsole(true)
      
      const logger = provider.getLogger('test-module')
      
      logger.debug('debug message')
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('[test-module]') && 
        expect.stringContaining('debug message')
      )
      
      logger.info('info message')
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('[test-module]') && 
        expect.stringContaining('info message')
      )
      
      logger.warn('warn message')
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('[test-module]') && 
        expect.stringContaining('warn message')
      )
      
      logger.error('error message')
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('[test-module]') && 
        expect.stringContaining('error message')
      )
    })

    it('should handle metadata correctly', () => {
      provider.enableConsole(true)
      const logger = provider.getLogger('meta-test')
      
      logger.info('message with meta', { key: 'value', num: 42 })
      
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('[meta-test]') && 
        expect.stringContaining('message with meta') &&
        expect.stringContaining('"key"') &&
        expect.stringContaining('"value"') &&
        expect.stringContaining('42')
      )
    })
  })

  describe('enableConsole', () => {
    it('should control console output', () => {
      // First disable console to ensure clean state
      disableConsole()
      
      const logger = provider.getLogger('console-test')
      
      // Console disabled
      logger.info('should not appear')
      expect(consoleSpy.info).not.toHaveBeenCalled()
      
      // Enable console
      provider.enableConsole(true)
      logger.info('should appear')
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('should appear')
      )
    })

    it('should set debug level when enabled with true', () => {
      provider.enableConsole(true)
      const logger = provider.getLogger('debug-test')
      
      logger.debug('debug message')
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('debug message')
      )
    })

    it('should set info level when enabled with false', () => {
      provider.enableConsole(false)
      const logger = provider.getLogger('info-test')
      
      logger.debug('debug message')
      expect(consoleSpy.log).not.toHaveBeenCalled()
      
      logger.info('info message')
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('info message')
      )
    })
  })

  describe('setMinLevel', () => {
    it('should filter logs based on minimum level', () => {
      provider.enableConsole(true)
      provider.setMinLevel('warn')
      
      const logger = provider.getLogger('level-test')
      
      logger.debug('debug msg')
      logger.info('info msg')
      logger.warn('warn msg')
      logger.error('error msg')
      
      expect(consoleSpy.log).not.toHaveBeenCalled()
      expect(consoleSpy.info).not.toHaveBeenCalled()
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('warn msg')
      )
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('error msg')
      )
    })

    it('should update level dynamically', () => {
      provider.enableConsole(true)
      provider.setMinLevel('error')
      
      const logger = provider.getLogger('dynamic-test')
      
      logger.warn('should not appear')
      expect(consoleSpy.warn).not.toHaveBeenCalled()
      
      // Lower the threshold
      provider.setMinLevel('debug')
      
      logger.debug('should appear')
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('should appear')
      )
    })
  })

  describe('addSink', () => {
    it('should register custom sink and receive log events', () => {
      const customSink: LogSink = {
        write: vi.fn(),
      }
      
      const disposer = provider.addSink(customSink)
      expect(typeof disposer).toBe('function')
      
      const logger = provider.getLogger('sink-test')
      logger.info('test message', { data: 'test' })
      
      expect(customSink.write).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          module: 'sink-test',
          message: 'test message',
          attributes: { data: 'test' },
        })
      )
    })

    it('should support multiple custom sinks', () => {
      const sink1: LogSink = { write: vi.fn() }
      const sink2: LogSink = { write: vi.fn() }
      
      provider.addSink(sink1)
      provider.addSink(sink2)
      
      const logger = provider.getLogger('multi-sink')
      logger.warn('warning')
      
      expect(sink1.write).toHaveBeenCalled()
      expect(sink2.write).toHaveBeenCalled()
    })

    it('should support sink removal via disposer', () => {
      const sink1: LogSink = { write: vi.fn() }
      const sink2: LogSink = { write: vi.fn() }
      
      const disposer1 = provider.addSink(sink1)
      provider.addSink(sink2)
      
      const logger = provider.getLogger('disposer-test')
      
      // Both sinks should receive the first message
      logger.info('first message')
      expect(sink1.write).toHaveBeenCalledTimes(1)
      expect(sink2.write).toHaveBeenCalledTimes(1)
      
      // Remove sink1
      disposer1()
      
      // Only sink2 should receive the second message
      logger.info('second message')
      expect(sink1.write).toHaveBeenCalledTimes(1) // Still 1
      expect(sink2.write).toHaveBeenCalledTimes(2) // Now 2
    })
  })

  describe('getRingBuffer re-export', () => {
    it('should return the same ring buffer as core', () => {
      const buffer = getRingBuffer()
      const coreBuffer = getCoreRingBuffer()
      
      expect(buffer).toBe(coreBuffer)
    })

    it('should contain logged messages', () => {
      const logger = provider.getLogger('buffer-test')
      
      logger.info('message 1')
      logger.warn('message 2')
      
      const buffer = getRingBuffer()
      const records = buffer.drain()
      
      expect(records.length).toBeGreaterThanOrEqual(2)
      
      const messages = records.map(r => r.msg)
      expect(messages).toContain('message 1')
      expect(messages).toContain('message 2')
    })
  })
})