import type { IAppSettings } from '../interfaces/IAppSettings.js'
import { getLogger, getLoggerProvider } from '../logging/index.js'

export class AppSettings implements IAppSettings {
  private _debugMode: boolean
  private _logLevel: 'debug' | 'info' | 'warn' | 'error'
  private debugCallbacks: ((enabled: boolean) => void)[] = []
  private logger = getLogger('AppSettings')

  constructor(debugMode = false, logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    this._debugMode = debugMode
    this._logLevel = logLevel

    // LoggerProviderのログレベルを初期設定
    const provider = getLoggerProvider()
    if (provider?.setMinLevel) {
      provider.setMinLevel(logLevel)
    }
  }

  get debugMode(): boolean {
    return this._debugMode
  }

  get logLevel(): 'debug' | 'info' | 'warn' | 'error' {
    return this._logLevel
  }

  onDebugModeChanged(callback: (enabled: boolean) => void): void {
    this.debugCallbacks.push(callback)
  }

  setDebugMode(enabled: boolean): void {
    if (this._debugMode !== enabled) {
      this._debugMode = enabled

      // 全てのコールバックに通知
      for (const callback of this.debugCallbacks) {
        try {
          callback(enabled)
        } catch (error) {
          this.logger.error('Error in debug mode callback', { error })
        }
      }
    }
  }

  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this._logLevel = level

    // LoggerProviderのログレベルも更新
    const provider = getLoggerProvider()
    if (provider?.setMinLevel) {
      provider.setMinLevel(level)
    }
  }
}
