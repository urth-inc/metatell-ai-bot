// Connection state
export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

// Options
export type TokenProvider = () => Promise<string>

export interface RealtimeOptions {
  /** wss://<livekit-host> */
  url: string
  /** AccessToken 取得（期限切れ時も再呼び出し） */
  tokenProvider: TokenProvider

  /** 接続オプション（必要最低限） */
  connect?: {
    autoSubscribe?: boolean // default: true
    dynacast?: boolean // default: true
  }

  /** 使用する論理チャネル（topic）。未宣言topicの送信はエラーにする */
  topics?: string[] // default: ['control','events','transcript']

  /** 音声Publish（サーバー発話） */
  audioPublish?: {
    sampleRate: 48000 | 24000 | 16000 // PCM16
    channels: 1 | 2
    frameDurationMs?: 10 | 20 // default: 20
    trackName?: string // default: 'agent-audio'
  }

  /** タイムアウト（最低限のみ） */
  timeouts?: {
    connectMs?: number // default: 10000
  }

  /** 速度優先の軽量ロガー */
  logger?: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: unknown) => void
}

// Events
export type RealtimeEvent =
  | { type: 'state'; state: ConnectionState }
  | { type: 'data'; topic: string; payload: Uint8Array; from?: string }
  | { type: 'participant-joined'; identity: string; sid: string }
  | { type: 'participant-left'; identity: string; sid: string }
  | { type: 'warning'; code: string; message: string }
  | { type: 'error'; code: string; message: string; cause?: unknown }

// Interface
export interface RealtimeTransport {
  readonly state: ConnectionState
  on(listener: (e: RealtimeEvent) => void): () => void

  connect(opts: RealtimeOptions): Promise<void>
  disconnect(): Promise<void>

  /** データ送信（PoCはreliable/ordered固定。低遅延設定は後日でOK） */
  send(topic: string, data: Uint8Array | string): Promise<void>

  /** サーバー発話（TTS等から渣されたPCM16を配信） */
  startAudioPublisher(): Promise<void>
  pushPcmFrame(frame: Int16Array): Promise<void>
  stopAudioPublisher(): Promise<void>

  /** 音声制御（PoCではno-opでもOK） */
  setMicEnabled?(enabled: boolean): Promise<void>
  setSpeakerEnabled?(enabled: boolean): Promise<void>
}
