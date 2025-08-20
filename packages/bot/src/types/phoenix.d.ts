// Phoenix Framework TypeScript definitions
declare module 'phoenix' {
  export interface SocketOptions {
    params?: Record<string, unknown>
    heartbeatIntervalMs?: number
    reconnectAfterMs?: (tries: number) => number
    timeout?: number
    transport?: typeof WebSocket
    logger?: (kind: string, msg: string, data: unknown) => void
  }

  export class Socket {
    constructor(endPoint: string, opts?: SocketOptions)
    connect(): void
    disconnect(): void
    isConnected(): boolean
    channel<T = unknown>(topic: string, params?: T): Channel
    onOpen(callback: () => void): void
    onError(callback: (error: unknown) => void): void
    onClose(callback: () => void): void
  }

  export class Channel {
    join(): Push
    leave(): void
    on<T = unknown>(event: string, callback: (payload: T) => void): void
    push<T = unknown>(event: string, payload: T): Push
  }

  export class Push {
    receive<T = unknown>(status: string, callback: (response: T) => void): Push
  }

  export interface PresenceMeta {
    profile?: Record<string, unknown>
    context?: Record<string, unknown>
    permissions?: Record<string, boolean>
    roles?: Record<string, boolean>
    phx_ref?: string
    online_at?: string
    [key: string]: unknown
  }

  export interface PresenceInfo {
    metas: PresenceMeta[]
  }

  export class Presence {
    state: Record<string, PresenceInfo>
    constructor(channel: Channel)
    onSync(callback: () => void): void
    onJoin(callback: PresenceOnJoinCallback): void
    onLeave(callback: PresenceOnLeaveCallback): void
    list<T = PresenceInfo>(
      chooser?: (id: string, presence: PresenceInfo) => T,
    ): T extends void ? Record<string, PresenceInfo> : Record<string, T>
  }

  export type PresenceOnJoinCallback = (
    id: string,
    current: PresenceInfo | null,
    newPres: PresenceInfo,
  ) => void
  export type PresenceOnLeaveCallback = (
    id: string,
    current: PresenceInfo | null,
    leftPres: PresenceInfo,
  ) => void
}
