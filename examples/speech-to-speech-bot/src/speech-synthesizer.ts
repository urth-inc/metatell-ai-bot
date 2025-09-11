import textToSpeech from '@google-cloud/text-to-speech'

/**
 * Google Cloud Text-to-Speechを使用した音声合成
 */
export class SpeechSynthesizer {
  private ttsClient: textToSpeech.TextToSpeechClient

  constructor() {
    this.ttsClient = new textToSpeech.TextToSpeechClient()
  }

  /**
   * 初期化（APIの接続確認）
   */
  async initialize(): Promise<void> {
    // API接続確認のためのテストリクエスト
    try {
      const [result] = await this.ttsClient.listVoices({})
      console.log(`利用可能な音声: ${result.voices?.length || 0}種類`)
    } catch (error) {
      console.error('Text-to-Speech API接続エラー:', error)
      throw error
    }
  }

  /**
   * テキストから音声を合成
   */
  async synthesize(text: string): Promise<Buffer> {
    try {
      const request: textToSpeech.protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
        input: { text },
        voice: {
          languageCode: 'ja-JP',
          name: 'ja-JP-Chirp3-HD-Zephyr',
          ssmlGender: textToSpeech.protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE,
        },
        audioConfig: {
          audioEncoding: textToSpeech.protos.google.cloud.texttospeech.v1.AudioEncoding.LINEAR16,
          sampleRateHertz: 48000,
          speakingRate: 1.0,
          pitch: 0.0,
          volumeGainDb: 0.0,
        },
      }

      // 音声合成実行
      const [response] = await this.ttsClient.synthesizeSpeech(request)

      if (!response.audioContent) {
        throw new Error('音声コンテンツが生成されませんでした')
      }

      // audioContentをBufferに変換
      const audioBuffer = Buffer.from(response.audioContent as Uint8Array)

      // WAVヘッダーを追加
      return this.addWavHeader(audioBuffer, 48000)
    } catch (error) {
      console.error('音声合成エラー:', error)
      throw error
    }
  }

  /**
   * PCMデータにWAVヘッダーを追加
   */
  private addWavHeader(pcmData: Buffer, sampleRate: number): Buffer {
    const dataSize = pcmData.length
    const buffer = Buffer.alloc(44 + dataSize)

    // WAVヘッダー
    buffer.write('RIFF', 0)
    buffer.writeUInt32LE(36 + dataSize, 4)
    buffer.write('WAVE', 8)
    buffer.write('fmt ', 12)
    buffer.writeUInt32LE(16, 16)
    buffer.writeUInt16LE(1, 20) // PCM
    buffer.writeUInt16LE(1, 22) // モノラル
    buffer.writeUInt32LE(sampleRate, 24)
    buffer.writeUInt32LE(sampleRate * 2, 28) // バイトレート
    buffer.writeUInt16LE(2, 32) // ブロックアライン
    buffer.writeUInt16LE(16, 34) // ビット深度
    buffer.write('data', 36)
    buffer.writeUInt32LE(dataSize, 40)

    // PCMデータをコピー
    pcmData.copy(buffer, 44)

    return buffer
  }
}
