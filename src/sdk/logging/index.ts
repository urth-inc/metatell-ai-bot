/**
 * SDK Logging module - SPI and default implementation
 */

// Export SPI interfaces and registration functions
export * from './spi.js'

// Export default provider and CLI compatibility functions
export { DefaultLoggerProvider, getRingBuffer } from './providers/default.js'

// Re-export core types for CLI compatibility
export type { LogRecord as CoreLogRecord } from '../../utils/logging/logger-factory.js'
import type { LogRecord } from '../../utils/logging/logger-factory.js'

// Type definition for RingBuffer-like objects
export interface RingBufferLike {
  drain(): LogRecord[]
  drainNew?(): LogRecord[]
  clear(): void
  size(): number
  resetReadCursor?(): void
}