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
あなたは質問に直接答えてはいけません。以下の場合は必ずcallDifyApi関数を使用してください:
1. 何かについて教えてほしい、説明してほしい、情報が欲しいという依頼
2. 「〜以外」「〜ではない」「他の」など、特定の話題を除外する表現
3. 具体的な事物、概念、サービス、制度などについての質問
4. 「どんな」「何が」「どのような」などの疑問詞を含む質問
5. その他、知識や情報を求めていると判断できる発話

例外:
- 単純な挨拶（こんにちは、おはよう等）
- 感謝の言葉（ありがとう等）
- 単純な相槌（はい、そうですね等）

これらの例外以外は、必ずcallDifyApi関数を使用してください。`

    // Function Declaration定義
    const callDifyApiFunctionDeclaration = {
      name: 'callDifyApi',
      description:
        '必須：ユーザーが何かについて質問したり、情報を求めたりした場合は必ずこの関数を使用してください。「〜について」「〜以外」「〜ではない」「他の」などの表現や、疑問詞を含む発話はすべてこの関数で処理します。挨拶と感謝以外のほぼすべての発話でこの関数を使用してください。',
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
      // デバッグ: 入力内容を確認
      console.log('🎯 入力メッセージ:', input)

      const response = await this.chat.sendMessage({
        message: input,
      })

      // デバッグ: レスポンス内容を詳細に確認
      console.log('📊 Gemini応答詳細:', {
        input: input,
        text: response.text ? `${response.text.substring(0, 100)}...` : 'なし',
        hasFunctionCalls: !!response.functionCalls,
        functionCallsCount: response.functionCalls?.length || 0,
        functionNames: response.functionCalls?.map((fc) => fc.name) || [],
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
