import { GoogleGenAI } from '@google/genai'

/**
 * Gemini APIを使用したLLM処理
 */
export class GeminiLLMProcessor {
  private ai: GoogleGenAI

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
      // システムプロンプトとユーザー入力を組み合わせ
      const contents = [
        '以下の指示に従って応答してください:\n' +
          '- 日本語で応答すること\n' +
          '- フレンドリーで自然な会話を心がけること\n' +
          '- 簡潔で分かりやすい応答をすること\n' +
          '- ユーザーの質問や話題に適切に応じること\n\n' +
          `ユーザー: ${input}`,
      ]

      // 応答を生成
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash-001',
        contents: contents.join('\n'),
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
    // @google/genaiでは会話履歴をAPI側で管理するため、ここでは何もしない
  }
}
