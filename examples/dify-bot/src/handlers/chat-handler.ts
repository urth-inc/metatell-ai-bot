import type { MetatellClient } from '@metatell/bot-sdk'
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
          console.log('Dify APIに問い合わせ')
          // Dify APIに問い合わせ
          const response = await this.difyClient.sendMessage(
            text,
            from.id || from.name || 'anonymous',
          )
          console.log('Dify APIに問い合わせ完了')

          // Difyからの応答をリプライ
          await reply(response.answer)

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
