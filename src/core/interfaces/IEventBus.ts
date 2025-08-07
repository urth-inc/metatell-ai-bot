export type EventHandler<T = unknown> = (data: T) => void | Promise<void>

export interface IEventBus {
  on<T = unknown>(event: string, handler: EventHandler<T>): void
  off<T = unknown>(event: string, handler: EventHandler<T>): void
  emit<T = unknown>(event: string, data?: T): void
  once<T = unknown>(event: string, handler: EventHandler<T>): void
  removeAllListeners(event?: string): void
}

export enum SystemEvents {
  // Connection events
  CONNECTION_ESTABLISHED = 'connection:established',
  CONNECTION_LOST = 'connection:lost',
  CONNECTION_ERROR = 'connection:error',
  
  // Room events
  ROOM_JOINED = 'room:joined',
  ROOM_LEFT = 'room:left',
  USER_JOINED = 'user:joined',
  USER_LEFT = 'user:left',
  
  // Message events
  MESSAGE_RECEIVED = 'message:received',
  MESSAGE_SENT = 'message:sent',
  
  // Avatar events
  AVATAR_SPAWNED = 'avatar:spawned',
  AVATAR_MOVED = 'avatar:moved',
  AVATAR_UPDATED = 'avatar:updated',
  
  // NAF events
  NAF_RECEIVED = 'naf:received',
  NAFR_RECEIVED = 'nafr:received',
}