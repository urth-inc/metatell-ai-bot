import fs from 'node:fs'
import path from 'node:path'
import type { AgentVoiceAttachment, MetatellClient } from '@metatell/bot-sdk'
import { createMetatellClient, enableVoice } from '@metatell/bot-sdk'
import { WavPlayer } from './wav-player.js'

/**
 * WAVファイルを再生する音声ボット（録音機能付き）
 */
export class WavVoiceBot {
  private client: MetatellClient
  private voice?: AgentVoiceAttachment
  private wavPlayer: WavPlayer
  private isPlaying = false
  private currentAudioStream?: AsyncIterator<Int16Array>
  private frameBuffer: Int16Array[] = []
  private bufferSize = 3 // 3フレーム分のバッファ

  // 録音機能
  private isRecording = false
  private recordingBuffer: Int16Array[] = []
  private recordingStartTime?: number
  private recordingsDir = './recordings'

  // アバター制御
  private isMoving = false
  private moveInterval?: NodeJS.Timeout

  constructor(
    serverUrl: string,
    roomId: string,
    username: string = 'WavPlayerBot',
    token?: string,
  ) {
    this.client = createMetatellClient({ serverUrl, roomId, username, token })
    this.wavPlayer = new WavPlayer()
  }

  async start() {
    console.log('🤖 WAV Voice Bot: Starting...')

    // クライアントを接続
    await this.client.connect()

    // 録音ディレクトリを作成
    if (!fs.existsSync(this.recordingsDir)) {
      fs.mkdirSync(this.recordingsDir, { recursive: true })
    }

    // 音声機能を有効化
    console.log('🔌 Enabling voice with LiveKit transport...')
    this.voice = await enableVoice(this.client, {
      transport: { type: 'livekit' },
      loggerTag: 'WavVoiceBot',
      handlers: {
        // リモート音声を受信して録音
        onRemotePcm: async (pcm, meta) => {
          console.log(`📥 Audio from ${meta.fromIdentity || 'unknown'}`)

          // 録音中の場合はバッファに追加
          if (this.isRecording) {
            this.recordingBuffer.push(new Int16Array(pcm))
          }
        },

        // ローカル音声ストリームを提供（WAVファイルの再生）
        getLocalPcmStream: this.getLocalAudioStream.bind(this),
      },
      // オプション設定
      frameDurationMs: 20,
      sampleRate: 48000,
      autoStartPublish: true,
      enableTopicAutoAdd: true,
    })

    console.log('✅ WAV Voice Bot: Ready!')

    // アバター制御を開始
    await this.startAvatarControl()
  }

  /**
   * WAVファイルを再生
   */
  async playWavFile(filePath: string) {
    try {
      console.log(`🎵 Loading and playing: ${filePath}`)

      // WAVファイルをロード
      await this.wavPlayer.loadWavFile(filePath)

      // 再生開始
      this.isPlaying = true
      this.currentAudioStream = this.wavPlayer.getAudioStream()[Symbol.asyncIterator]()
      this.frameBuffer = []

      // 最初のフレームをバッファに追加
      await this.fillBuffer()

      console.log('▶️ WAV playback started')
    } catch (error) {
      console.error('❌ Failed to play WAV file:', error)
      this.isPlaying = false
    }
  }

  /**
   * ローカル音声ストリーム
   */
  private async *getLocalAudioStream(): AsyncIterable<Int16Array> {
    while (true) {
      if (this.isPlaying && this.frameBuffer.length > 0) {
        // バッファからフレームを取得
        const frame = this.frameBuffer.shift()
        if (frame) {
          yield frame
          // バッファを補充
          this.fillBuffer().catch(() => {})
        }
      } else if (this.isPlaying && this.currentAudioStream) {
        // バッファが空の場合は直接取得を試みる
        const result = await this.currentAudioStream.next()
        if (!result.done) {
          yield result.value
          // バッファを補充
          this.fillBuffer().catch(() => {})
        } else {
          // 再生完了
          console.log('✅ WAV playback finished')
          this.isPlaying = false
          this.currentAudioStream = undefined
        }
      } else {
        // 無音を送信
        yield new Int16Array(960) // 20ms of silence
      }

      // シンプルな20ms待機
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }

  /**
   * バッファを補充
   */
  private async fillBuffer(): Promise<void> {
    if (!this.currentAudioStream || !this.isPlaying) return

    while (this.frameBuffer.length < this.bufferSize) {
      const result = await this.currentAudioStream.next()
      if (!result.done) {
        this.frameBuffer.push(result.value)
      } else {
        break
      }
    }
  }

  /**
   * 再生を停止
   */
  stopPlayback() {
    console.log('⏹️ Stopping playback')
    this.isPlaying = false
    this.currentAudioStream = undefined
    this.frameBuffer = []
    this.wavPlayer.reset()
  }

  /**
   * 再生中かどうかを取得
   */
  getIsPlaying(): boolean {
    return this.isPlaying
  }

  /**
   * 録音を開始
   */
  startRecording() {
    if (this.isRecording) {
      console.log('⚠️ Already recording')
      return
    }

    console.log('🔴 Recording started')
    this.isRecording = true
    this.recordingBuffer = []
    this.recordingStartTime = Date.now()
  }

  /**
   * 録音を停止して保存
   */
  async stopRecording(): Promise<string | null> {
    if (!this.isRecording) {
      console.log('⚠️ Not recording')
      return null
    }

    this.isRecording = false
    const duration = Date.now() - (this.recordingStartTime || Date.now())
    console.log(`⏹️ Recording stopped (duration: ${duration}ms)`)

    if (this.recordingBuffer.length === 0) {
      console.log('⚠️ No audio data recorded')
      return null
    }

    // 録音データをWAVファイルとして保存
    const filename = `recording_${new Date().toISOString().replace(/[:.]/g, '-')}.wav`
    const filepath = path.join(this.recordingsDir, filename)

    await this.saveAsWav(filepath, this.recordingBuffer)
    console.log(`💾 Recording saved: ${filepath}`)

    // バッファをクリア
    this.recordingBuffer = []

    return filepath
  }

  /**
   * PCMデータをWAVファイルとして保存
   */
  private async saveAsWav(filepath: string, audioFrames: Int16Array[]): Promise<void> {
    // 全フレームを結合
    const totalSamples = audioFrames.reduce((sum, frame) => sum + frame.length, 0)
    const pcmData = new Int16Array(totalSamples)
    let offset = 0

    for (const frame of audioFrames) {
      pcmData.set(frame, offset)
      offset += frame.length
    }

    // WAVヘッダーを作成
    const sampleRate = 48000
    const channels = 1
    const bitsPerSample = 16
    const byteRate = sampleRate * channels * (bitsPerSample / 8)
    const blockAlign = channels * (bitsPerSample / 8)
    const dataSize = pcmData.length * 2

    const buffer = Buffer.alloc(44 + dataSize)

    // RIFF header
    buffer.write('RIFF', 0)
    buffer.writeUInt32LE(36 + dataSize, 4)
    buffer.write('WAVE', 8)

    // fmt chunk
    buffer.write('fmt ', 12)
    buffer.writeUInt32LE(16, 16) // fmt chunk size
    buffer.writeUInt16LE(1, 20) // audio format (PCM)
    buffer.writeUInt16LE(channels, 22)
    buffer.writeUInt32LE(sampleRate, 24)
    buffer.writeUInt32LE(byteRate, 28)
    buffer.writeUInt16LE(blockAlign, 32)
    buffer.writeUInt16LE(bitsPerSample, 34)

    // data chunk
    buffer.write('data', 36)
    buffer.writeUInt32LE(dataSize, 40)

    // PCMデータを書き込み
    for (let i = 0; i < pcmData.length; i++) {
      buffer.writeInt16LE(pcmData[i], 44 + i * 2)
    }

    // ファイルに書き込み
    await fs.promises.writeFile(filepath, buffer)
  }

  /**
   * アバター制御を開始
   */
  private async startAvatarControl() {
    // 利用可能なアニメーションを確認
    try {
      const animations = await this.client.avatar.getAvailableAnimations()
      console.log(
        'Available animations:',
        animations.map((a) => `${a.id}: ${a.name}`),
      )
    } catch (error) {
      console.warn('Failed to get animations:', error)
    }

    // アニメーション制御用の関数
    const playAnimation = async (animationId: string) => {
      try {
        await this.client.avatar.play({ id: animationId, loop: true })
      } catch (error) {
        console.warn(`Animation ${animationId} not available:`, error)
      }
    }

    // ユーザーに近づく制御を開始
    this.moveInterval = setInterval(async () => {
      const users = this.client.getUsers()
      const meInfo = await this.client.getInfo()

      // 自分以外のユーザーを探す
      const otherUser = users.find((user) => user.name !== meInfo.name)
      if (!otherUser?.position) {
        // ユーザーがいない場合は待機
        if (this.isMoving) {
          this.isMoving = false
          await playAnimation('idle')
        }
        return
      }

      const currentPosition = this.client.avatar.getPosition()
      if (!currentPosition) return

      // 目標位置を計算（ユーザーから1.5m離れた位置）
      const targetPosition = {
        x: otherUser.position.x + 1.5,
        y: otherUser.position.y,
        z: otherUser.position.z + 1.5,
      }

      // 現在位置と目標位置の距離を計算
      const dx = targetPosition.x - currentPosition.x
      const dy = targetPosition.y - currentPosition.y
      const dz = targetPosition.z - currentPosition.z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

      // 相手の方を向く（常に向きを調整）
      await this.client.avatar.lookAt({
        x: otherUser.position.x,
        y: otherUser.position.y,
        z: otherUser.position.z,
      })

      // 距離に応じて移動とアニメーションを制御
      const move_threshold = 1.0
      const slow_move_threshold = 3.0 // 3m以内はゆっくり移動

      if (distance > move_threshold) {
        // 移動が必要
        if (!this.isMoving) {
          this.isMoving = true
          await playAnimation('walking') // 歩行アニメーション開始
        }

        // 段階的に移動（ゆっくり近づく）
        const moveSpeed = distance < slow_move_threshold ? 0.2 : 1.0 // 近い時は遅く
        const moveRatio = Math.min(moveSpeed, distance) / distance

        const stepPosition = {
          x: currentPosition.x + dx * moveRatio,
          y: currentPosition.y + dy * moveRatio,
          z: currentPosition.z + dz * moveRatio,
        }

        await this.client.avatar.moveTo(stepPosition)
      } else {
        // 十分近い場合は停止
        if (this.isMoving) {
          this.isMoving = false
          await playAnimation('idle') // 待機アニメーション
        }
      }
    }, 200) // 200ms間隔で更新
  }

  /**
   * 切断処理
   */
  async disconnect() {
    console.log('👋 Disconnecting...')

    // アバター制御を停止
    if (this.moveInterval) {
      clearInterval(this.moveInterval)
    }

    // 録音中の場合は保存
    if (this.isRecording) {
      await this.stopRecording()
    }

    if (this.voice) {
      await this.voice.detach()
    }

    await this.client.disconnect()

    console.log('✅ Disconnected')
  }
}
