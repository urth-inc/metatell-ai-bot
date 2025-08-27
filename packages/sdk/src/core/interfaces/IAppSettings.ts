export interface IAppSettings {
  readonly debugMode: boolean
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error'
  readonly livekitUrl?: string
  readonly apiBaseUrl?: string

  // 設定変更の通知
  onDebugModeChanged(callback: (enabled: boolean) => void): void
  setDebugMode(enabled: boolean): void
  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void
}
