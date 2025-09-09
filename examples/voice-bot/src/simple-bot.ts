import type { AgentVoiceAttachment, MetatellClient } from '@metatell/bot-sdk'
import { createMetatellClient, enableVoice } from '@metatell/bot-sdk'
import { MockSTT, MockTTS } from './mock-stt-tts.js'

/**
 * シンプルな音声ボットの実装例
 * SDK の高レベルAPIを使用して、実装の詳細を隠蔽
 */
export class SimpleVoiceBot {
  private client: MetatellClient
  private voice?: AgentVoiceAttachment
  private stt: MockSTT
  private tts: MockTTS
  private currentTtsStream?: AsyncIterator<Int16Array>

  constructor(
    serverUrl: string,
    roomId: string,
    username: string = 'SimpleVoiceBot',
    token?: string,
  ) {
    this.client = createMetatellClient({ serverUrl, roomId, username, token })
    this.stt = new MockSTT()
    this.tts = new MockTTS()

    // STTの認識結果を受け取るコールバック
    this.stt.onTranscript = this.handleTranscript.bind(this)
  }

  async start() {
    console.log('🤖 Simple Voice Bot: Starting...')

    // クライアントを接続
    await this.client.connect()

    // 音声機能を有効化（実装の詳細は SDK 内部に隠蔽）
    this.voice = await enableVoice(this.client, {
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

    console.log('✅ Simple Voice Bot: Ready!')
    console.log('🎙️ Listening for audio...')
  }

  /**
   * 音声認識結果を処理
   */
  private async handleTranscript(text: string) {
    console.log(`👂 Heard: "${text}"`)

    // 簡単な応答を生成
    const response = this.generateResponse(text)
    console.log(`💬 Response: "${response}"`)

    // TTSで音声に変換
    this.currentTtsStream = this.tts.textToSpeech(response)[Symbol.asyncIterator]()
  }

  /**
   * 応答を生成
   */
  private generateResponse(input: string): string {
    if (input.includes('こんにちは')) {
      return 'こんにちは！お元気ですか？'
    } else if (input.includes('ありがとう')) {
      return 'どういたしまして！'
    } else {
      return 'なるほど、そうですね。'
    }
  }

  /**
   * ローカル音声ストリーム
   */
  private async *getLocalAudioStream(): AsyncIterable<Int16Array> {
    while (true) {
      if (this.currentTtsStream) {
        const result = await this.currentTtsStream.next()
        if (!result.done) {
          yield result.value
        } else {
          this.currentTtsStream = undefined
        }
      } else {
        yield new Int16Array(960) // 無音
      }

      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }

  /**
   * ミュート制御
   */
  async setMuted(muted: boolean) {
    await this.client.muteVoice?.(muted)
    console.log(`🔇 Microphone ${muted ? 'muted' : 'unmuted'}`)
  }

  /**
   * 停止
   */
  async stop() {
    console.log('👋 Stopping...')
    if (this.voice) {
      await this.voice.detach()
    }

    await this.client.disconnect()

    console.log('✅ Stopped')
  }
}
