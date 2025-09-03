import { ServiceIdentifier } from '../ServiceIdentifier.js'

export interface Message {
  body: string
  type?: 'chat' | 'system'
  sessionId?: string
  timestamp?: number
}

// NAF message interface
export interface NAFMessage {
  dataType: string
  data: unknown
  from_session_id?: string
}

// Re-export typed NAF messages for convenience
export type {
  NAFCreateMessage,
  NAFMultiUpdateMessage,
  NAFRemoveMessage,
  TypedNAFMessage,
} from '../types/naf.js'

export interface IMessageService {
  sendMessage(message: string): Promise<void>

  // NAF (Networked A-Frame) methods
  // sendNAF: Sends unreliable messages (UDP-like, best-effort delivery)
  // Best for frequent updates like position/rotation where some loss is acceptable
  sendNAF(data: NAFMessage): Promise<void>

  // sendNAFR: Sends reliable messages (TCP-like, guaranteed delivery)
  // Best for critical state changes like spawn/despawn that must arrive
  sendNAFR(data: NAFMessage): Promise<void>

  beginTyping(): Promise<void>
  endTyping(): Promise<void>

  // Event subscription for incoming messages
  // 'message': Text chat messages
  // 'naf': Unreliable NAF messages from other clients
  // 'nafr': Reliable NAF messages from other clients
  on(event: 'message' | 'naf' | 'nafr', handler: (data: unknown) => void): void
  off(event: 'message' | 'naf' | 'nafr', handler: (data: unknown) => void): void
}

// Service identifier token for dependency injection
export abstract class MessageService extends ServiceIdentifier<IMessageService> {}
