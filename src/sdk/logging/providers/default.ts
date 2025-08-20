/**
 * Default LoggerProvider implementation using existing logger-factory
 */

import {
  createLogger as createCoreLogger,
  getRingBuffer as getCoreRingBuffer,
  enableConsole as coreEnableConsole,
  setMinLevel as coreSetMinLevel,
  registerSink as coreRegisterSink,
  type Logger as CoreLogger,
  type LogRecord as CoreRecord,
  type LogSink as CoreSink,
} from '../../../utils/logging/logger-factory.js'

import type {
  LoggerProvider,
  Logger as SpiLogger,
  LogSink,
  LogLevel,
  LogEvent,
} from '../spi.js'

/**
 * Adapter to wrap core Logger with SPI Logger interface
 */
class CoreLoggerAdapter implements SpiLogger {
  constructor(private core: CoreLogger) {}

  debug(msg: string, attributes?: unknown): void {
    this.core.debug(msg, attributes)
  }

  info(msg: string, attributes?: unknown): void {
    this.core.info(msg, attributes)
  }

  warn(msg: string, attributes?: unknown): void {
    this.core.warn(msg, attributes)
  }

  error(msg: string, attributes?: unknown): void {
    this.core.error(msg, attributes)
  }
}

/**
 * Adapter to bridge SPI LogSink to Core LogSink
 */
class SinkAdapter implements CoreSink {
  constructor(private spiSink: LogSink) {}

  write(record: CoreRecord): void {
    // Convert CoreRecord to LogEvent
    const event: LogEvent = {
      ts: record.ts,
      level: record.level,
      module: record.module,
      message: record.msg,
      attributes: record.meta,
    }
    this.spiSink.write(event)
  }
}

/**
 * Default LoggerProvider that delegates to existing logger-factory
 */
export class DefaultLoggerProvider implements LoggerProvider {
  getLogger(module: string): SpiLogger {
    return new CoreLoggerAdapter(createCoreLogger(module))
  }

  addSink(sink: LogSink): undefined | (() => void) {
    // Register the sink through the core API and return disposer
    const disposer = coreRegisterSink(new SinkAdapter(sink))
    return disposer
  }

  setMinLevel(level: LogLevel): void {
    // Use the new setMinLevel API directly
    coreSetMinLevel(level)
  }

  enableConsole(debug?: boolean): void {
    // Delegate to core enableConsole which handles duplicate prevention
    coreEnableConsole(debug)
  }
}

/**
 * Re-export getRingBuffer for CLI compatibility
 */
export function getRingBuffer() {
  return getCoreRingBuffer()
}