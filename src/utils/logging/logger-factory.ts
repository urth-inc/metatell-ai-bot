/**
 * Structured logging system with ring buffer support
 */

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

  constructor(private readonly capacity: number = 1000) {}

  write(record: LogRecord): void {
    this.buffer[this.writeIndex] = record
    this.writeIndex = (this.writeIndex + 1) % this.capacity
    if (this.writeIndex === 0) {
      this.wrapped = true
    }
  }

  drain(): LogRecord[] {
    if (!this.wrapped && this.writeIndex === 0) {
      return []
    }

    const result: LogRecord[] = []
    const start = this.wrapped ? this.writeIndex : 0
    const end = this.wrapped ? this.capacity : this.writeIndex

    // 古いログから順に取得
    for (let i = start; i < this.capacity; i++) {
      if (this.buffer[i]) result.push(this.buffer[i])
    }
    if (this.wrapped) {
      for (let i = 0; i < this.writeIndex; i++) {
        if (this.buffer[i]) result.push(this.buffer[i])
      }
    }

    return result
  }

  clear(): void {
    this.buffer = []
    this.writeIndex = 0
    this.wrapped = false
  }

  size(): number {
    return this.wrapped ? this.capacity : this.writeIndex
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
        // シンクのエラーは握りつぶす
        console.error('Log sink error:', error)
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
  write(record: LogRecord): void {
    const timestamp = new Date(record.ts).toISOString()
    const prefix = `[${timestamp}] [${record.level.toUpperCase()}] [${record.module}]`
    const message = record.meta
      ? `${prefix} ${record.msg} ${JSON.stringify(record.meta)}`
      : `${prefix} ${record.msg}`

    switch (record.level) {
      case 'debug':
        console.debug(message)
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
export class LoggerFactory {
  private static ringBuffer = new RingBuffer(1000)
  private static multiSink = new MultiSink([LoggerFactory.ringBuffer])
  private static cliStarted = false

  static createLogger(module: string): Logger {
    return new Logger(module, LoggerFactory.multiSink)
  }

  static getRingBuffer(): RingBuffer {
    return LoggerFactory.ringBuffer
  }

  static enableConsole(): void {
    if (!LoggerFactory.cliStarted) {
      LoggerFactory.cliStarted = true
      LoggerFactory.multiSink.addSink(new ConsoleSink())
    }
  }

  static disableConsole(): void {
    // 将来の拡張用
  }
}
