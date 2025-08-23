/**
 * Default LoggerProvider implementation
 */

import type { LogRecord, RingBufferLike } from '../index.js'
import { getLogEventEmitter } from '../LogEventEmitter.js'
import type { Logger, LoggerProvider, LogLevel, LogSink } from '../spi.js'

/**
 * Simple ring buffer implementation
 */
class RingBuffer implements RingBufferLike {
  private buffer: LogRecord[] = []
  private writeIndex = 0
  private wrapped = false
  private readIndex = 0

  constructor(private readonly capacity: number = 1000) {}

  write(record: LogRecord): void {
    this.buffer[this.writeIndex] = record
    this.writeIndex = (this.writeIndex + 1) % this.capacity
    if (this.writeIndex === 0) {
      this.wrapped = true
    }

    // Emit event for new log
    const eventEmitter = getLogEventEmitter()
    eventEmitter.emitNewLogs([record])
  }

  drain(): LogRecord[] {
    if (!this.wrapped && this.writeIndex === 0) {
      return []
    }

    const result = this.wrapped
      ? [...this.buffer.slice(this.writeIndex), ...this.buffer.slice(0, this.writeIndex)]
      : this.buffer.slice(0, this.writeIndex)

    this.clear()
    return result
  }

  drainNew(): LogRecord[] {
    const newRecords: LogRecord[] = []

    while (
      this.readIndex !== this.writeIndex ||
      (this.wrapped && this.readIndex === this.writeIndex)
    ) {
      newRecords.push(this.buffer[this.readIndex])
      this.readIndex = (this.readIndex + 1) % this.capacity
      if (this.readIndex === 0) {
        this.wrapped = false
      }
    }

    return newRecords
  }

  clear(): void {
    this.buffer = []
    this.writeIndex = 0
    this.wrapped = false
    this.readIndex = 0
  }

  size(): number {
    if (!this.wrapped) {
      return this.writeIndex
    }
    return this.capacity
  }
}

// Global state
let globalRingBuffer: RingBuffer | null = null
let globalMinLevel: LogLevel = 'info'
let globalConsoleEnabled = true
const globalSinks = new Set<LogSink>()

/**
 * Default logger implementation
 */
class DefaultLogger implements Logger {
  constructor(private readonly name: string) {}

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
    const currentLevelIndex = levels.indexOf(globalMinLevel)
    const messageLevelIndex = levels.indexOf(level)
    return messageLevelIndex >= currentLevelIndex
  }

  private log(level: LogLevel, message: string, meta?: unknown): void {
    if (!this.shouldLog(level)) return

    const record: LogRecord = {
      ts: Date.now(),
      level,
      module: this.name,
      msg: message,
      meta,
    }

    // Write to ring buffer
    if (globalRingBuffer) {
      globalRingBuffer.write(record)
    }

    // Write to sinks (convert LogRecord to LogEvent)
    for (const sink of globalSinks) {
      sink.write({
        ts: record.ts,
        level: record.level,
        module: record.module,
        message: record.msg,
        attributes: record.meta,
      })
    }

    // Write to console if enabled
    if (globalConsoleEnabled) {
      const timestamp = new Date(record.ts).toISOString()
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : ''
      const logMessage = `[${timestamp}] [${level.toUpperCase()}] [${this.name}] ${message}${metaStr}`

      switch (level) {
        case 'debug':
          console.debug(logMessage)
          break
        case 'info':
          console.info(logMessage)
          break
        case 'warn':
          console.warn(logMessage)
          break
        case 'error':
          console.error(logMessage)
          break
      }
    }
  }

  debug(message: string, meta?: unknown): void {
    this.log('debug', message, meta)
  }

  info(message: string, meta?: unknown): void {
    this.log('info', message, meta)
  }

  warn(message: string, meta?: unknown): void {
    this.log('warn', message, meta)
  }

  error(message: string, meta?: unknown): void {
    this.log('error', message, meta)
  }
}

/**
 * Default LoggerProvider implementation
 */
export class DefaultLoggerProvider implements LoggerProvider {
  constructor() {
    // Initialize global ring buffer if not already created
    if (!globalRingBuffer) {
      globalRingBuffer = new RingBuffer(1000)
    }
  }

  getLogger(name: string): Logger {
    return new DefaultLogger(name)
  }

  setLogLevel(level: LogLevel): void {
    globalMinLevel = level
  }

  enableConsole(enabled: boolean): void {
    globalConsoleEnabled = enabled
  }

  registerSink(sink: LogSink): void {
    globalSinks.add(sink)
  }

  unregisterSink(sink: LogSink): void {
    globalSinks.delete(sink)
  }
}

/**
 * Get the global ring buffer (for CLI compatibility)
 */
export function getRingBuffer(): RingBufferLike | null {
  return globalRingBuffer
}
