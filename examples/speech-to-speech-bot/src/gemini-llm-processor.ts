import type { GenerativeModel } from '@google/generative-ai'
import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * Gemini APIを使用したLLM処理
 */
export class GeminiLLMProcessor {
  private genAI: GoogleGenerativeAI
  private model: GenerativeModel
  private conversationHistory: Array<{
    role: 'user' | 'model'
    parts: string
  }> = []

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey)
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-pro',
      generationConfig: {
        temperature: 0.9,
        topK: 1,
        topP: 1,
        maxOutputTokens: 2048,
      },
    })
  }

  /**
   * テキストに対する応答を生成
   */
  async generateResponse(input: string): Promise<string> {
    try {
      // 会話履歴に追加
      this.conversationHistory.push({
        role: 'user',
        parts: input,
      })

      // システムプロンプトを含めた会話を開始
      const chat = this.model.startChat({
        history: [
          {
            role: 'user',
            parts:
              '以下の指示に従って応答してください:\n' +
              '- 日本語で応答すること\n' +
              '- フレンドリーで自然な会話を心がけること\n' +
              '- 簡潔で分かりやすい応答をすること\n' +
              '- ユーザーの質問や話題に適切に応じること',
          },
          {
            role: 'model',
            parts:
              'はい、理解しました。日本語でフレンドリーに、簡潔で分かりやすい応答を心がけます。',
          },
          ...this.conversationHistory.slice(-10), // 直近10件の履歴のみ保持
        ],
      })

      // 応答を生成
      const result = await chat.sendMessage(input)
      const response = result.response.text()

      // 履歴に追加
      this.conversationHistory.push({
        role: 'model',
        parts: response,
      })

      // 履歴が長くなりすぎないように制限
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20)
      }

      return response
    } catch (error) {
      console.error('Gemini API エラー:', error)
      return 'すみません、応答の生成に失敗しました。もう一度お試しください。'
    }
  }

  /**
   * 会話履歴をリセット
   */
  resetConversation(): void {
    this.conversationHistory = []
  }
}
