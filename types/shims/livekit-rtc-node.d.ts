// Minimal stub for @livekit/rtc-node to satisfy TypeDoc during package conversion
declare module '@livekit/rtc-node' {
  export interface RoomOptions {
    autoSubscribe?: boolean
    dynacast?: boolean
    rtcConfig?: RtcConfiguration
  }

  export interface RtcConfiguration {
    iceTransportType?: IceTransportType
    continualGatheringPolicy?: unknown
    iceServers?: unknown[]
  }

  export enum IceTransportType {
    TRANSPORT_ALL = 0,
    TRANSPORT_RELAY = 1,
  }

  export class Room {
    name: string
    remoteParticipants: Map<string, unknown>
    localParticipant: unknown
    connect(url: string, token: string, opts?: RoomOptions): Promise<void>
    disconnect(): Promise<void>
    on(event: unknown, ...args: unknown[]): void
    once(event: unknown, ...args: unknown[]): void
  }

  export interface Participant {
    identity?: string
    sid?: string
  }

  export class RemoteTrack {
    kind: unknown
    sid?: string
  }

  export class AudioFrame {
    constructor(buffer: Int16Array, sampleRate: number, channels: number, samplesPerChannel: number)
    data: Int16Array
  }

  export class AudioSource {
    constructor(sampleRate: number, channels: number)
    captureFrame(frame: AudioFrame): Promise<void>
  }

  export class LocalAudioTrack {
    static createAudioTrack(name: string, source: AudioSource): LocalAudioTrack
    close(): Promise<void>
  }

  export class AudioStream {
    constructor(track: RemoteTrack, opts?: unknown)
    getReader(): unknown
  }

  export const TrackKind: { KIND_AUDIO: unknown }
  export class TrackPublishOptions {}

  export const RoomEvent: {
    Connected: unknown
    ParticipantConnected: unknown
    ParticipantDisconnected: unknown
    DataReceived: unknown
    TrackSubscribed: unknown
    TrackUnsubscribed: unknown
    Reconnecting: unknown
    Reconnected: unknown
    Disconnected: unknown
  }
}
