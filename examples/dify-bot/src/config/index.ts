import dotenv from 'dotenv'

// 環境変数をロード
dotenv.config()

export const config = {
  dify: {
    apiUrl: process.env.DIFY_API_URL || 'https://api.dify.ai/v1',
    apiKey: process.env.DIFY_API_KEY || '',
    appId: process.env.DIFY_APP_ID || '',
    streamingMode: process.env.DIFY_STREAMING_MODE !== 'false', // デフォルトでストリーミングモードを有効化
  },
  bot: {
    username: process.env.BOT_USERNAME || 'DifyBot',
  },
} as const
