import { GoogleGenAI } from '@google/genai'

/**
 * Gemini APIを使用したLLM処理
 */
export class GeminiLLMProcessor {
  private ai: GoogleGenAI
  private conversationHistory: Array<{
    role: 'user' | 'assistant'
    content: string
  }> = []

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({
      apiKey,
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
        content: input,
      })

      // システムプロンプトと会話履歴を含めたプロンプトを作成
      const systemPrompt = `以下の指示に従って応答してください:
- 日本語で応答すること
- フレンドリーで自然な会話を心がけること
- 簡潔で分かりやすい応答をすること
- ユーザーの質問や話題に適切に応じること

これまでの会話履歴:
${this.conversationHistory
  .slice(-10)
  .map((msg) => `${msg.role === 'user' ? 'ユーザー' : 'アシスタント'}: ${msg.content}`)
  .join('\n')}

ユーザーの最新の発言: ${input}

応答:`

      // 応答を生成
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: systemPrompt,
      })

      const generatedText = response.text || 'すみません、応答の生成に失敗しました。'

      // 履歴に追加
      this.conversationHistory.push({
        role: 'assistant',
        content: generatedText,
      })

      // 履歴が長くなりすぎないように制限
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20)
      }

      return generatedText
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
