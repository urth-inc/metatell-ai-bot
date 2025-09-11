import { GoogleGenAI } from '@google/genai'

/**
 * Gemini APIを使用したLLM処理
 */
export class GeminiLLMProcessor {
  private ai: GoogleGenAI
  // biome-ignore lint/suspicious/noExplicitAny: @google/genai doesn't export Chat type yet
  private chat: any

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({
      apiKey,
    })
    const systemInstruction = `以下の指示に従って応答してください:
- 日本語で応答すること
- 会話形式なので、1-2文程度の短い応答にすること
- フレンドリーで自然な口調で話すこと
- 長い説明は避け、要点のみを伝えること
- 相槌や短い返事を心がけること
以下の指示に従って応答してください:
  - 日本語で応答すること
  - 会話形式なので、1-2文程度の短い応答にすること
  - フレンドリーで自然な口調で話すこと
  - 長い説明は避け、要点のみを伝えること
  - 相槌や短い返事を心がけること
  - 絵文字は一切使用しないこと`

    this.chat = this.ai.chats.create({
      model: 'gemini-2.5-flash-lite',
      config: {
        systemInstruction,
      },
    })
  }

  /**
   * テキストに対する応答を生成
   */
  async generateResponse(input: string): Promise<string> {
    try {
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
    // @google/genaiでは会話履歴をAPI側で管理するため、ここでは何もしない
  }
}
