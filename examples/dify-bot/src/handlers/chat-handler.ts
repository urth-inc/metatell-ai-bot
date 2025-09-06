import type { MetatellClient } from '@metatell/bot-sdk'
import { config } from '../config/index.js'
import { DifyClient } from '../services/dify-client.js'

export class ChatHandler {
  private difyClient: DifyClient
  private botInfo: { sessionId?: string; name: string } | null = null

  constructor(private client: MetatellClient) {
    this.difyClient = new DifyClient()
  }

  async initialize() {
    this.botInfo = await this.client.getInfo()
    this.setupChatHandlers()
  }

  private setupChatHandlers() {
    this.client.chat.onMessage(async ({ from, text, mention, reply }) => {
      if (!this.botInfo) return

      if (mention && mention.sessionId === this.botInfo.sessionId) {
        // ボット自身へのメンション
        console.log(`💬 ${from.name} mentioned me: ${text}`)

        try {
          if (config.dify.streamingMode) {
            console.log('Dify APIに問い合わせ (ストリーミングモード)')

            // ストリーミングモードでDify APIに問い合わせ
            const stream = this.difyClient.sendMessageStream(
              text,
              from.id || from.name || 'anonymous',
            )

            let messageBuffer = ''
            let lastReplyTime = Date.now()
            const BATCH_INTERVAL = 100 // 100msごとにバッチ送信

            for await (const event of stream) {
              if (event.answer) {
                messageBuffer += event.answer

                // バッファがたまったら、または指定時間が経過したら送信
                const now = Date.now()
                if (messageBuffer.length > 0 && now - lastReplyTime > BATCH_INTERVAL) {
                  await reply(messageBuffer)
                  messageBuffer = ''
                  lastReplyTime = now
                }
              }
            }

            // 残りのバッファを送信
            if (messageBuffer.length > 0) {
              await reply(messageBuffer)
            }

            console.log('Dify APIストリーミング完了')
          } else {
            console.log('Dify APIに問い合わせ (ブロッキングモード)')

            // ブロッキングモードでDify APIに問い合わせ
            const response = await this.difyClient.sendMessage(
              text,
              from.id || from.name || 'anonymous',
            )

            console.log('Dify APIブロッキング完了')
            await reply(response.answer)
          }

          // 感謝のアニメーション（アバター依存のIDなので環境に合わせて変更が必要）
          /*
          await this.client.avatar.play({ 
            id: '31a7e9af-cd65-4efa-ad9c-132f21d03766', 
            loop: false 
          })
          */
        } catch (error) {
          console.error('Failed to get Dify response:', error)
          await reply('申し訳ありません。現在応答を生成できません。')
        }
      } else if (mention) {
        // 他のユーザーへのメンション
        console.log(`📢 ${from.name} mentioned @${mention.name}: ${text}`)
      } else {
        // 通常のメッセージ
        console.log(`💭 ${from.name}: ${text}`)
      }
    })
  }

  /**
   * Clear conversation history for a specific user
   */
  clearUserConversation(userId: string) {
    this.difyClient.clearConversation(userId)
  }

  /**
   * Get active conversations
   */
  getActiveConversations() {
    return this.difyClient.getActiveConversations()
  }
}
