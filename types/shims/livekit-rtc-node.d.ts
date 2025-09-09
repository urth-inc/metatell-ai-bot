// Minimal stub for @livekit/rtc-node to satisfy TypeDoc during package conversion
declare module '@livekit/rtc-node' {
  export class Room {
    name: string
    remoteParticipants: Map<string, unknown>
    localParticipant: unknown
    connect(url: string, token: string, opts?: unknown): Promise<void>
    disconnect(): Promise<void>
    on(event: unknown, ...args: unknown[]): void
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
