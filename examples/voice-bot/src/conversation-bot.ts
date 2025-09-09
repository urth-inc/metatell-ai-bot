import type { AgentVoiceAttachment, MetatellClient } from '@metatell/bot-sdk'
import { createMetatellClient, enableVoice } from '@metatell/bot-sdk'
import { AudioRecorder } from './audio-recorder.js'
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
  private audioRecorder: AudioRecorder

  constructor(serverUrl: string, roomId: string, username: string = 'VoiceBot', token?: string) {
    this.client = createMetatellClient({ serverUrl, roomId, username, token })
    this.stt = new MockSTT()
    this.tts = new MockTTS()
    this.audioRecorder = new AudioRecorder('./audio-recordings')

    // STTの認識結果を受け取るコールバック
    this.stt.onTranscript = this.handleTranscript.bind(this)
  }

  async connect() {
    console.log('🤖 Conversation Bot: Connecting...')
    console.log('📁 Audio recordings will be saved to: ./audio-recordings')

    // クライアントを接続
    await this.client.connect()

    // 録音開始
    this.audioRecorder.start()

    // 音声機能を有効化
    this.voice = await enableVoice(this.client, {
      transport: { type: 'livekit' }, // 実際のLiveKit接続を使用
      handlers: {
        // リモート音声を受信 -> STTに送信 & 録音
        onRemotePcm: async (pcm, meta) => {
          console.log(`📥 Audio from ${meta.fromIdentity || 'unknown'} (${pcm.length} samples)`)

          // 音声データを録音
          this.audioRecorder.addFrame(pcm)

          // STTに送信
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
    console.log('🎤 Waiting for audio input from LiveKit...')

    // デバッグ: 10秒ごとに録音を保存
    setInterval(() => {
      if (this.audioRecorder.isRecording()) {
        console.log('⏺️ Saving periodic recording...')
        const savedFile = this.audioRecorder.stop()
        if (savedFile) {
          console.log(`🎵 Periodic save: ${savedFile}`)
        }
        // 新しい録音を開始
        this.audioRecorder.start()
      }
    }, 10000)
  }

  /**
   * 音声認識結果を処理
   */
  private async handleTranscript(text: string) {
    try {
      console.log(`👂 Heard: "${text}"`)

      // AI応答を生成（実際の実装ではLLMを使用）
      const response = await this.generateResponse(text)

      console.log(`💬 Response: "${response}"`)

      // TTSで音声に変換して送信開始
      this.currentTtsStream = this.tts.textToSpeech(response)[Symbol.asyncIterator]()
    } catch (error) {
      console.error('音声認識結果の処理エラー:', error)
    }
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
      ありがとう: 'どういたしまして！お役に立てて嬉しいです。',
      さようなら: 'さようなら！またお話ししましょう。',
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

    // 録音を停止して保存
    const savedFile = this.audioRecorder.stop()
    if (savedFile) {
      console.log(`🎵 Audio recording saved: ${savedFile}`)
    }

    if (this.voice) {
      await this.voice.detach()
    }

    await this.client.disconnect()

    console.log('✅ Disconnected')
  }
}
