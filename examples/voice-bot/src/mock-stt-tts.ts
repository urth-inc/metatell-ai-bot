/**
 * モックSTT/TTS実装
 * 実際の実装では、Google Speech-to-Text/Text-to-Speech、
 * OpenAI Whisper/TTS、Azure Speech Services などを使用
 */

export class MockSTT {
  private buffer: Int16Array[] = []
  private processing = false

  /**
   * 音声フレームを追加
   */
  async addAudioFrame(frame: Int16Array): Promise<void> {
    this.buffer.push(frame)

    // 1秒分のデータが溜まったら処理
    if (this.buffer.length >= 50 && !this.processing) {
      // 50 * 20ms = 1000ms
      await this.processBuffer()
    }
  }

  /**
   * バッファを処理して仮想的なテキストを生成
   */
  private async processBuffer(): Promise<void> {
    this.processing = true

    try {
      // バッファから音声を取り出し
      this.buffer.splice(0, 50)

      // 実際のSTT処理をシミュレート（100ms遅延）
      await new Promise((resolve) => setTimeout(resolve, 100))

      // デモ用：ランダムなメッセージを生成
      const messages = [
        'こんにちは、元気ですか？',
        '今日はいい天気ですね',
        'Voice I/O Bridgeのテストです',
        '音声認識が動作しています',
        'ありがとうございます',
        'さようなら',
      ]

      const text = messages[Math.floor(Math.random() * messages.length)]

      // コールバックで結果を通知
      if (this.onTranscript) {
        this.onTranscript(text)
      }
    } catch (error) {
      console.error('STT処理エラー:', error)
    } finally {
      this.processing = false
    }
  }

  /**
   * 認識結果のコールバック
   */
  onTranscript?: (text: string) => void
}

export class MockTTS {
  /**
   * テキストを音声に変換（モック実装）
   * @returns 音声データのAsyncIterable
   */
  async *textToSpeech(text: string): AsyncIterable<Int16Array> {
    console.log(`🔊 TTS: "${text}"`)

    try {
      // 文字数に応じてフレーム数を決定（1文字あたり10フレーム）
      const frameCount = text.length * 10

      // 20msごとにフレームを生成
      for (let i = 0; i < frameCount; i++) {
        // 実際のTTSでは、ここで音声合成された波形データを生成
        // デモ用：サイン波を生成（440Hz）
        const frame = new Int16Array(960)
        const frequency = 440 // A4音
        const sampleRate = 48000

        for (let j = 0; j < frame.length; j++) {
          const t = (i * 960 + j) / sampleRate
          frame[j] = Math.sin(2 * Math.PI * frequency * t) * 16000
        }

        yield frame

        // フレーム間の遅延をシミュレート
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
    } catch (error) {
      console.error('TTS処理エラー:', error)
    }
  }
}
