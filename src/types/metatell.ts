// Metatell Types and Interfaces

export interface Position {
  x: number
  y: number
  z: number
}

export interface Profile {
  displayName: string
  avatarId?: string
}

export interface MetatellConfig {
  socketUrl: string
  hubId: string
  authToken?: string
  profile: Profile
  debug?: boolean
}

export interface MessagePayload {
  from_session_id: string
  type: string
  body: string
  timestamp?: number
}

export interface JoinResponse {
  session_id: string
  status?: string
}

export interface UserPresence {
  metas: Array<{
    profile: Profile
    phx_ref?: string
    online_at?: string
  }>
  profile: Profile
}

export interface PresenceState {
  [key: string]: UserPresence
}

export interface SpawnObjectPayload {
  model: string
  position?: Position
  rotation?: { x: number; y: number; z: number }
  scale?: { x: number; y: number; z: number }
}

export interface UpdateObjectPayload {
  position?: Position
  rotation?: { x: number; y: number; z: number }
  scale?: { x: number; y: number; z: number }
  [key: string]: unknown
}

export interface PhoenixSocketOptions {
  params?: Record<string, unknown>
  heartbeatIntervalMs?: number
  reconnectAfterMs?: (tries: number) => number
  timeout?: number
  transport?: typeof WebSocket
}

export interface PhoenixChannelParams {
  profile: Profile
  [key: string]: unknown
}

export interface PhoenixMessage {
  join_ref?: string
  ref?: string
  topic: string
  event: string
  payload: unknown
}

export interface PhoenixPushResponse {
  status: string
  response: unknown
}
