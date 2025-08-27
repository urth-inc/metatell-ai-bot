import { getLogger } from '../../sdk/logging/index.js'
import type { IAppSettings } from '../interfaces/IAppSettings.js'

export class AppSettings implements IAppSettings {
  private _debugMode: boolean
  private _logLevel: 'debug' | 'info' | 'warn' | 'error'
  private debugCallbacks: ((enabled: boolean) => void)[] = []
  private logger = getLogger('AppSettings')
  public readonly livekitUrl?: string
  public readonly apiBaseUrl?: string

  constructor(
    debugMode = false,
    logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info',
    livekitUrl?: string,
    apiBaseUrl?: string,
  ) {
    this._debugMode = debugMode
    this._logLevel = logLevel
    this.livekitUrl = livekitUrl
    this.apiBaseUrl = apiBaseUrl
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
  }
}
