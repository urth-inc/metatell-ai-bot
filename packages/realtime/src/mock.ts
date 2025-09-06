import { ErrorCodes, RealtimeError } from './errors.js'
import type {
  ConnectionState,
  RealtimeEvent,
  RealtimeOptions,
  RealtimeTransport,
} from './transport.js'

export class MockAdapter implements RealtimeTransport {
  state: ConnectionState = 'idle'
  private listeners = new Set<(e: RealtimeEvent) => void>()
  private options?: RealtimeOptions
  private activeTopics: Set<string>
  private audioFrameCount = 0
  private audioStarted = false
  private audioReceiveInterval?: ReturnType<typeof setInterval>

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
      throw new RealtimeError(ErrorCodes.ALREADY_CONNECTING, ErrorCodes.ALREADY_CONNECTING)
    }

    this.options = opts
    this.activeTopics = new Set(opts.topics || ['control', 'events', 'transcript', 'audio'])
    this.setState('connecting')

    // 接続をシミュレート（30-50ms後に接続完了）
    await new Promise((resolve) => {
      setTimeout(resolve, 30 + Math.random() * 20)
    })

    this.setState('connected')
    this.options?.logger?.('info', 'Mock connected successfully')

    // 参加者のシミュレート
    setTimeout(() => {
      this.emit({
        type: 'participant-joined',
        identity: 'mock-participant',
        sid: 'mock-sid-123',
      })

      // 音声受信のシミュレートを開始
      this.startMockAudioReceive()
    }, 100)
  }

  async disconnect(): Promise<void> {
    if (this.audioReceiveInterval) {
      clearInterval(this.audioReceiveInterval)
      this.audioReceiveInterval = undefined
    }
    this.setState('disconnected')
    this.audioFrameCount = 0
    this.audioStarted = false
  }

  async send(topic: string, data: Uint8Array | string): Promise<void> {
    if (this.state !== 'connected') {
      throw new RealtimeError(ErrorCodes.NOT_CONNECTED, ErrorCodes.NOT_CONNECTED)
    }

    if (!this.activeTopics.has(topic)) {
      throw new RealtimeError(ErrorCodes.UNKNOWN_TOPIC, ErrorCodes.UNKNOWN_TOPIC)
    }

    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data

    // エコーバックをシミュレート（10ms後）
    setTimeout(() => {
      this.emit({
        type: 'data',
        topic,
        payload: bytes,
        from: 'mock-echo',
      })
    }, 10)

    this.options?.logger?.('debug', `Mock sent data to topic: ${topic}`, {
      size: bytes.length,
    })
  }

  async startAudioPublisher(): Promise<void> {
    if (this.state !== 'connected') {
      throw new RealtimeError(ErrorCodes.NOT_CONNECTED, ErrorCodes.NOT_CONNECTED)
    }

    this.audioStarted = true
    this.audioFrameCount = 0
    this.options?.logger?.('info', 'Mock audio publisher started')
  }

  async pushPcmFrame(frame: Int16Array): Promise<void> {
    if (!this.audioStarted) {
      throw new RealtimeError(ErrorCodes.AUDIO_NOT_STARTED, ErrorCodes.AUDIO_NOT_STARTED)
    }

    this.audioFrameCount++

    // 100フレームごとにログ
    if (this.audioFrameCount % 100 === 0) {
      this.options?.logger?.('debug', `Mock audio frames pushed: ${this.audioFrameCount}`, {
        frameSize: frame.length,
      })
    }
  }

  async stopAudioPublisher(): Promise<void> {
    this.options?.logger?.('info', 'Mock audio publisher stopped', {
      totalFrames: this.audioFrameCount,
    })
    this.audioStarted = false
    this.audioFrameCount = 0
  }

  private startMockAudioReceive(): void {
    // 20msごとにモック音声フレームを生成
    this.audioReceiveInterval = setInterval(() => {
      if (this.state === 'connected' && this.activeTopics.has('audio')) {
        // モックPCMデータを生成（48kHz, 1ch, 20ms = 960サンプル）
        const pcmData = new Int16Array(960)
        for (let i = 0; i < pcmData.length; i++) {
          // 無音（小さいランダムノイズ）
          pcmData[i] = Math.floor((Math.random() - 0.5) * 100)
        }

        const uint8Data = new Uint8Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength)

        this.emit({
          type: 'data',
          topic: 'audio',
          payload: uint8Data,
          from: 'mock-participant',
        })
      }
    }, 20)
  }

  async setMicEnabled(enabled: boolean): Promise<void> {
    // PoCではno-op実装
    this.options?.logger?.('debug', `Mock: Mic ${enabled ? 'enabled' : 'disabled'}`)
  }

  async setSpeakerEnabled(enabled: boolean): Promise<void> {
    // PoCではno-op実装
    this.options?.logger?.('debug', `Mock: Speaker ${enabled ? 'enabled' : 'disabled'}`)
  }
}
