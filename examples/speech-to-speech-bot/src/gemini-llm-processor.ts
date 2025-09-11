import { GoogleGenAI } from '@google/genai'

/**
 * Gemini APIを使用したLLM処理
 */
export class GeminiLLMProcessor {
  private ai: GoogleGenAI
  // biome-ignore lint/suspicious/noExplicitAny: @google/genai doesn't export Chat type yet
  private chat: any // TODO: Add proper type when @google/genai exports Chat type
  private isInitialized = false

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({
      apiKey,
    })
  }

  /**
   * チャットセッションを初期化
   */
  private initializeChat(): void {
    this.chat = this.ai.chats.create({
      model: 'gemini-2.5-flash',
      history: [
        {
          role: 'user',
          parts: [
            {
              text:
                '以下の指示に従って応答してください:\n' +
                '- 日本語で応答すること\n' +
                '- フレンドリーで自然な会話を心がけること\n' +
                '- 簡潔で分かりやすい応答をすること\n' +
                '- ユーザーの質問や話題に適切に応じること',
            },
          ],
        },
        {
          role: 'model',
          parts: [
            {
              text: 'はい、理解しました。日本語でフレンドリーに、簡潔で分かりやすい応答を心がけます。何かお話ししたいことがあれば、お聞かせください。',
            },
          ],
        },
      ],
    })
    this.isInitialized = true
  }

  /**
   * テキストに対する応答を生成
   */
  async generateResponse(input: string): Promise<string> {
    try {
      // 初回のみチャットを初期化
      if (!this.isInitialized) {
        this.initializeChat()
      }

      // 応答を生成
      const response = await this.chat.sendMessage({
        message: input,
      })

      return response.text || 'すみません、応答の生成に失敗しました。'
    } catch (error) {
      console.error('Gemini API エラー:', error)
      return 'すみません、応答の生成に失敗しました。もう一度お試しください。'
    }
  }

  /**
   * 会話履歴をリセット
   */
  resetConversation(): void {
    this.isInitialized = false
    this.chat = null
  }
}
