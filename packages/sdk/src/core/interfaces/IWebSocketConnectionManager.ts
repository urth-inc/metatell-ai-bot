export interface WebSocketState {
  connected: boolean
  url?: string
  readyState: number
}

export interface IWebSocketConnectionManager {
  connect(url: string, token: string): Promise<void>
  disconnect(): void
  isConnected(): boolean
  getState(): WebSocketState
  on(event: string, handler: (...args: unknown[]) => void): void
  off(event: string, handler: (...args: unknown[]) => void): void
}
