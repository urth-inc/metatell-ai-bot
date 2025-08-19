import { createLogger, enableConsole, getRingBuffer, type LogRecord } from './logging/logger-factory.js'

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
  private structuredLogger = createLogger('app')

  constructor() {
    this.debugEnabled = isDebugMode()
  }

  // CLI起動の通知
  notifyCliStarted(): void {
    this.cliStarted = true
    enableConsole()
  }

  // バッファリングしたログを取得（取得後にバッファをクリア）
  getBufferedLogs(): LogEntry[] {
    const records = getRingBuffer().drain()
    return records.map((record) => this.convertToLogEntry(record))
  }

  private convertToLogEntry(record: LogRecord): LogEntry {
    const levelMap: Record<string, LogLevel> = {
      debug: LogLevel.DEBUG,
      info: LogLevel.LOG,
      warn: LogLevel.ERROR,
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
    this.structuredLogger.debug(message, data)
  }

  log(message: string, data?: unknown): void {
    this.structuredLogger.info(message, data)
  }

  error(message: string, data?: unknown): void {
    this.structuredLogger.error(message, data)
  }

  setDebugMode(enabled: boolean): void {
    this.debugEnabled = enabled
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
