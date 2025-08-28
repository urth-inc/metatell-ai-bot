import {
  AudioFrame,
  AudioSource,
  AudioStream,
  LocalAudioTrack,
  type Participant,
  type RemoteTrack,
  Room,
  RoomEvent,
  TrackKind,
  TrackPublishOptions,
} from '@livekit/rtc-node'
import { ErrorCodes, RealtimeError } from './errors.js'
import type {
  ConnectionState,
  RealtimeEvent,
  RealtimeOptions,
  RealtimeTransport,
} from './transport.js'

export class LiveKitAdapter implements RealtimeTransport {
  state: ConnectionState = 'idle'
  private room?: Room
  private audio?: { source: AudioSource; track: LocalAudioTrack; trackSid?: string }
  private audioStreams = new Map<string, AudioStream>() // participantSid -> AudioStream
  private listeners = new Set<(e: RealtimeEvent) => void>()
  private options?: RealtimeOptions
  private activeTopics: Set<string>

  constructor() {
    this.activeTopics = new Set(['control', 'events', 'transcript', 'audio'])
  }

  on(listener: (e: RealtimeEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: RealtimeEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        this.options?.logger?.('error', 'Error in event listener', { error, event })
      }
    })
  }

  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state
      this.emit({ type: 'state', state })
    }
  }

  async connect(opts: RealtimeOptions): Promise<void> {
    if (this.state === 'connecting' || this.state === 'connected') {
      throw new RealtimeError(ErrorCodes.ALREADY_CONNECTING, 'Already connecting or connected')
    }

    this.options = opts
    this.activeTopics = new Set(opts.topics || ['control', 'events', 'transcript', 'audio'])
    this.setState('connecting')

    try {
      // Create a new room instance
      this.room = new Room()

      // Setup event handlers
      this.setupEventHandlers()

      // Get token from provider
      const token = await opts.tokenProvider()

      // Connect to the room
      await this.room.connect(opts.url, token, {
        autoSubscribe: opts.connect?.autoSubscribe ?? true,
        dynacast: opts.connect?.dynacast ?? true,
      })

      this.setState('connected')
      this.options?.logger?.('info', 'Successfully connected to LiveKit room', {
        roomName: this.room.name,
        participantCount: this.room.remoteParticipants.size,
      })
    } catch (error) {
      this.setState('disconnected')
      this.emit({
        type: 'error',
        code: ErrorCodes.CONNECTION_FAILED,
        message: 'Failed to connect to LiveKit',
        cause: error,
      })
      throw new RealtimeError(ErrorCodes.CONNECTION_FAILED, 'Failed to connect to LiveKit', error)
    }
  }

  private setupEventHandlers(): void {
    if (!this.room) return

    // Participant events
    this.room.on(RoomEvent.ParticipantConnected, (participant: Participant) => {
      this.emit({
        type: 'participant-joined',
        identity: participant.identity || '',
        sid: participant.sid || '',
      })
    })

    this.room.on(RoomEvent.ParticipantDisconnected, (participant: Participant) => {
      this.emit({
        type: 'participant-left',
        identity: participant.identity || '',
        sid: participant.sid || '',
      })
    })

    // Data events
    this.room.on(
      RoomEvent.DataReceived,
      (payload: Uint8Array, participant?: Participant, _?: unknown, topic?: string) => {
        if (topic && this.activeTopics.has(topic)) {
          this.emit({
            type: 'data',
            topic,
            payload,
            from: participant?.identity,
          })
        }
      },
    )

    // Track events
    this.room.on(
      RoomEvent.TrackSubscribed,
      async (track: RemoteTrack, _publication: unknown, participant: Participant) => {
        if (track.kind === TrackKind.KIND_AUDIO) {
          try {
            // 音声ストリームを作成
            const audioStream = new AudioStream(track, {
              sampleRate: 48000,
              numChannels: 1,
            })
            this.audioStreams.set(participant.sid || '', audioStream)

            // 音声フレームを読み取る
            this.readAudioFrames(audioStream, participant)

            this.options?.logger?.('info', 'Audio track subscribed', {
              participantId: participant.identity,
              participantSid: participant.sid,
              trackSid: track.sid,
            })
          } catch (error) {
            this.options?.logger?.('error', 'Failed to create audio stream', {
              error,
              participantId: participant.identity,
              trackSid: track.sid,
            })
          }
        }
      },
    )

    this.room.on(
      RoomEvent.TrackUnsubscribed,
      (track: RemoteTrack, _publication: unknown, participant: Participant) => {
        if (track.kind === TrackKind.KIND_AUDIO && participant.sid) {
          const audioStream = this.audioStreams.get(participant.sid)
          if (audioStream) {
            // ストリームをクリーンアップ
            this.audioStreams.delete(participant.sid)
            this.options?.logger?.('info', 'Audio track unsubscribed', {
              participantId: participant.identity,
              participantSid: participant.sid,
              trackSid: track.sid,
            })
          }
        }
      },
    )

    // Connection events
    this.room.on(RoomEvent.Reconnecting, () => {
      this.setState('reconnecting')
    })

    this.room.on(RoomEvent.Reconnected, () => {
      this.setState('connected')
    })

    this.room.on(RoomEvent.Disconnected, () => {
      this.setState('disconnected')
    })
  }

  async disconnect(): Promise<void> {
    // クリーンアップ
    this.audioStreams.clear()

    if (this.room) {
      await this.room.disconnect()
      this.room = undefined
    }
    this.setState('disconnected')
  }

  async send(topic: string, data: Uint8Array | string): Promise<void> {
    if (!this.room || this.state !== 'connected') {
      throw new RealtimeError(ErrorCodes.NOT_CONNECTED, 'Not connected to LiveKit room')
    }

    if (!this.activeTopics.has(topic)) {
      throw new RealtimeError(ErrorCodes.UNKNOWN_TOPIC, `Unknown topic: ${topic}`)
    }

    try {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data

      if (!this.room?.localParticipant) {
        throw new RealtimeError(ErrorCodes.NOT_CONNECTED, 'Room or local participant not available')
      }

      await this.room.localParticipant.publishData(bytes, {
        reliable: true,
        topic,
      })
    } catch (error) {
      throw new RealtimeError(ErrorCodes.SEND_FAILED, 'Failed to send data', error)
    }
  }

  async startAudioPublisher(): Promise<void> {
    if (!this.room || this.state !== 'connected') {
      throw new RealtimeError(ErrorCodes.NOT_CONNECTED, 'Not connected to LiveKit room')
    }

    const config = this.options?.audioPublish || {
      sampleRate: 48000,
      channels: 1,
      frameDurationMs: 20,
    }

    // Create AudioSource and track
    const source = new AudioSource(config.sampleRate, config.channels)

    const track = LocalAudioTrack.createAudioTrack(config.trackName || 'agent-audio', source)

    // Publish the track
    if (!this.room?.localParticipant) {
      throw new RealtimeError(ErrorCodes.NOT_CONNECTED, 'Room or local participant not available')
    }

    const publication = await this.room.localParticipant.publishTrack(
      track,
      new TrackPublishOptions(),
    )

    this.audio = { source, track, trackSid: publication.sid }

    this.options?.logger?.('info', 'Audio publisher started', {
      sampleRate: config.sampleRate,
      channels: config.channels,
      trackName: config.trackName || 'agent-audio',
    })
  }

  async pushPcmFrame(frame: Int16Array): Promise<void> {
    if (!this.audio) {
      throw new RealtimeError(ErrorCodes.AUDIO_NOT_STARTED, 'Audio publisher not started')
    }

    const config = this.options?.audioPublish || {
      sampleRate: 48000,
      channels: 1,
      frameDurationMs: 20,
    }

    // 1フレームあたりのサンプル数を計算
    const samplesPerChannel = (config.sampleRate * (config.frameDurationMs || 20)) / 1000

    // フレームサイズの検証
    const expectedLength = samplesPerChannel * config.channels
    if (frame.length !== expectedLength) {
      this.options?.logger?.('warn', 'PCM frame size mismatch', {
        expected: expectedLength,
        actual: frame.length,
        samplesPerChannel,
        channels: config.channels,
      })
    }

    // Create AudioFrame and capture it
    const int16Buffer = Int16Array.from(frame)
    const audioFrame = new AudioFrame(
      int16Buffer,
      config.sampleRate,
      config.channels,
      samplesPerChannel,
    )

    await this.audio.source.captureFrame(audioFrame)
  }

  async stopAudioPublisher(): Promise<void> {
    if (!this.audio) return

    // Unpublish and close track
    if (this.audio.trackSid && this.room?.localParticipant) {
      await this.room.localParticipant.unpublishTrack(this.audio.trackSid)
    }

    await this.audio.track.close()
    this.audio = undefined

    this.options?.logger?.('info', 'Audio publisher stopped')
  }

  async setMicEnabled(enabled: boolean): Promise<void> {
    // PoCではno-op実装
    this.options?.logger?.('debug', `Mic ${enabled ? 'enabled' : 'disabled'} (no-op in PoC)`)
  }

  async setSpeakerEnabled(enabled: boolean): Promise<void> {
    // PoCではno-op実装
    this.options?.logger?.('debug', `Speaker ${enabled ? 'enabled' : 'disabled'} (no-op in PoC)`)
  }

  private async readAudioFrames(audioStream: AudioStream, participant: Participant): Promise<void> {
    try {
      const reader = audioStream.getReader()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // AudioFrameをPCMデータに変換
        if (value?.data) {
          // Int16ArrayとしてPCMデータを送信
          const pcmData = new Int16Array(
            value.data.buffer,
            value.data.byteOffset,
            value.data.byteLength / 2,
          )

          this.emit({
            type: 'data',
            topic: 'audio',
            payload: new Uint8Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength),
            from: participant.identity,
          })
        }
      }
    } catch (error) {
      this.options?.logger?.('error', 'Error reading audio frames', {
        error,
        participantId: participant.identity,
      })
    }
  }
}
