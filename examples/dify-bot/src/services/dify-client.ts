import { config } from '../config/index.js'

interface DifyMessageRequest {
  inputs: Record<string, string>
  response_mode: 'streaming' | 'blocking'
  query: string
  conversation_id?: string
  user: string
}

interface DifyMessageResponse {
  message_id: string
  conversation_id: string
  answer: string
  created_at: number
}

export class DifyClient {
  private apiUrl: string
  private apiKey: string
  private appId: string
  private conversationMap: Map<string, string> = new Map()

  constructor() {
    this.apiUrl = config.dify.apiUrl
    this.apiKey = config.dify.apiKey
    this.appId = config.dify.appId

    if (!this.apiKey) {
      throw new Error('DIFY_API_KEY is not set')
    }
    if (!this.appId) {
      throw new Error('DIFY_APP_ID is not set')
    }
  }

  /**
   * Send a message to Dify API and get response
   */
  async sendMessage(
    query: string,
    userId: string,
    conversationId?: string,
  ): Promise<DifyMessageResponse> {
    const endpoint = `${this.apiUrl}/chat-messages`

    // ユーザーごとの会話IDを管理
    const storedConversationId = conversationId || this.conversationMap.get(userId)

    const requestBody: DifyMessageRequest = {
      inputs: {},
      response_mode: 'blocking',
      query,
      user: userId,
      ...(storedConversationId && { conversation_id: storedConversationId }),
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Dify API error: ${response.status} - ${error}`)
      }

      const data = (await response.json()) as DifyMessageResponse

      // 会話IDを保存
      if (data.conversation_id) {
        this.conversationMap.set(userId, data.conversation_id)
      }

      return data
    } catch (error) {
      console.error('Failed to call Dify API:', error)
      throw error
    }
  }

  /**
   * Clear conversation history for a user
   */
  clearConversation(userId: string): void {
    this.conversationMap.delete(userId)
  }

  /**
   * Get all active conversations
   */
  getActiveConversations(): Map<string, string> {
    return new Map(this.conversationMap)
  }
}
