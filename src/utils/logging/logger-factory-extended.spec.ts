import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  registerSink,
  setMinLevel,
  createLogger,
  RingBuffer,
  ConsoleSink,
  enableConsole,
  disableConsole,
  type LogSink,
} from './logger-factory.js'
import { safeStringify } from './safeStringify.js'

describe('RingBuffer.drainNew()', () => {
  it('should return only new records since last drainNew call', () => {
    const buffer = new RingBuffer(10)
    
    // Write first batch
    buffer.write({ ts: 1, level: 'info', module: 'test', msg: 'msg1' })
    buffer.write({ ts: 2, level: 'info', module: 'test', msg: 'msg2' })
    
    // First drainNew should return both
    const firstBatch = buffer.drainNew()
    expect(firstBatch).toHaveLength(2)
    expect(firstBatch[0].msg).toBe('msg1')
    expect(firstBatch[1].msg).toBe('msg2')
    
    // Second drainNew should return empty
    const emptyBatch = buffer.drainNew()
    expect(emptyBatch).toHaveLength(0)
    
    // Write more records
    buffer.write({ ts: 3, level: 'info', module: 'test', msg: 'msg3' })
    buffer.write({ ts: 4, level: 'info', module: 'test', msg: 'msg4' })
    
    // Third drainNew should return only new records
    const secondBatch = buffer.drainNew()
    expect(secondBatch).toHaveLength(2)
    expect(secondBatch[0].msg).toBe('msg3')
    expect(secondBatch[1].msg).toBe('msg4')
  })

  it('should handle buffer wrapping correctly', () => {
    const buffer = new RingBuffer(3)
    
    // Fill buffer completely
    buffer.write({ ts: 1, level: 'info', module: 'test', msg: 'msg1' })
    buffer.write({ ts: 2, level: 'info', module: 'test', msg: 'msg2' })
    buffer.write({ ts: 3, level: 'info', module: 'test', msg: 'msg3' })
    
    // Drain all
    const firstBatch = buffer.drainNew()
    expect(firstBatch).toHaveLength(3)
    
    // Wrap around
    buffer.write({ ts: 4, level: 'info', module: 'test', msg: 'msg4' })
    buffer.write({ ts: 5, level: 'info', module: 'test', msg: 'msg5' })
    
    // Should get only new records
    const secondBatch = buffer.drainNew()
    expect(secondBatch).toHaveLength(2)
    expect(secondBatch[0].msg).toBe('msg4')
    expect(secondBatch[1].msg).toBe('msg5')
  })

  it('should work independently from drain()', () => {
    const buffer = new RingBuffer(5)
    
    buffer.write({ ts: 1, level: 'info', module: 'test', msg: 'msg1' })
    buffer.write({ ts: 2, level: 'info', module: 'test', msg: 'msg2' })
    
    // drain() returns all records
    const allRecords = buffer.drain()
    expect(allRecords).toHaveLength(2)
    
    // drainNew() still returns new records
    const newRecords = buffer.drainNew()
    expect(newRecords).toHaveLength(2)
    
    // Second drainNew() returns empty
    const empty = buffer.drainNew()
    expect(empty).toHaveLength(0)
    
    // drain() still returns all records
    const allRecordsAgain = buffer.drain()
    expect(allRecordsAgain).toHaveLength(2)
  })

  it('should reset read cursor correctly', () => {
    const buffer = new RingBuffer(5)
    
    buffer.write({ ts: 1, level: 'info', module: 'test', msg: 'msg1' })
    buffer.drainNew() // consume
    
    buffer.write({ ts: 2, level: 'info', module: 'test', msg: 'msg2' })
    
    // Reset cursor
    buffer.resetReadCursor()
    
    // Should get all records
    const records = buffer.drainNew()
    expect(records).toHaveLength(2)
    expect(records[0].msg).toBe('msg1')
    expect(records[1].msg).toBe('msg2')
  })

  it('should return empty array on consecutive drainNew calls after wrap', () => {
    const buffer = new RingBuffer(3)
    
    // Fill buffer and wrap around
    buffer.write({ ts: 1, level: 'info', module: 'test', msg: 'msg1' })
    buffer.write({ ts: 2, level: 'info', module: 'test', msg: 'msg2' })
    buffer.write({ ts: 3, level: 'info', module: 'test', msg: 'msg3' })
    buffer.write({ ts: 4, level: 'info', module: 'test', msg: 'msg4' }) // wraps
    
    // First drain should return all current records
    const firstBatch = buffer.drainNew()
    expect(firstBatch.length).toBeGreaterThan(0)
    
    // Second consecutive drain should return empty (no new records)
    const secondBatch = buffer.drainNew()
    expect(secondBatch).toHaveLength(0)
    
    // Third consecutive drain should also return empty
    const thirdBatch = buffer.drainNew()
    expect(thirdBatch).toHaveLength(0)
  })

  it('should properly reset read state after clear()', () => {
    const buffer = new RingBuffer(5)
    
    // Add some records and consume
    buffer.write({ ts: 1, level: 'info', module: 'test', msg: 'msg1' })
    buffer.write({ ts: 2, level: 'info', module: 'test', msg: 'msg2' })
    buffer.drainNew() // consume
    
    // Clear buffer
    buffer.clear()
    
    // drainNew should return empty
    const afterClear = buffer.drainNew()
    expect(afterClear).toHaveLength(0)
    
    // Add new records after clear
    buffer.write({ ts: 3, level: 'info', module: 'test', msg: 'msg3' })
    
    // Should get only new records
    const newRecords = buffer.drainNew()
    expect(newRecords).toHaveLength(1)
    expect(newRecords[0].msg).toBe('msg3')
  })

  it('should handle capacity=1 wrap edge case correctly', () => {
    const buffer = new RingBuffer(1)
    
    // First write
    buffer.write({ ts: 1, level: 'info', module: 'test', msg: 'msg1' })
    expect(buffer.drainNew().map(r => r.msg)).toEqual(['msg1'])
    
    // Second write (wraps)
    buffer.write({ ts: 2, level: 'info', module: 'test', msg: 'msg2' })
    expect(buffer.drainNew().map(r => r.msg)).toEqual(['msg2'])
    
    // Should return empty on next call
    expect(buffer.drainNew()).toHaveLength(0)
  })
})

describe('registerSink', () => {
  it('should add custom sink to receive log records', () => {
    const customSink: LogSink = {
      write: vi.fn(),
    }
    
    const disposer = registerSink(customSink)
    expect(typeof disposer).toBe('function')
    
    const logger = createLogger('test')
    logger.info('test message', { data: 'test' })
    
    expect(customSink.write).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        module: 'test',
        msg: 'test message',
        meta: { data: 'test' },
      })
    )
  })

  it('should support multiple custom sinks', () => {
    const sink1: LogSink = { write: vi.fn() }
    const sink2: LogSink = { write: vi.fn() }
    
    registerSink(sink1)
    registerSink(sink2)
    
    const logger = createLogger('multi')
    logger.warn('warning')
    
    expect(sink1.write).toHaveBeenCalled()
    expect(sink2.write).toHaveBeenCalled()
  })

  it('should support sink removal via disposer function', () => {
    const sink1: LogSink = { write: vi.fn() }
    const sink2: LogSink = { write: vi.fn() }
    
    const disposer1 = registerSink(sink1)
    registerSink(sink2)
    
    const logger = createLogger('disposer-test')
    
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

describe('setMinLevel', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>
    info: ReturnType<typeof vi.spyOn>
    warn: ReturnType<typeof vi.spyOn>
    error: ReturnType<typeof vi.spyOn>
  }
  
  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    }
  })
  
  it('should filter logs based on minimum level', () => {
    setMinLevel('warn')
    
    const logger = createLogger('level-test')
    logger.debug('debug msg')
    logger.info('info msg')
    logger.warn('warn msg')
    logger.error('error msg')
    
    // Only warn and error should be logged
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
    setMinLevel('error')
    
    const logger = createLogger('dynamic')
    logger.warn('should not appear')
    expect(consoleSpy.warn).not.toHaveBeenCalled()
    
    // Lower the threshold
    setMinLevel('debug')
    logger.debug('should appear')
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('should appear')
    )
  })
})

describe('ConsoleSink.setMinLevel()', () => {
  it('should update minimum log level dynamically', () => {
    const sink = new ConsoleSink('error')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    
    // Initially only error level
    sink.write({ ts: Date.now(), level: 'warn', module: 'test', msg: 'warning' })
    expect(warnSpy).not.toHaveBeenCalled()
    
    sink.write({ ts: Date.now(), level: 'error', module: 'test', msg: 'error' })
    expect(spy).toHaveBeenCalled()
    
    // Change level to warn
    sink.setMinLevel('warn')
    sink.write({ ts: Date.now(), level: 'warn', module: 'test', msg: 'warning2' })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('warning2'))
  })
})

describe('disableConsole', () => {
  beforeEach(() => {
    // Reset console sink state
    disableConsole()
  })

  it('should be idempotent - multiple calls should not cause errors', () => {
    // Enable first
    enableConsole(true)
    
    // Multiple disable calls should not throw
    expect(() => {
      disableConsole()
      disableConsole()
      disableConsole()
    }).not.toThrow()
    
    // Should still work after multiple disables
    expect(() => {
      enableConsole(false)
    }).not.toThrow()
  })
})

describe('setDebugMode() console threshold update', () => {
  it('should update console minimum level when debug mode changes', () => {
    // Reset and enable console with info level
    disableConsole()
    enableConsole(false) // info level
    
    const consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    }
    
    const logger = createLogger('debug-test')
    
    // Debug messages should not appear at info level
    logger.debug('debug message 1')
    expect(consoleSpy.log).not.toHaveBeenCalled()
    
    // Info messages should appear
    logger.info('info message')
    expect(consoleSpy.info).toHaveBeenCalledWith(
      expect.stringContaining('info message')
    )
    
    // Change to debug level via setMinLevel
    setMinLevel('debug')
    
    // Now debug messages should appear
    logger.debug('debug message 2')
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('debug message 2')
    )
    
    consoleSpy.log.mockRestore()
    consoleSpy.info.mockRestore()
  })

  it('should handle complex enable/disable sequences', () => {
    disableConsole()
    enableConsole(false) // info level
    setMinLevel('warn')  // raise to warn
    disableConsole()
    enableConsole(true)  // re-enable with debug
    
    const logger = createLogger('sequence-test')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    // Debug should appear since we re-enabled with debug=true
    logger.debug('debug after sequence')
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('debug after sequence')
    )
    
    logSpy.mockRestore()
    warnSpy.mockRestore()
  })
})

describe('ConsoleSink minLevel filtering', () => {
  it('should respect minimum log level', () => {
    const sink = new ConsoleSink('warn')
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    
    sink.write({ ts: Date.now(), level: 'info', module: 'test', msg: 'info message' })
    expect(spy).not.toHaveBeenCalled()
    
    spy.mockRestore()
  })

  it('should allow logs at or above minimum level', () => {
    const sink = new ConsoleSink('info')
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    
    sink.write({ ts: Date.now(), level: 'info', module: 'test', msg: 'info message' })
    expect(infoSpy).toHaveBeenCalled()
    
    sink.write({ ts: Date.now(), level: 'warn', module: 'test', msg: 'warn message' })
    expect(warnSpy).toHaveBeenCalled()
    
    infoSpy.mockRestore()
    warnSpy.mockRestore()
  })
})

describe('RingBuffer large capacity with wraps', () => {
  it('should maintain order through multiple wraps', () => {
    const buffer = new RingBuffer(3)
    
    // Fill and wrap multiple times
    for (let i = 1; i <= 10; i++) {
      buffer.write({ ts: i, level: 'info', module: 'test', msg: `msg${i}` })
    }
    
    // Should have last 3 messages
    const records = buffer.drain()
    expect(records).toHaveLength(3)
    expect(records.map(r => r.msg)).toEqual(['msg8', 'msg9', 'msg10'])
  })
})

describe('safeStringify', () => {
  it('should handle circular references', () => {
    const obj: Record<string, unknown> = { name: 'test' }
    obj.self = obj // Circular reference
    
    const result = safeStringify(obj)
    expect(result).toContain('"name": "test"')
    expect(result).toContain('[Circular]')
    expect(typeof result).toBe('string')
  })

  it('should truncate long strings', () => {
    const longObj = {
      data: 'x'.repeat(20000) // Very long string
    }
    
    const result = safeStringify(longObj, 1000)
    expect(result.length).toBeLessThanOrEqual(1020) // maxLen + some buffer for structure
    expect(result).toContain('…[truncated]')
  })

  it('should handle unserializable objects', () => {
    // Function cannot be serialized
    const obj = {
      func: () => 'test',
      date: new Date(),
    }
    
    const result = safeStringify(obj)
    expect(typeof result).toBe('string')
    // Should not throw and should produce some string representation
    expect(result.length).toBeGreaterThan(0)
  })
})