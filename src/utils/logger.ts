import { getLogger, getLoggerProvider, getRingBuffer, type CoreLogRecord, type RingBufferLike } from '../sdk/logging/index.js'

/**
 * ログレベル
 */
export enum LogLevel {
  DEBUG = 0,
  LOG = 1,
  ERROR = 2,
}

/**
 * ログエントリ
 */
export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: Date
  data?: unknown
}

/**
 * ログ出力のインターフェース
 */
export interface Logger {
  debug(message: string, data?: unknown): void
  log(message: string, data?: unknown): void
  error(message: string, data?: unknown): void
  setDebugMode(enabled: boolean): void
  isDebugMode(): boolean
  notifyCliStarted?(): void
  getBufferedLogs?(): LogEntry[]
}

/**
 * デバッグモードの判定
 */
const isDebugMode = (): boolean => {
  return (
    process.env.DEBUG === 'true' ||
    process.env.NAF_DEBUG === 'true' ||
    process.argv.includes('--debug') ||
    process.argv.includes('--naf-debug')
  )
}

/**
 * コンソールLogger実装 - 構造化ログシステムとの互換性を維持
 */
export class ConsoleLogger implements Logger {
  private debugEnabled: boolean
  private cliStarted = false
  private structuredLogger: ReturnType<typeof getLogger> | null = null

  constructor() {
    this.debugEnabled = isDebugMode()
  }

  private getStructuredLogger() {
    if (!this.structuredLogger) {
      try {
        this.structuredLogger = getLogger('app')
      } catch {
        // Fallback if provider not registered yet
        // This can happen during tests or early initialization
        return {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        }
      }
    }
    return this.structuredLogger
  }

  // CLI起動の通知
  notifyCliStarted(): void {
    this.cliStarted = true
    const provider = getLoggerProvider()
    if (provider?.enableConsole) {
      provider.enableConsole(this.debugEnabled)
    }
  }

  // バッファリングしたログを取得（前回以降の新規ログのみ）
  getBufferedLogs(): LogEntry[] {
    const rb = getRingBuffer() as RingBufferLike
    // Use drainNew() if available, fallback to drain() for compatibility
    const records = rb.drainNew ? rb.drainNew() : rb.drain()
    return records.map((record: CoreLogRecord) => this.convertToLogEntry(record))
  }

  private convertToLogEntry(record: CoreLogRecord): LogEntry {
    const levelMap: Record<string, LogLevel> = {
      debug: LogLevel.DEBUG,
      info: LogLevel.LOG,
      warn: LogLevel.LOG,   // WARNをERRORに昇格させない
      error: LogLevel.ERROR,
    }
    return {
      level: levelMap[record.level] || LogLevel.LOG,
      message: record.msg,
      timestamp: new Date(record.ts),
      data: record.meta,
    }
  }

  debug(message: string, data?: unknown): void {
    if (!this.debugEnabled) return
    this.getStructuredLogger().debug(message, data)
  }

  log(message: string, data?: unknown): void {
    this.getStructuredLogger().info(message, data)
  }

  error(message: string, data?: unknown): void {
    this.getStructuredLogger().error(message, data)
  }

  setDebugMode(enabled: boolean): void {
    this.debugEnabled = enabled
    const provider = getLoggerProvider()
    if (provider?.setMinLevel) {
      provider.setMinLevel(enabled ? 'debug' : 'info')
    }
    if (this.cliStarted) {
      console.log(`🐛 Debug logging ${enabled ? 'enabled' : 'disabled'}`)
    }
  }

  isDebugMode(): boolean {
    return this.debugEnabled
  }
}

/**
 * グローバルloggerインスタンス
 */
export const logger = new ConsoleLogger()
