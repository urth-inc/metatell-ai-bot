/**
 * Structured logging system with ring buffer support
 */

import { safeStringify } from './safeStringify.js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogRecord {
  ts: number
  level: LogLevel
  module: string
  msg: string
  meta?: unknown
}

export interface LogSink {
  write(record: LogRecord): void
}

/**
 * Ring buffer implementation for log records
 */
export class RingBuffer implements LogSink {
  private buffer: LogRecord[] = []
  private writeIndex = 0
  private wrapped = false
  // For drainNew() - tracks last read position
  private readIndex = 0
  private readWrapped = false
  // For detecting new writes in capacity=1 case
  private writeCount = 0
  private readCount = 0

  constructor(private readonly capacity: number = 1000) {}

  write(record: LogRecord): void {
    this.buffer[this.writeIndex] = record
    this.writeIndex = (this.writeIndex + 1) % this.capacity
    this.writeCount++
    if (this.writeIndex === 0) {
      this.wrapped = true
    }
  }

  drain(): LogRecord[] {
    if (!this.wrapped && this.writeIndex === 0) {
      return []
    }

    const result: LogRecord[] = []

    if (this.wrapped) {
      // Buffer has wrapped - read from writeIndex to end, then from 0 to writeIndex-1
      for (let i = this.writeIndex; i < this.capacity; i++) {
        const rec = this.buffer[i]
        if (rec) result.push(rec)
      }
      for (let i = 0; i < this.writeIndex; i++) {
        const rec = this.buffer[i]
        if (rec) result.push(rec)
      }
    } else {
      // Buffer hasn't wrapped - read from 0 to writeIndex-1 only
      for (let i = 0; i < this.writeIndex; i++) {
        const rec = this.buffer[i]
        if (rec) result.push(rec)
      }
    }

    return result
  }

  clear(): void {
    this.buffer = []
    this.writeIndex = 0
    this.wrapped = false
    this.readIndex = 0
    this.readWrapped = false
    this.writeCount = 0
    this.readCount = 0
  }

  size(): number {
    return this.wrapped ? this.capacity : this.writeIndex
  }

  /**
   * Drain only new records since last drainNew() call
   *
   * IMPORTANT: Single consumer only! Multiple consumers calling drainNew()
   * will result in lost records as the read cursor is shared.
   *
   * For multiple consumers, either:
   * 1. Use drain() and track position externally
   * 2. TODO: Implement reader handles with per-consumer cursors
   *    Example: const reader = buffer.createReader(); reader.drainNew()
   *
   * @returns Array of new log records since last drainNew() call
   */
  drainNew(): LogRecord[] {
    const result: LogRecord[] = []

    // If no new writes since last read, nothing new to read
    if (this.readCount >= this.writeCount) {
      return result
    }

    // Calculate read boundaries
    let current = this.readIndex
    const hasWrapped = this.wrapped || this.readWrapped

    if (hasWrapped) {
      // Buffer has wrapped - read in circular fashion
      do {
        if (this.buffer[current]) {
          result.push(this.buffer[current])
        }
        const next = (current + 1) % this.capacity
        if (next === this.writeIndex) {
          break
        }
        current = next
      } while (current !== this.writeIndex)
    } else {
      // Buffer hasn't wrapped - simple linear read
      for (let i = this.readIndex; i < this.writeIndex; i++) {
        if (this.buffer[i]) {
          result.push(this.buffer[i])
        }
      }
    }

    // Update read position
    this.readIndex = this.writeIndex
    this.readWrapped = this.wrapped
    this.readCount = this.writeCount

    return result
  }

  /**
   * Reset read cursor for drainNew()
   */
  resetReadCursor(): void {
    this.readIndex = this.wrapped ? this.writeIndex : 0
    this.readWrapped = false
    this.readCount = 0 // Reset to read all from beginning
  }
}

/**
 * Multiplex sink that writes to multiple sinks
 */
export class MultiSink implements LogSink {
  constructor(private readonly sinks: LogSink[]) {}

  write(record: LogRecord): void {
    for (const sink of this.sinks) {
      try {
        sink.write(record)
      } catch (error) {
        // Avoid recursion by using stderr directly instead of console.error
        // which might go through ConsoleSink
        const errorMsg = `[Log sink error] ${error instanceof Error ? error.message : String(error)}\n`
        process.stderr.write(errorMsg)
      }
    }
  }

  addSink(sink: LogSink): void {
    this.sinks.push(sink)
  }

  removeSink(sink: LogSink): void {
    const idx = this.sinks.indexOf(sink)
    if (idx >= 0) {
      this.sinks.splice(idx, 1)
    }
  }
}

/**
 * Console sink for direct output
 */
export class ConsoleSink implements LogSink {
  constructor(private minLevel: LogLevel = 'info') {}

  setMinLevel(level: LogLevel): void {
    this.minLevel = level
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
    const recordLevelIndex = levels.indexOf(level)
    const minLevelIndex = levels.indexOf(this.minLevel)
    return recordLevelIndex >= minLevelIndex
  }

  write(record: LogRecord): void {
    if (!this.shouldLog(record.level)) {
      return
    }
    const timestamp = new Date(record.ts).toISOString()
    const prefix = `[${timestamp}] [${record.level.toUpperCase()}] [${record.module}]`
    const message = record.meta
      ? `${prefix} ${record.msg} ${safeStringify(record.meta, 1000)}`
      : `${prefix} ${record.msg}`

    switch (record.level) {
      case 'debug':
        console.log(message) // console.debugはデフォルトで非表示のためconsole.logを使用
        break
      case 'info':
        console.info(message)
        break
      case 'warn':
        console.warn(message)
        break
      case 'error':
        console.error(message)
        break
    }
  }
}

/**
 * Logger instance
 */
export class Logger {
  constructor(
    private readonly module: string,
    private readonly sink: LogSink,
  ) {}

  private write(level: LogLevel, msg: string, meta?: unknown): void {
    this.sink.write({
      ts: Date.now(),
      level,
      module: this.module,
      msg,
      meta,
    })
  }

  debug(msg: string, meta?: unknown): void {
    this.write('debug', msg, meta)
  }

  info(msg: string, meta?: unknown): void {
    this.write('info', msg, meta)
  }

  warn(msg: string, meta?: unknown): void {
    this.write('warn', msg, meta)
  }

  error(msg: string, meta?: unknown): void {
    this.write('error', msg, meta)
  }
}

/**
 * Logger factory with global ring buffer
 */
const ringBuffer = new RingBuffer(1000)
const multiSink = new MultiSink([ringBuffer])
let consoleSinkRef: ConsoleSink | null = null

export function createLogger(module: string): Logger {
  return new Logger(module, multiSink)
}

export function getRingBuffer(): RingBuffer {
  return ringBuffer
}

/**
 * Register a new log sink
 * @returns A function to unregister the sink
 */
export function registerSink(sink: LogSink): () => void {
  multiSink.addSink(sink)
  return () => multiSink.removeSink(sink)
}

/**
 * Set minimum log level for console output
 */
export function setMinLevel(level: LogLevel): void {
  if (!consoleSinkRef) {
    consoleSinkRef = new ConsoleSink(level)
    multiSink.addSink(consoleSinkRef)
  } else {
    consoleSinkRef.setMinLevel(level)
  }
}

/**
 * Enable console output with optional debug mode
 * If already enabled, updates the log level
 */
export function enableConsole(debug?: boolean): void {
  const level: LogLevel = debug === undefined ? 'info' : debug ? 'debug' : 'info'
  if (!consoleSinkRef) {
    consoleSinkRef = new ConsoleSink(level)
    multiSink.addSink(consoleSinkRef)
  } else {
    consoleSinkRef.setMinLevel(level)
  }
}

export function disableConsole(): void {
  if (consoleSinkRef) {
    multiSink.removeSink(consoleSinkRef)
    consoleSinkRef = null
  }
}
