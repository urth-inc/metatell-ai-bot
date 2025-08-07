export interface Message {
  body: string
  type?: 'chat' | 'system'
  sessionId?: string
  timestamp?: number
}

export interface NAFMessage {
  dataType: string
  data: unknown
  from_session_id?: string
}

export interface IMessageService {
  sendMessage(message: string): Promise<void>
  sendNAF(data: NAFMessage): Promise<void>
  sendNAFR(data: NAFMessage): Promise<void>
  beginTyping(): Promise<void>
  endTyping(): Promise<void>
  on(event: 'message' | 'naf' | 'nafr', handler: (data: unknown) => void): void
  off(event: 'message' | 'naf' | 'nafr', handler: (data: unknown) => void): void
}
