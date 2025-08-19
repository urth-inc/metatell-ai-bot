export interface IAppSettings {
  readonly debugMode: boolean
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error'
  
  // 設定変更の通知
  onDebugModeChanged(callback: (enabled: boolean) => void): void
  setDebugMode(enabled: boolean): void
}