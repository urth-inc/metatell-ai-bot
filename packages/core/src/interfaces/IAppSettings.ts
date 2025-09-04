import { ServiceIdentifier } from '../ServiceIdentifier.js'

export interface IAppSettings {
  readonly debugMode: boolean
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error'

  // 設定変更の通知
  onDebugModeChanged(callback: (enabled: boolean) => void): void
  setDebugMode(enabled: boolean): void
  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void
}

// Service identifier token for dependency injection
export abstract class AppSettings extends ServiceIdentifier<IAppSettings> {}
