import type { Channel, Socket } from 'phoenix'
import { ServiceIdentifier } from '../ServiceIdentifier.js'
import type { RoomJoinInfo } from '../types/navigation.js'

export interface ConnectionConfig {
  serverUrl: string // WebSocket server URL
  hubId: string
  expectedSceneIdentity?: string
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
  getRoomJoinInfo(): RoomJoinInfo | null
  waitForConnection(timeout?: number): Promise<void>
  on(event: string, callback: (...args: unknown[]) => void): void
}

// Service identifier token for dependency injection
export abstract class ConnectionManager extends ServiceIdentifier<IConnectionManager> {}
