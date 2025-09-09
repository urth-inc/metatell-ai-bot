import type { AgentVoiceAttachment, MetatellClient } from '@metatell/bot-sdk'
import { createMetatellClient, enableVoice } from '@metatell/bot-sdk'
import { MockSTT, MockTTS } from './mock-stt-tts.js'

/**
 * 会話型音声ボットの実装例
 * STT -> AI応答生成 -> TTS のパイプラインを実装
 *
 * SDK の高レベルAPIを使用することで、トランスポートの詳細は隠蔽されています
 */
export class ConversationBot {
  private client: MetatellClient
  private voice?: AgentVoiceAttachment
  private stt: MockSTT
  private tts: MockTTS
  private currentTtsStream?: AsyncIterator<Int16Array>

  constructor(serverUrl: string, roomId: string, username: string = 'VoiceBot', token?: string) {
    this.client = createMetatellClient({ serverUrl, roomId, username, token })
    this.stt = new MockSTT()
    this.tts = new MockTTS()

    // STTの認識結果を受け取るコールバック
    this.stt.onTranscript = this.handleTranscript.bind(this)
  }

  async connect() {
    console.log('🤖 Conversation Bot: Connecting...')

    // クライアントを接続
    await this.client.connect()

    // 音声機能を有効化（デモ用にMockTransportを使用）
    this.voice = await enableVoice(this.client, {
      // デモ用にMockTransportを使用してLiveKit接続を回避
      transport: { type: 'mock' },
      handlers: {
        // リモート音声を受信 -> STTに送信
        onRemotePcm: async (pcm, meta) => {
          console.log(`📥 Audio from ${meta.fromIdentity || 'unknown'}`)
          await this.stt.addAudioFrame(pcm)
        },

        // ローカル音声ストリームを提供（TTSの出力）
        getLocalPcmStream: this.getLocalAudioStream.bind(this),
      },
      // オプション設定
      frameDurationMs: 20,
      sampleRate: 48000,
      autoStartPublish: true,
      enableTopicAutoAdd: true,
    })

    console.log('✅ Conversation Bot: Ready!')
  }

  /**
   * 音声認識結果を処理
   */
  private async handleTranscript(text: string) {
    console.log(`👂 Heard: "${text}"`)

    // AI応答を生成（実際の実装ではLLMを使用）
    const response = await this.generateResponse(text)

    console.log(`💬 Response: "${response}"`)

    // TTSで音声に変換して送信開始
    this.currentTtsStream = this.tts.textToSpeech(response)[Symbol.asyncIterator]()
  }

  /**
   * AI応答を生成（モック実装）
   */
  private async generateResponse(input: string): Promise<string> {
    // 簡単な応答パターンマッチング
    const responses: Record<string, string> = {
      こんにちは: 'こんにちは！今日はどのようなご用件でしょうか？',
      元気: 'はい、元気です！あなたはいかがですか？',
      天気: '今日は晴れていて、とても過ごしやすい日ですね。',
      テスト: 'Voice I/O Bridgeは正常に動作しています！',
    }

    // キーワードマッチング
    for (const [keyword, response] of Object.entries(responses)) {
      if (input.includes(keyword)) {
        return response
      }
    }

    // デフォルト応答
    return 'すみません、もう一度お話しいただけますか？'
  }

  /**
   * ローカル音声ストリーム（TTS出力）
   */
  private async *getLocalAudioStream(): AsyncIterable<Int16Array> {
    console.log('🎙️ Local audio stream started')

    while (true) {
      if (this.currentTtsStream) {
        // TTSストリームから音声フレームを取得
        const result = await this.currentTtsStream.next()

        if (!result.done) {
          yield result.value
        } else {
          // TTSストリームが終了したらクリア
          this.currentTtsStream = undefined
        }
      } else {
        // TTSストリームがない場合は無音を送信
        yield new Int16Array(960) // 20ms of silence
      }

      // 20ms待機
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }

  /**
   * 音声のミュート/ミュート解除
   */
  async setMuted(muted: boolean) {
    await this.client.muteVoice?.(muted)
    console.log(`🔇 Microphone ${muted ? 'muted' : 'unmuted'}`)
  }

  /**
   * 切断処理
   */
  async disconnect() {
    console.log('👋 Disconnecting...')

    if (this.voice) {
      await this.voice.detach()
    }

    await this.client.disconnect()

    console.log('✅ Disconnected')
  }
}
