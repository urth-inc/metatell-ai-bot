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

interface DifyStreamEvent {
  event?: string
  message_id?: string
  conversation_id?: string
  answer?: string
  created_at?: number
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
   * @deprecated Use sendMessageStream instead for better user experience
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
   * Send a message to Dify API with streaming response
   */
  async *sendMessageStream(
    query: string,
    userId: string,
    conversationId?: string,
  ): AsyncGenerator<DifyStreamEvent> {
    const endpoint = `${this.apiUrl}/chat-messages`

    // ユーザーごとの会話IDを管理
    const storedConversationId = conversationId || this.conversationMap.get(userId)

    const requestBody: DifyMessageRequest = {
      inputs: {},
      response_mode: 'streaming',
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

      // SSEストリームをパース
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('Response body is not readable')
      }

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data.trim()) {
              try {
                const event = JSON.parse(data) as DifyStreamEvent

                // 会話IDを保存
                if (event.conversation_id) {
                  this.conversationMap.set(userId, event.conversation_id)
                }

                yield event
              } catch (e) {
                console.error('Failed to parse SSE event:', e)
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to call Dify API:', error)
      throw error
    }
  }

  /**
   * Get all active conversations
   */
  getActiveConversations(): Map<string, string> {
    return new Map(this.conversationMap)
  }
}
