import type { IAppSettings } from '../interfaces/IAppSettings.js'

export class AppSettings implements IAppSettings {
  private _debugMode: boolean
  private _logLevel: 'debug' | 'info' | 'warn' | 'error'
  private debugCallbacks: ((enabled: boolean) => void)[] = []

  constructor(debugMode = false, logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    this._debugMode = debugMode
    this._logLevel = logLevel
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
          console.error('Error in debug mode callback:', error)
        }
      }
    }
  }

  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this._logLevel = level
  }
}