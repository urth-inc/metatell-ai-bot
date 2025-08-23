import type { Channel, Socket } from 'phoenix'

export interface ConnectionConfig {
  serverUrl: string // WebSocket server URL
  hubId: string
  retryOptions?: {
    maxRetries?: number
    retryDelay?: number
  }
}

export interface IConnectionManager {
  connect(config: ConnectionConfig): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  getSocket(): Socket | null
  getHubChannel(): Channel | null
  getSessionId(): string | null
  waitForConnection(timeout?: number): Promise<void>
  on(event: string, callback: (...args: unknown[]) => void): void
}
