/**
 * Logging SPI (Service Provider Interface) for SDK
 * Allows applications to plug in their own logging implementations
 */

import { DefaultLoggerProvider } from './providers/default.js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEvent {
  ts: number
  level: LogLevel
  module: string
  message: string
  attributes?: unknown
}

export interface Logger {
  debug(msg: string, attributes?: unknown): void
  info(msg: string, attributes?: unknown): void
  warn(msg: string, attributes?: unknown): void
  error(msg: string, attributes?: unknown): void
}

export interface LogSink {
  write(event: LogEvent): void
}

export interface LoggerProvider {
  getLogger(module: string): Logger
  addSink?(sink: LogSink): undefined | (() => void)
  setMinLevel?(level: LogLevel): void
  enableConsole?(debug?: boolean): void
}

// Global provider registry
let _provider: LoggerProvider | null = null

export interface RegisterOptions {
  allowOverwrite?: boolean
}

export function registerLoggerProvider(provider: LoggerProvider, options?: RegisterOptions): void {
  if (_provider && !options?.allowOverwrite) {
    throw new Error(
      'LoggerProvider is already registered. Use { allowOverwrite: true } to replace.',
    )
  }
  _provider = provider
}

export function resetLoggerProvider(): void {
  _provider = null
}

export function getLogger(module: string): Logger {
  if (!_provider) {
    // 自動的にデフォルトプロバイダーを登録
    registerLoggerProvider(new DefaultLoggerProvider())
  }
  if (!_provider) {
    throw new Error('LoggerProvider registration failed')
  }
  return _provider.getLogger(module)
}

export function getLoggerProvider(): LoggerProvider | null {
  return _provider
}
