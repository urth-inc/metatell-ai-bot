import speech from '@google-cloud/speech'

/**
 * Google Cloud Speech-to-Textを使用した音声認識
 */
export class SpeechRecognizer {
  private speechClient: speech.SpeechClient

  constructor() {
    this.speechClient = new speech.SpeechClient()
  }

  /**
   * 初期化（APIの接続確認）
   */
  async initialize(): Promise<void> {
    // API接続確認のためのテストリクエスト
    try {
      await this.speechClient.getProjectId()
    } catch (error) {
      console.error('Speech-to-Text API接続エラー:', error)
      throw error
    }
  }

  /**
   * WAVバッファから音声認識
   */
  async recognize(audioBuffer: Buffer): Promise<string | null> {
    try {
      const request: speech.protos.google.cloud.speech.v1.IRecognizeRequest = {
        audio: {
          content: audioBuffer.toString('base64'),
        },
        config: {
          encoding: speech.protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16,
          sampleRateHertz: 48000, // ベストプラクティス: 再サンプリングは避ける（ネイティブ48kHz）
          languageCode: 'ja-JP',
          model: 'default', // 短い音声にはdefaultモデルが適切
          useEnhanced: true,
          enableAutomaticPunctuation: true,
          // ベストプラクティス: ノイズリダクションは無効
          audioChannelCount: 1,
          enableSeparateRecognitionPerChannel: false,
        },
      }

      // 音声認識実行
      const [response] = await this.speechClient.recognize(request)

      if (!response.results || response.results.length === 0) {
        return null
      }

      // 最も信頼度の高い結果を取得
      const transcription = response.results
        .map((result) => result.alternatives?.[0]?.transcript || '')
        .join(' ')
        .trim()

      return transcription || null
    } catch (error) {
      console.error('音声認識エラー:', error)
      return null
    }
  }

  /**
   * クリーンアップ
   */
  async close(): Promise<void> {
    await this.speechClient.close()
  }
}
