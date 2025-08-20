import { describe, expect, it } from 'vitest'
import {
  createLogger,
  enableConsole,
  getRingBuffer,
  Logger,
  type LogRecord,
  MultiSink,
  RingBuffer,
} from './logger-factory.js'

describe('RingBuffer', () => {
  it('should store log records up to capacity', () => {
    const buffer = new RingBuffer(3)

    buffer.write({ ts: 1, level: 'info', module: 'test', msg: 'msg1' })
    buffer.write({ ts: 2, level: 'info', module: 'test', msg: 'msg2' })
    buffer.write({ ts: 3, level: 'info', module: 'test', msg: 'msg3' })

    const records = buffer.drain()
    expect(records).toHaveLength(3)
    expect(records[0].msg).toBe('msg1')
    expect(records[2].msg).toBe('msg3')
  })

  it('should overwrite old records when capacity exceeded', () => {
    const buffer = new RingBuffer(2)

    buffer.write({ ts: 1, level: 'info', module: 'test', msg: 'msg1' })
    buffer.write({ ts: 2, level: 'info', module: 'test', msg: 'msg2' })
    buffer.write({ ts: 3, level: 'info', module: 'test', msg: 'msg3' })

    const records = buffer.drain()
    expect(records).toHaveLength(2)
    expect(records[0].msg).toBe('msg2')
    expect(records[1].msg).toBe('msg3')
  })

  it('should clear buffer', () => {
    const buffer = new RingBuffer(10)

    buffer.write({ ts: 1, level: 'info', module: 'test', msg: 'msg1' })
    buffer.write({ ts: 2, level: 'info', module: 'test', msg: 'msg2' })

    buffer.clear()
    const records = buffer.drain()
    expect(records).toHaveLength(0)
  })

  it('should report correct size', () => {
    const buffer = new RingBuffer(5)

    expect(buffer.size()).toBe(0)

    buffer.write({ ts: 1, level: 'info', module: 'test', msg: 'msg1' })
    expect(buffer.size()).toBe(1)

    buffer.write({ ts: 2, level: 'info', module: 'test', msg: 'msg2' })
    expect(buffer.size()).toBe(2)

    // Add more than capacity
    for (let i = 3; i <= 7; i++) {
      buffer.write({ ts: i, level: 'info', module: 'test', msg: `msg${i}` })
    }
    expect(buffer.size()).toBe(5) // Capped at capacity
  })
})

describe('MultiSink', () => {
  it('should write to all sinks', () => {
    const records1: LogRecord[] = []
    const records2: LogRecord[] = []

    const sink1 = { write: (r: LogRecord) => records1.push(r) }
    const sink2 = { write: (r: LogRecord) => records2.push(r) }

    const multiSink = new MultiSink([sink1, sink2])
    const record: LogRecord = { ts: 1, level: 'info', module: 'test', msg: 'test' }

    multiSink.write(record)

    expect(records1).toHaveLength(1)
    expect(records2).toHaveLength(1)
    expect(records1[0]).toEqual(record)
    expect(records2[0]).toEqual(record)
  })

  it('should handle sink errors gracefully', () => {
    const records: LogRecord[] = []
    const errorSink = {
      write: () => {
        throw new Error('Sink error')
      },
    }
    const goodSink = { write: (r: LogRecord) => records.push(r) }

    const multiSink = new MultiSink([errorSink, goodSink])
    const record: LogRecord = { ts: 1, level: 'info', module: 'test', msg: 'test' }

    // Should not throw
    expect(() => multiSink.write(record)).not.toThrow()

    // Good sink should still receive the record
    expect(records).toHaveLength(1)
  })

  it('should add and remove sinks dynamically', () => {
    const records: LogRecord[] = []
    const sink = { write: (r: LogRecord) => records.push(r) }

    const multiSink = new MultiSink([])
    multiSink.addSink(sink)

    multiSink.write({ ts: 1, level: 'info', module: 'test', msg: 'test' })
    expect(records).toHaveLength(1)

    multiSink.removeSink(sink)
    multiSink.write({ ts: 2, level: 'info', module: 'test', msg: 'test2' })
    expect(records).toHaveLength(1) // No new records
  })
})

describe('Logger', () => {
  it('should write log records with correct level', () => {
    const records: LogRecord[] = []
    const sink = { write: (r: LogRecord) => records.push(r) }
    const logger = new Logger('TestModule', sink)

    logger.debug('debug message')
    logger.info('info message')
    logger.warn('warn message')
    logger.error('error message')

    expect(records).toHaveLength(4)
    expect(records[0]).toMatchObject({ level: 'debug', module: 'TestModule', msg: 'debug message' })
    expect(records[1]).toMatchObject({ level: 'info', module: 'TestModule', msg: 'info message' })
    expect(records[2]).toMatchObject({ level: 'warn', module: 'TestModule', msg: 'warn message' })
    expect(records[3]).toMatchObject({ level: 'error', module: 'TestModule', msg: 'error message' })
  })

  it('should include metadata in log records', () => {
    const records: LogRecord[] = []
    const sink = { write: (r: LogRecord) => records.push(r) }
    const logger = new Logger('TestModule', sink)

    const meta = { userId: '123', action: 'login' }
    logger.info('User logged in', meta)

    expect(records).toHaveLength(1)
    expect(records[0].meta).toEqual(meta)
  })

  it('should set timestamp on log records', () => {
    const records: LogRecord[] = []
    const sink = { write: (r: LogRecord) => records.push(r) }
    const logger = new Logger('TestModule', sink)

    const before = Date.now()
    logger.info('test')
    const after = Date.now()

    expect(records[0].ts).toBeGreaterThanOrEqual(before)
    expect(records[0].ts).toBeLessThanOrEqual(after)
  })
})

describe('LoggerFactory', () => {
  it('should create logger with shared ring buffer', () => {
    const logger1 = createLogger('Module1')
    const logger2 = createLogger('Module2')

    logger1.info('msg from module 1')
    logger2.info('msg from module 2')

    const records = getRingBuffer().drain()
    expect(records).toHaveLength(2)
    expect(records[0].module).toBe('Module1')
    expect(records[1].module).toBe('Module2')
  })

  it('should enable console output', () => {
    // This test just verifies the method exists and doesn't throw
    expect(() => enableConsole()).not.toThrow()
  })
})
