/**
 * SDK Logging module - SPI and default implementation
 */

// Export SPI interfaces and registration functions
export * from './spi.js'

// Export default provider and CLI compatibility functions
export { DefaultLoggerProvider, getRingBuffer } from './providers/default.js'

// Core logging types
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogRecord {
  ts: number
  level: LogLevel
  module: string
  msg: string
  meta?: unknown
}

// Type definition for RingBuffer-like objects
export interface RingBufferLike {
  drain(): LogRecord[]
  drainNew?(): LogRecord[]
  clear(): void
  size(): number
}

// Re-export for backward compatibility
export type { LogRecord as CoreLogRecord }