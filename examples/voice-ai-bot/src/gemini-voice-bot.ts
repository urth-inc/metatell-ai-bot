import fs from 'node:fs'
import type { MetatellClient } from '@metatell/bot-sdk'
import { createMetatellClient, enableVoice } from '@metatell/bot-sdk'
import { GeminiVoiceClient } from './gemini-voice-client.js'

/**
 * Gemini音声対話ボット
 */
export class GeminiVoiceBot {
  private client: MetatellClient
  private geminiClient: GeminiVoiceClient

  // デバッグ用録音ディレクトリ
  private recordingsDir = './recordings'

  // 音声再生関連
  private playbackQueue: Int16Array[] = []
  private isPlaying = false

  // アバター制御
  private isMoving = false
  private moveInterval?: NodeJS.Timeout

  // 無音検出用
  private silenceFrames = 0
  private readonly silenceThreshold = 50 // 50フレーム = 1秒の無音

  constructor(
    serverUrl: string,
    roomId: string,
    username: string = 'GeminiVoiceAI',
    geminiApiKey: string,
  ) {
    this.client = createMetatellClient({ serverUrl, roomId, username })
    this.geminiClient = new GeminiVoiceClient(geminiApiKey)
  }

  async start() {
    console.log('🤖 Gemini Voice Bot: 起動中...')

    // クライアントを接続
    await this.client.connect()

    // 録音ディレクトリを作成
    if (!fs.existsSync(this.recordingsDir)) {
      fs.mkdirSync(this.recordingsDir, { recursive: true })
    }

    // Geminiクライアントの接続
    try {
      await this.geminiClient.connect()
      console.log('✅ Gemini音声対話準備完了')

      // リアルタイム音声応答のコールバックを設定
      this.geminiClient.setAudioResponseCallback(async (wavBuffer) => {
        // デバッグ用: レスポンスを保存
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const responsePath = `${this.recordingsDir}/gemini_realtime_${timestamp}.wav`
        fs.writeFileSync(responsePath, wavBuffer)

        // 即座に再生
        await this.playGeminiResponse(wavBuffer)
      })

      // ストリーミングモードを開始
      this.geminiClient.streamInit('audio/pcm;rate=48000')
    } catch (error) {
      console.error('❌ Gemini接続エラー:', error)
      throw error
    }

    // 音声機能を有効化
    console.log('🔌 音声機能を有効化中...')
    await enableVoice(this.client, {
      transport: { type: 'livekit' },
      loggerTag: 'GeminiVoiceBot',
      handlers: {
        // リモート音声を受信（常時ストリーミング）
        onRemotePcm: async (pcm, _meta) => {
          const frame = new Int16Array(pcm)

          // 無音検出（簡易的な振幅チェック）
          const amplitude = Math.max(...frame.map(Math.abs))
          const isSilent = amplitude < 500 // しきい値は調整可能

          if (isSilent) {
            this.silenceFrames++
            // 1秒以上の無音でストリーミング区切り
            if (this.silenceFrames >= this.silenceThreshold) {
              this.geminiClient.streamEnd()
              this.silenceFrames = 0
            }
          } else {
            this.silenceFrames = 0
          }

          // 20msフレームをそのままGeminiへストリーミング
          this.geminiClient.streamFrame(frame, 48000)
        },

        // ローカル音声ストリームを提供
        getLocalPcmStream: this.getLocalAudioStream.bind(this),
      },
      // オプション設定
      frameDurationMs: 20,
      sampleRate: 48000,
      autoStartPublish: true,
      enableTopicAutoAdd: true,
    })

    console.log('✅ Gemini Voice Bot: 準備完了!')

    // アバター制御を開始
    await this.startAvatarControl()
  }

  /**
   * ローカル音声ストリーム
   */
  private async *getLocalAudioStream(): AsyncIterable<Int16Array> {
    console.log('🎵 音声ストリーム開始')

    while (true) {
      if (this.playbackQueue.length > 0) {
        const frame = this.playbackQueue.shift()
        if (frame) {
          this.isPlaying = true
          yield frame
        }
      } else {
        this.isPlaying = false
        // 無音を送信
        yield new Int16Array(960) // 20ms of silence
      }

      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }

  /**
   * Geminiレスポンスを再生
   */
  private async playGeminiResponse(wavBuffer: Buffer): Promise<void> {
    console.log('🎵 Geminiレスポンス再生開始')

    // WAVヘッダーから実際のサンプルレートを読み取る
    const actualSampleRate = wavBuffer.readUInt32LE(24)
    console.log(`📊 WAV sample rate: ${actualSampleRate}Hz (expected: 48000Hz)`)

    // WAVヘッダーをスキップしてPCMデータを抽出
    const pcmData = wavBuffer.slice(44)
    let samples = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.length / 2)

    // サンプルレート変換が必要な場合
    if (actualSampleRate !== 48000) {
      console.log(`🔄 リサンプリング: ${actualSampleRate}Hz → 48000Hz`)
      samples = this.resample(samples, actualSampleRate, 48000)
    }

    // 960サンプル（20ms）ごとに分割してキューに追加
    const frameSize = 960
    for (let i = 0; i < samples.length; i += frameSize) {
      const frame = samples.slice(i, Math.min(i + frameSize, samples.length))

      // フレームサイズが不足している場合はパディング
      if (frame.length < frameSize) {
        const paddedFrame = new Int16Array(frameSize)
        paddedFrame.set(frame)
        this.playbackQueue.push(paddedFrame)
      } else {
        this.playbackQueue.push(frame)
      }
    }

    console.log(`📦 ${this.playbackQueue.length}フレームをキューに追加`)

    // 再生完了まで待機
    while (this.playbackQueue.length > 0 || this.isPlaying) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    console.log('✅ Geminiレスポンス再生完了')
  }

  /**
   * サンプルレート変換（線形補間）
   */
  private resample(input: Int16Array, inputRate: number, outputRate: number): Int16Array {
    const ratio = outputRate / inputRate
    const outputLength = Math.floor(input.length * ratio)
    const output = new Int16Array(outputLength)

    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i / ratio
      const srcIndexInt = Math.floor(srcIndex)
      const srcIndexFrac = srcIndex - srcIndexInt

      if (srcIndexInt + 1 < input.length) {
        // 線形補間
        const sample1 = input[srcIndexInt]
        const sample2 = input[srcIndexInt + 1]
        const interpolated = sample1 + (sample2 - sample1) * srcIndexFrac
        output[i] = Math.max(-32768, Math.min(32767, Math.round(interpolated)))
      } else if (srcIndexInt < input.length) {
        output[i] = input[srcIndexInt]
      } else {
        output[i] = 0
      }
    }

    return output
  }

  /**
   * アバター制御を開始
   */
  private async startAvatarControl(): Promise<void> {
    console.log('🤖 アバター制御開始')

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

      const myPosition = this.client.avatar.getPosition()
      if (!myPosition) {
        return
      }

      // ユーザーとの距離を計算
      const dx = otherUser.position.x - myPosition.x
      const dz = otherUser.position.z - myPosition.z
      const distance = Math.sqrt(dx * dx + dz * dz)

      // ユーザーの方を向く
      await this.client.avatar.lookAt({
        x: otherUser.position.x,
        y: otherUser.position.y,
        z: otherUser.position.z,
      })

      // 2メートル以内にいる場合は停止
      if (distance < 2) {
        if (this.isMoving) {
          this.isMoving = false
          await playAnimation('idle')
        }
        return
      }

      // ユーザーに向かって移動
      if (!this.isMoving) {
        this.isMoving = true
        await playAnimation('walking')
      }

      // 移動方向を計算（0.5メートルずつ）
      const moveX = myPosition.x + (dx / distance) * 0.5
      const moveZ = myPosition.z + (dz / distance) * 0.5

      await this.client.avatar.moveTo({
        x: moveX,
        y: myPosition.y,
        z: moveZ,
      })
    }, 200)
  }

  async disconnect(): Promise<void> {
    console.log('🔌 切断中...')

    // アバター制御を停止
    if (this.moveInterval) {
      clearInterval(this.moveInterval)
      this.moveInterval = undefined
    }

    // Geminiクライアントを切断
    if (this.geminiClient) {
      await this.geminiClient.disconnect()
    }

    // クライアントを切断
    if (this.client) {
      await this.client.disconnect()
    }
  }
}
