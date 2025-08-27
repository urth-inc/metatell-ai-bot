import {
  createLocalAudioTrack,
  type DisconnectReason,
  type LocalTrackPublication,
  type RemoteTrack,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client'
import { getLogger } from '../../sdk/logging/index.js'
import type { IAppSettings } from '../interfaces/IAppSettings.js'
import type { IConnectionManager } from '../interfaces/IConnectionManager.js'
import type { IEventBus } from '../interfaces/IEventBus.js'

/**
 * LiveKit service events
 */
export enum LiveKitEvents {
  /** Emitted when connected to LiveKit room */
  CONNECTED = 'livekit:connected',
  /** Emitted when disconnected from LiveKit room */
  DISCONNECTED = 'livekit:disconnected',
  /** Emitted when a participant's audio track is subscribed */
  AUDIO_TRACK_SUBSCRIBED = 'livekit:audio_track_subscribed',
  /** Emitted when a participant's audio track is unsubscribed */
  AUDIO_TRACK_UNSUBSCRIBED = 'livekit:audio_track_unsubscribed',
  /** Emitted when local microphone is published */
  MICROPHONE_PUBLISHED = 'livekit:microphone_published',
  /** Emitted when local microphone is unpublished */
  MICROPHONE_UNPUBLISHED = 'livekit:microphone_unpublished',
  /** Emitted when connection fails */
  CONNECTION_ERROR = 'livekit:connection_error',
}

/**
 * LiveKit audio configuration
 */
export interface LiveKitAudioConfig {
  /** Enable adaptive streaming */
  adaptiveStream?: boolean
  /** Enable dynacast */
  dynacast?: boolean
  /** Enable echo cancellation */
  echoCancellation?: boolean
  /** Enable noise suppression */
  noiseSuppression?: boolean
  /** Enable auto gain control */
  autoGainControl?: boolean
}

/**
 * Interface for LiveKit service
 */
export interface ILiveKitService {
  /** Initialize the LiveKit service */
  initialize(roomId: string): void
  /** Connect to LiveKit room */
  connect(): Promise<void>
  /** Disconnect from LiveKit room */
  disconnect(): Promise<void>
  /** Check if connected */
  isConnected(): boolean
  /** Publish local microphone */
  publishMicrophone(): Promise<LocalTrackPublication | undefined>
  /** Unpublish local microphone */
  unpublishMicrophone(): Promise<void>
  /** Set microphone enabled state */
  setMicrophoneEnabled(enabled: boolean): Promise<void>
  /** Get current microphone publication */
  getMicrophonePublication(): LocalTrackPublication | undefined
  /** Set speaker volume (0-1) */
  setSpeakerVolume(volume: number): void
  /** Get current speaker volume */
  getSpeakerVolume(): number
  /** Get LiveKit token */
  getLiveKitToken(channelName: string, identity: string): Promise<string>
}

/**
 * LiveKit service implementation for voice communication
 */
export class LiveKitService implements ILiveKitService {
  private room: Room | null = null
  private microphonePublication: LocalTrackPublication | undefined
  private audioElements: Map<string, HTMLAudioElement> = new Map()
  private roomId: string | null = null
  private logger = getLogger('LiveKitService')
  private speakerVolume = 1

  constructor(
    private eventBus: IEventBus,
    private connectionManager: IConnectionManager,
    private appSettings: IAppSettings,
    private config: LiveKitAudioConfig = {},
  ) {}

  initialize(roomId: string): void {
    this.roomId = roomId

    // デフォルト設定
    const defaultConfig: LiveKitAudioConfig = {
      adaptiveStream: true,
      dynacast: true,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }

    this.config = { ...defaultConfig, ...this.config }

    // LiveKit Roomインスタンスを作成
    this.room = new Room({
      adaptiveStream: this.config.adaptiveStream,
      dynacast: this.config.dynacast,
    })

    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    if (!this.room) return

    // 接続イベント
    this.room.on(RoomEvent.Connected, () => {
      this.logger.info('Connected to LiveKit room')
      this.eventBus.emit(LiveKitEvents.CONNECTED)
    })

    // 切断イベント
    this.room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      this.logger.info('Disconnected from LiveKit room', { reason })
      this.eventBus.emit(LiveKitEvents.DISCONNECTED, { reason: reason?.toString() })
    })

    // リモートトラックの購読
    this.room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, _publication: RemoteTrackPublication) => {
        if (track.kind === Track.Kind.Audio) {
          this.handleAudioTrackSubscribed(track)
        }
      },
    )

    // リモートトラックの購読解除
    this.room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        this.handleAudioTrackUnsubscribed(track)
      }
    })
  }

  private handleAudioTrackSubscribed(track: RemoteTrack): void {
    const audioElement = track.attach() as HTMLAudioElement
    const trackSid = track.sid || 'unknown'
    this.audioElements.set(trackSid, audioElement)

    // スピーカー音量を適用
    if ('volume' in audioElement) {
      audioElement.volume = this.speakerVolume
    }

    // 自動再生
    if ('play' in audioElement && typeof audioElement.play === 'function') {
      audioElement.play().catch((error: Error) => {
        this.logger.error('Error playing audio track:', error)
      })
    }

    this.eventBus.emit(LiveKitEvents.AUDIO_TRACK_SUBSCRIBED, { trackSid: trackSid })
  }

  private handleAudioTrackUnsubscribed(track: RemoteTrack): void {
    const trackSid = track.sid || 'unknown'
    const audioElement = this.audioElements.get(trackSid)
    if (audioElement) {
      track.detach(audioElement)
      this.audioElements.delete(trackSid)
    }

    this.eventBus.emit(LiveKitEvents.AUDIO_TRACK_UNSUBSCRIBED, { trackSid: trackSid })
  }

  async connect(): Promise<void> {
    if (!this.room || !this.roomId) {
      throw new Error('LiveKit service not initialized')
    }

    const sessionId = this.connectionManager.getSessionId()
    if (!sessionId) {
      throw new Error('Session ID not available')
    }

    try {
      // LiveKitトークンを取得
      const channelName = `microphone:${this.roomId}`
      const token = await this.getLiveKitToken(channelName, sessionId)

      // LiveKit URLを取得
      const livekitUrl = this.appSettings.livekitUrl
      if (!livekitUrl) {
        throw new Error('LiveKit URL not configured')
      }

      // 接続準備
      this.room.prepareConnection(livekitUrl, token)

      // 音声のアンロック（ブラウザの自動再生ポリシー対応）
      const win = (globalThis as unknown as { window?: Window }).window
      if (typeof win !== 'undefined' && win.document) {
        const unlockAudio = () => {
          this.room?.startAudio()
        }
        win.document.addEventListener('click', unlockAudio, { once: true })
      }

      // 接続
      await this.room.connect(livekitUrl, token)

      this.logger.info('Successfully connected to LiveKit room')
    } catch (error) {
      this.logger.error('Failed to connect to LiveKit room:', error)
      this.eventBus.emit(LiveKitEvents.CONNECTION_ERROR, error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (this.room) {
      // マイクの公開を停止
      await this.unpublishMicrophone()

      // 全ての音声要素をクリーンアップ
      this.audioElements.forEach((element) => {
        if ('pause' in element && typeof element.pause === 'function') {
          element.pause()
        }
        if ('remove' in element && typeof element.remove === 'function') {
          element.remove()
        }
      })
      this.audioElements.clear()

      // 切断
      await this.room.disconnect()
      this.room = null
    }
  }

  isConnected(): boolean {
    return this.room?.state === 'connected'
  }

  async publishMicrophone(): Promise<LocalTrackPublication | undefined> {
    if (!this.room || !this.isConnected()) {
      throw new Error('Not connected to LiveKit room')
    }

    try {
      // マイクのトラックを作成
      const microphoneTrack = await createLocalAudioTrack({
        echoCancellation: this.config.echoCancellation,
        noiseSuppression: this.config.noiseSuppression,
        autoGainControl: this.config.autoGainControl,
      })

      // トラックを公開
      this.microphonePublication = await this.room.localParticipant.publishTrack(microphoneTrack)

      this.logger.info('Microphone published successfully')
      this.eventBus.emit(LiveKitEvents.MICROPHONE_PUBLISHED)

      return this.microphonePublication
    } catch (error) {
      this.logger.error('Failed to publish microphone:', error)
      throw error
    }
  }

  async unpublishMicrophone(): Promise<void> {
    if (this.microphonePublication) {
      try {
        await this.room?.localParticipant.unpublishTrack(this.microphonePublication.track)
        this.microphonePublication = undefined

        this.logger.info('Microphone unpublished successfully')
        this.eventBus.emit(LiveKitEvents.MICROPHONE_UNPUBLISHED)
      } catch (error) {
        this.logger.error('Failed to unpublish microphone:', error)
        throw error
      }
    }
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    if (this.microphonePublication?.track) {
      // LocalAudioTrackとして扱う
      const track = this.microphonePublication.track
      if (track && typeof track === 'object' && 'setEnabled' in track) {
        ;(track as unknown as { setEnabled: (enabled: boolean) => void }).setEnabled(enabled)
        this.logger.debug(`Microphone ${enabled ? 'enabled' : 'disabled'}`)
      }
    }
  }

  getMicrophonePublication(): LocalTrackPublication | undefined {
    return this.microphonePublication
  }

  setSpeakerVolume(volume: number): void {
    // 0-1の範囲にクリップ
    this.speakerVolume = Math.max(0, Math.min(1, volume))

    // 全ての音声要素に適用
    this.audioElements.forEach((element) => {
      if ('volume' in element) {
        element.volume = this.speakerVolume
      }
    })
  }

  getSpeakerVolume(): number {
    return this.speakerVolume
  }

  async getLiveKitToken(channelName: string, identity: string): Promise<string> {
    // APIサーバーのベースURLを取得
    const win = (globalThis as unknown as { window?: { location?: Location } }).window
    const apiBaseUrl =
      this.appSettings.apiBaseUrl ||
      (typeof win !== 'undefined' && win.location ? win.location.origin : '')

    if (!apiBaseUrl) {
      throw new Error('API base URL not configured')
    }

    const response = await fetch(`${apiBaseUrl}/livekit/api/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roomName: channelName,
        identity,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to get LiveKit token')
    }

    const data = (await response.json()) as { token?: string }
    if (!data.token) {
      throw new Error('LiveKit token not found in response')
    }

    return data.token
  }
}
