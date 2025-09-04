/**
 * Event emitter for log-related events
 * Provides reactive log updates to consumers
 */

import type { CoreLogRecord } from './index.js'

export type LogEventHandler = (records: CoreLogRecord[]) => void

export interface ILogEventEmitter {
  /**
   * Subscribe to new log events
   */
  onNewLogs(handler: LogEventHandler): () => void

  /**
   * Emit new log records
   */
  emitNewLogs(records: CoreLogRecord[]): void

  /**
   * Remove all log event listeners
   */
  removeAllListeners(): void
}

/**
 * Implementation of log event emitter
 */
export class LogEventEmitter implements ILogEventEmitter {
  private handlers: Set<LogEventHandler> = new Set()

  onNewLogs(handler: LogEventHandler): () => void {
    this.handlers.add(handler)

    // Return unsubscribe function
    return () => {
      this.handlers.delete(handler)
    }
  }

  emitNewLogs(records: CoreLogRecord[]): void {
    if (records.length === 0) return

    // Notify all handlers
    for (const handler of this.handlers) {
      try {
        handler(records)
      } catch (error) {
        console.error('Error in log event handler:', error)
      }
    }
  }

  removeAllListeners(): void {
    this.handlers.clear()
  }
}

// Global singleton instance
let globalLogEventEmitter: ILogEventEmitter | null = null

/**
 * Get the global log event emitter
 */
export function getLogEventEmitter(): ILogEventEmitter {
  if (!globalLogEventEmitter) {
    globalLogEventEmitter = new LogEventEmitter()
  }
  return globalLogEventEmitter
}

/**
 * Reset the log event emitter (mainly for testing)
 */
export function resetLogEventEmitter(): void {
  if (globalLogEventEmitter) {
    globalLogEventEmitter.removeAllListeners()
  }
  globalLogEventEmitter = null
}
