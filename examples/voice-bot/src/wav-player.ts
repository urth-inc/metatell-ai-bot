/**
 * WAVファイルを読み込んで音声データとして再生する実装
 */
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export class WavPlayer {
  private audioBuffer?: Int16Array[]
  private currentFrame = 0
  private sampleRate: number = 48000
  private targetSampleRate: number = 48000

  /**
   * WAVファイルを読み込む
   */
  async loadWavFile(filePath: string): Promise<void> {
    try {
      // ~/Downloads/3.wav のようなパスを解決
      const resolvedPath = filePath.startsWith('~') ? join(homedir(), filePath.slice(2)) : filePath

      console.log(`📁 Loading WAV file: ${resolvedPath}`)

      const data = await fs.readFile(resolvedPath)

      // WAVヘッダーの解析
      // WAVファイルのフォーマットを解析
      const dataView = new DataView(data.buffer.slice(data.byteOffset, data.byteOffset + 44))

      // サンプルレートを取得（バイト24-27）
      this.sampleRate = dataView.getUint32(24, true)
      console.log(`📊 WAV file sample rate: ${this.sampleRate}Hz`)

      // チャンネル数を取得（バイト22-23）
      const channels = dataView.getUint16(22, true)
      console.log(`📊 WAV file channels: ${channels}`)

      // PCMデータを抽出（通常は44バイト目から開始）
      const headerSize = 44
      const pcmData = data.slice(headerSize)

      // Int16Arrayに変換（16bitサンプルと仮定）
      // BufferからArrayBufferを取得してInt16Arrayに変換
      const arrayBuffer = pcmData.buffer.slice(
        pcmData.byteOffset,
        pcmData.byteOffset + pcmData.length,
      )
      const samples = new Int16Array(arrayBuffer)

      // サンプルレート変換が必要な場合
      let processedSamples: Int16Array = samples
      if (this.sampleRate !== this.targetSampleRate) {
        console.log(`🔄 Resampling from ${this.sampleRate}Hz to ${this.targetSampleRate}Hz`)
        processedSamples = this.resample(samples, this.sampleRate, this.targetSampleRate)
      }

      // 960サンプル（20ms @ 48kHz）ごとのフレームに分割
      this.audioBuffer = []
      const frameSize = 960

      for (let i = 0; i < processedSamples.length; i += frameSize) {
        const frame = processedSamples.slice(i, Math.min(i + frameSize, processedSamples.length))

        // フレームサイズが不足している場合は0でパディング
        if (frame.length < frameSize) {
          const paddedFrame = new Int16Array(frameSize)
          paddedFrame.set(frame)
          // 残りを0で埋める（既にデフォルトで0になっているが明示的に）
          this.audioBuffer.push(paddedFrame)
        } else {
          // フレームサイズと完全に一致
          this.audioBuffer.push(frame)
        }
      }

      console.log(`✅ WAV file loaded: ${this.audioBuffer.length} frames`)
      this.currentFrame = 0
    } catch (error) {
      console.error('❌ Failed to load WAV file:', error)
      throw error
    }
  }

  /**
   * 音声ストリームとして再生
   */
  async *getAudioStream(): AsyncIterable<Int16Array> {
    if (!this.audioBuffer || this.audioBuffer.length === 0) {
      console.error('❌ No audio buffer loaded')
      return
    }

    console.log(`▶️ Starting playback of ${this.audioBuffer.length} frames`)

    while (this.currentFrame < this.audioBuffer.length) {
      yield this.audioBuffer[this.currentFrame]
      this.currentFrame++
    }

    console.log('⏹️ Playback completed')
    this.currentFrame = 0 // リセット
  }

  /**
   * 現在の再生位置をリセット
   */
  reset(): void {
    this.currentFrame = 0
  }

  /**
   * シンプルな線形補間によるリサンプリング
   * 24kHz → 48kHzの場合は2倍にアップサンプリング
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
        // より正確な補間計算
        const interpolated = sample1 + (sample2 - sample1) * srcIndexFrac
        output[i] = Math.max(-32768, Math.min(32767, Math.round(interpolated)))
      } else if (srcIndexInt < input.length) {
        // 最後のサンプル
        output[i] = input[srcIndexInt]
      } else {
        // 範囲外の場合は0
        output[i] = 0
      }
    }

    return output
  }
}
