import { GoogleGenAI, Type } from '@google/genai'
import { DifyClient } from './dify-client.js'

/**
 * Gemini APIを使用したLLM処理
 */
export class GeminiLLMProcessor {
  private ai: GoogleGenAI
  // biome-ignore lint/suspicious/noExplicitAny: @google/genai doesn't export Chat type yet
  private chat: any
  private difyClient?: DifyClient
  private userId: string = 'speech-bot-user'

  constructor(apiKey: string, difyApiUrl?: string, difyApiKey?: string, difyAppId?: string) {
    this.ai = new GoogleGenAI({
      apiKey,
    })

    // Dify APIクライアントを初期化（オプション）
    if (difyApiUrl && difyApiKey && difyAppId) {
      this.difyClient = new DifyClient(difyApiUrl, difyApiKey, difyAppId)
    }
    const systemInstruction = `以下の指示に従って応答してください:
- 日本語で応答すること
- 会話形式なので、1-2文程度の短い応答にすること
- フレンドリーで自然な口調で話すこと
- 長い説明は避け、要点のみを伝えること
- 相槌や短い返事を心がけること
- 絵文字は一切使用しないこと

最重要ルール: 
あなたは質問に直接答えてはいけません。代わりに、以下のパターンの質問では必ずcallDifyApi関数を使用してください:
- 「〜について教えて」
- 「〜とは何ですか」
- 「〜の情報」
- 「〜について説明」
- その他、具体的な知識や情報を求める質問

質問を受けたら、自分で回答せず必ずcallDifyApi関数を使用してください。`

    // Function Declaration定義
    const callDifyApiFunctionDeclaration = {
      name: 'callDifyApi',
      description:
        '必須：ユーザーが何かについて質問した場合は必ずこの関数を使用してください。「〜について教えて」「〜とは何ですか」「〜の情報」など、あらゆる質問に対してこの関数を使用してDify APIから回答を取得します。質問を受けたら確認せずに即座にこの関数を呼び出してください。',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'ユーザーからの質問文そのまま（例: NISAについて教えて）',
          },
        },
        required: ['query'],
      },
    }

    // Function Callingを有効化
    const tools = this.difyClient
      ? [
          {
            functionDeclarations: [callDifyApiFunctionDeclaration],
          },
        ]
      : undefined

    const chatConfig = {
      model: 'gemini-2.5-flash-lite', // 変えない
      config: {
        systemInstruction,
        ...(tools && { tools }),
      },
    }

    // デバッグ: 設定内容を確認
    console.log('🔧 Gemini Chat設定:', {
      model: chatConfig.model,
      hasTools: !!chatConfig.config.tools,
      toolsCount: chatConfig.config.tools?.length || 0,
      difyClientEnabled: !!this.difyClient,
    })

    this.chat = this.ai.chats.create(chatConfig)
  }

  /**
   * テキストに対する応答を生成
   */
  async generateResponse(input: string): Promise<string> {
    try {
      const response = await this.chat.sendMessage({
        message: input,
      })

      // デバッグ: レスポンス内容を確認
      console.log('📊 Gemini応答:', {
        text: `${response.text?.substring(0, 100)}...`,
        hasFunctionCalls: !!response.functionCalls,
        functionCallsCount: response.functionCalls?.length || 0,
      })

      // Function Callの処理
      if (response.functionCalls && response.functionCalls.length > 0) {
        let finalResponse = ''
        for (const functionCall of response.functionCalls) {
          if (functionCall.name === 'callDifyApi') {
            const query = functionCall.args?.query as string
            if (query && this.difyClient) {
              console.log(`🔧 Dify APIを呼び出し中: "${query}"`)

              // ストリーミングモードで取得
              const stream = this.difyClient.sendMessageStream(query, this.userId)
              let fullAnswer = ''

              for await (const event of stream) {
                if (event.answer) {
                  fullAnswer += event.answer
                }
              }

              finalResponse = fullAnswer
              console.log(`📝 Dify応答: "${fullAnswer}"`)
            }
          }
        }
        return finalResponse || 'すみません、応答の生成に失敗しました。'
      }

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
    // Difyの会話履歴もクリア
    if (this.difyClient) {
      this.difyClient.clearConversation(this.userId)
    }
  }

  /**
   * ユーザーIDを設定
   */
  setUserId(userId: string): void {
    this.userId = userId
  }
}
