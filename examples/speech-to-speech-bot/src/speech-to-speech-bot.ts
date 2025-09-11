import * as fs from 'node:fs'
import type { MetatellClient } from '@metatell/bot-sdk'
import { createMetatellClient, enableVoice } from '@metatell/bot-sdk'
import { GeminiLLMProcessor } from './gemini-llm-processor.js'
import { SpeechRecognizer } from './speech-recognizer.js'
import { SpeechSynthesizer } from './speech-synthesizer.js'

/**
 * 音声認識→LLM→音声合成ボット
 */
export class SpeechToSpeechBot {
  private client: MetatellClient
  private speechRecognizer: SpeechRecognizer
  private llmProcessor: GeminiLLMProcessor
  private speechSynthesizer: SpeechSynthesizer

  // デバッグ用録音ディレクトリ
  private recordingsDir = './recordings'

  // 音声再生関連
  private playbackQueue: Int16Array[] = []
  private isPlaying = false

  // アバター制御
  private isMoving = false
  private moveInterval?: NodeJS.Timeout

  // 音声処理状態
  private isProcessing = false
  private audioBuffer: Int16Array[] = []
  private silenceFrames = 0
  private readonly silenceThreshold = 50 // 50フレーム = 1秒の無音

  // 音声レベル表示用
  private voiceLevelInterval?: NodeJS.Timeout
  private lastVoiceLevel = 0

  constructor(
    serverUrl: string,
    roomId: string,
    username: string = 'SpeechToSpeechBot',
    geminiApiKey: string,
  ) {
    this.client = createMetatellClient({ serverUrl, roomId, username })
    this.speechRecognizer = new SpeechRecognizer()
    this.llmProcessor = new GeminiLLMProcessor(geminiApiKey)
    this.speechSynthesizer = new SpeechSynthesizer()
  }

  async start() {
    console.log('🤖 Speech-to-Speech Bot: 起動中...')

    // クライアントを接続
    await this.client.connect()

    // 録音ディレクトリを作成
    if (!fs.existsSync(this.recordingsDir)) {
      fs.mkdirSync(this.recordingsDir, { recursive: true })
    }

    // 音声認識とTTSを初期化
    try {
      await this.speechRecognizer.initialize()
      console.log('✅ 音声認識準備完了')

      await this.speechSynthesizer.initialize()
      console.log('✅ 音声合成準備完了')
    } catch (error) {
      console.error('❌ 初期化エラー:', error)
      throw error
    }

    // 音声機能を有効化
    console.log('🔌 音声機能を有効化中...')
    await enableVoice(this.client, {
      transport: { type: 'livekit' },
      loggerTag: 'SpeechToSpeechBot',
      handlers: {
        // リモート音声を受信
        onRemotePcm: async (pcm, _meta) => {
          const frame = new Int16Array(pcm)

          // 音声レベルを記録（可視化用）
          const amplitude = Math.max(...Array.from(frame).map(Math.abs))
          this.lastVoiceLevel = amplitude

          // 処理中は新しい音声を無視
          if (this.isProcessing) {
            return
          }

          // 無音検出
          const isSilent = amplitude < 500

          if (isSilent) {
            this.silenceFrames++
            // 1秒以上の無音で処理開始
            if (this.silenceFrames >= this.silenceThreshold && this.audioBuffer.length > 0) {
              await this.processAudioBuffer()
            }
          } else {
            this.silenceFrames = 0
            // 音声をバッファに追加
            this.audioBuffer.push(frame)
          }
        },

        // ローカル音声ストリームを提供
        getLocalPcmStream: this.getLocalAudioStream.bind(this),
      },
      frameDurationMs: 20,
      sampleRate: 48000,
      autoStartPublish: true,
      enableTopicAutoAdd: true,
    })

    console.log('✅ Speech-to-Speech Bot: 準備完了!')

    // アバター制御を開始
    await this.startAvatarControl()

    // 音声レベル表示を開始
    this.startVoiceLevelMonitor()
  }

  /**
   * 音声バッファを処理
   */
  private async processAudioBuffer(): Promise<void> {
    if (this.isProcessing || this.audioBuffer.length === 0) {
      return
    }

    this.isProcessing = true
    console.log('\n🎯 音声処理開始...')

    try {
      // 1. 音声データをWAVに変換
      const wavBuffer = this.createWavFromFrames(this.audioBuffer)

      // デバッグ用に保存
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const inputPath = `${this.recordingsDir}/input_${timestamp}.wav`
      fs.writeFileSync(inputPath, wavBuffer)
      console.log(`💾 入力音声を保存: ${inputPath}`)

      // 2. 音声認識
      console.log('🎤 音声認識中...')
      const transcript = await this.speechRecognizer.recognize(wavBuffer)
      if (!transcript) {
        console.log('❌ 音声認識失敗')
        return
      }
      console.log(`📝 認識結果: "${transcript}"`)

      // 3. LLM処理
      console.log('🤔 LLM応答生成中...')
      const response = await this.llmProcessor.generateResponse(transcript)
      console.log(`💭 応答: "${response}"`)

      // 4. 音声合成
      console.log('🔊 音声合成中...')
      const audioData = await this.speechSynthesizer.synthesize(response)

      // デバッグ用に保存
      const outputPath = `${this.recordingsDir}/output_${timestamp}.wav`
      fs.writeFileSync(outputPath, audioData)
      console.log(`💾 出力音声を保存: ${outputPath}`)

      // 5. 音声を再生
      await this.playAudioResponse(audioData)
    } catch (error) {
      console.error('❌ 処理エラー:', error)
    } finally {
      // バッファをクリア
      this.audioBuffer = []
      this.silenceFrames = 0
      this.isProcessing = false
      console.log('✨ 音声処理完了\n')
    }
  }

  /**
   * フレーム配列からWAVを作成
   */
  private createWavFromFrames(frames: Int16Array[]): Buffer {
    const totalSamples = frames.reduce((sum, frame) => sum + frame.length, 0)
    const pcmData = new Int16Array(totalSamples)
    let offset = 0

    for (const frame of frames) {
      pcmData.set(frame, offset)
      offset += frame.length
    }

    return this.createWavBuffer(pcmData, 48000)
  }

  /**
   * PCMデータからWAVバッファを作成
   */
  private createWavBuffer(pcmData: Int16Array, sampleRate: number): Buffer {
    const dataSize = pcmData.length * 2
    const buffer = Buffer.alloc(44 + dataSize)

    // WAVヘッダー
    buffer.write('RIFF', 0)
    buffer.writeUInt32LE(36 + dataSize, 4)
    buffer.write('WAVE', 8)
    buffer.write('fmt ', 12)
    buffer.writeUInt32LE(16, 16)
    buffer.writeUInt16LE(1, 20)
    buffer.writeUInt16LE(1, 22) // モノラル
    buffer.writeUInt32LE(sampleRate, 24)
    buffer.writeUInt32LE(sampleRate * 2, 28)
    buffer.writeUInt16LE(2, 32)
    buffer.writeUInt16LE(16, 34)
    buffer.write('data', 36)
    buffer.writeUInt32LE(dataSize, 40)

    // PCMデータ
    for (let i = 0; i < pcmData.length; i++) {
      buffer.writeInt16LE(pcmData[i], 44 + i * 2)
    }

    return buffer
  }

  /**
   * 音声応答を再生
   */
  private async playAudioResponse(wavBuffer: Buffer): Promise<void> {
    console.log('🎵 応答音声再生開始')

    // WAVヘッダーから情報を取得
    const sampleRate = wavBuffer.readUInt32LE(24)
    const dataSize = wavBuffer.readUInt32LE(40)
    console.log(`📊 サンプルレート: ${sampleRate}Hz, データサイズ: ${dataSize}バイト`)

    // PCMデータを抽出
    const pcmData = wavBuffer.slice(44)
    const pcmArray = new Uint8Array(pcmData)
    const samplesBuffer = new ArrayBuffer(pcmArray.length)
    const samplesView = new Uint8Array(samplesBuffer)
    samplesView.set(pcmArray)

    let samples: Int16Array = new Int16Array(samplesBuffer)

    // 48kHzにリサンプリング（必要な場合）
    if (sampleRate !== 48000) {
      console.log(`🔄 リサンプリング: ${sampleRate}Hz → 48000Hz`)
      const resampled = this.resample(samples, sampleRate, 48000)
      samples = new Int16Array(resampled)
    }

    // 960サンプル（20ms）ごとに分割してキューに追加
    const frameSize = 960
    for (let i = 0; i < samples.length; i += frameSize) {
      const frame = samples.slice(i, Math.min(i + frameSize, samples.length))

      if (frame.length < frameSize) {
        const paddedFrame = new Int16Array(frameSize)
        paddedFrame.set(frame)
        this.playbackQueue.push(paddedFrame)
      } else {
        this.playbackQueue.push(new Int16Array(frame))
      }
    }

    console.log(`📦 ${this.playbackQueue.length}フレームをキューに追加`)

    // 再生完了まで待機
    const startTime = Date.now()
    while (this.playbackQueue.length > 0 || this.isPlaying) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    const duration = Date.now() - startTime
    console.log(`✅ 応答音声再生完了 (${duration}ms)`)
  }

  /**
   * サンプルレート変換
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
        yield new Int16Array(960)
      }

      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }

  /**
   * アバター制御を開始
   */
  private async startAvatarControl(): Promise<void> {
    console.log('🤖 アバター制御開始')

    const playAnimation = async (animationId: string) => {
      try {
        await this.client.avatar.play({ id: animationId, loop: true })
      } catch (error) {
        console.warn(`Animation ${animationId} not available:`, error)
      }
    }

    this.moveInterval = setInterval(async () => {
      const users = this.client.getUsers()
      const meInfo = await this.client.getInfo()

      const otherUser = users.find((user) => user.name !== meInfo.name)
      if (!otherUser?.position) {
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

      const dx = otherUser.position.x - myPosition.x
      const dz = otherUser.position.z - myPosition.z
      const distance = Math.sqrt(dx * dx + dz * dz)

      await this.client.avatar.lookAt({
        x: otherUser.position.x,
        y: otherUser.position.y,
        z: otherUser.position.z,
      })

      if (distance < 2) {
        if (this.isMoving) {
          this.isMoving = false
          await playAnimation('idle')
        }
        return
      }

      if (!this.isMoving) {
        this.isMoving = true
        await playAnimation('walking')
      }

      const moveX = myPosition.x + (dx / distance) * 0.5
      const moveZ = myPosition.z + (dz / distance) * 0.5

      await this.client.avatar.moveTo({
        x: moveX,
        y: myPosition.y,
        z: moveZ,
      })
    }, 200)
  }

  /**
   * 音声レベルの可視化
   */
  private startVoiceLevelMonitor(): void {
    this.voiceLevelInterval = setInterval(() => {
      const level = Math.min(10, Math.floor(this.lastVoiceLevel / 3000))
      if (level > 0) {
        const bar = `🎤 ${'▮'.repeat(level)}${'▯'.repeat(10 - level)}`
        const db = Math.round(20 * Math.log10(this.lastVoiceLevel / 32768))
        process.stdout.write(`\r${bar} ${db}dB `)
      } else {
        process.stdout.write(`\r${' '.repeat(30)}\r`)
      }

      this.lastVoiceLevel = Math.floor(this.lastVoiceLevel * 0.8)
    }, 100)
  }

  async disconnect(): Promise<void> {
    console.log('🔌 切断中...')

    if (this.voiceLevelInterval) {
      clearInterval(this.voiceLevelInterval)
      this.voiceLevelInterval = undefined
      process.stdout.write(`\r${' '.repeat(30)}\r`)
    }

    if (this.moveInterval) {
      clearInterval(this.moveInterval)
      this.moveInterval = undefined
    }

    if (this.speechRecognizer) {
      await this.speechRecognizer.close()
    }

    if (this.client) {
      await this.client.disconnect()
    }
  }
}
