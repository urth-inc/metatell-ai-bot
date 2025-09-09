import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 音声データをWAVファイルとして保存するレコーダー
 */
export class AudioRecorder {
  private chunks: Int16Array[] = []
  private recording = false
  private outputDir: string
  private sessionId: string

  constructor(outputDir: string = './audio-output') {
    this.outputDir = outputDir
    this.sessionId = new Date().toISOString().replace(/[:.]/g, '-')

    // 出力ディレクトリを作成
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true })
    }
  }

  /**
   * 録音開始
   */
  start() {
    this.recording = true
    this.chunks = []
    console.log(`🔴 Recording started (session: ${this.sessionId})`)
  }

  /**
   * 録音停止して保存
   */
  stop(): string | null {
    if (!this.recording) return null

    this.recording = false

    if (this.chunks.length === 0) {
      console.log('⚠️ No audio data to save')
      return null
    }

    // すべてのチャンクを結合
    const totalLength = this.chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    const combinedData = new Int16Array(totalLength)
    let offset = 0

    for (const chunk of this.chunks) {
      combinedData.set(chunk, offset)
      offset += chunk.length
    }

    // WAVファイルとして保存
    const filename = `${this.sessionId}_${Date.now()}.wav`
    const filepath = join(this.outputDir, filename)

    this.saveAsWav(filepath, combinedData)
    console.log(`💾 Audio saved: ${filepath}`)

    return filepath
  }

  /**
   * 音声フレームを追加
   */
  addFrame(pcm: Int16Array) {
    if (this.recording) {
      // データをコピーして保存（元のデータが変更される可能性があるため）
      this.chunks.push(new Int16Array(pcm))
    }
  }

  /**
   * WAVファイルとして保存
   */
  private saveAsWav(filepath: string, pcmData: Int16Array) {
    const sampleRate = 48000
    const numChannels = 1
    const bytesPerSample = 2

    const dataLength = pcmData.length * bytesPerSample
    const headerLength = 44
    const fileLength = headerLength + dataLength

    const buffer = new ArrayBuffer(fileLength)
    const view = new DataView(buffer)

    // WAVヘッダーを書き込み
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i))
      }
    }

    // RIFF chunk
    writeString(0, 'RIFF')
    view.setUint32(4, fileLength - 8, true)
    writeString(8, 'WAVE')

    // fmt chunk
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true) // fmt chunk size
    view.setUint16(20, 1, true) // PCM format
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true) // byte rate
    view.setUint16(32, numChannels * bytesPerSample, true) // block align
    view.setUint16(34, bytesPerSample * 8, true) // bits per sample

    // data chunk
    writeString(36, 'data')
    view.setUint32(40, dataLength, true)

    // PCMデータを書き込み
    let offset = 44
    for (let i = 0; i < pcmData.length; i++) {
      view.setInt16(offset, pcmData[i], true)
      offset += 2
    }

    // ファイルに書き込み
    writeFileSync(filepath, Buffer.from(buffer))
  }

  /**
   * 現在の録音状態
   */
  isRecording(): boolean {
    return this.recording
  }
}
