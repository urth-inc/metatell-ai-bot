import {
  type MessagePayload,
  MetatellClient,
  type MetatellConfig,
  type PresenceData,
} from './metatell-client'

// URLからhubIdを抽出する関数
export function extractHubIdFromUrl(url: string): string {
  // https://metatell.app/DfueGup/palatable-hospitable-outing
  // から DfueGup を抽出
  const match = url.match(/metatell\.app\/([^/]+)/)
  if (match) {
    return match[1]
  }
  throw new Error('Invalid Metatell URL')
}

// メインのボットクラス
export class MetatellBot extends MetatellClient {
  private responseHandlers: Map<RegExp, (message: string) => string> = new Map()
  private lastMessageTime = 0
  private messageInterval = 60000 // 60秒

  constructor(config: MetatellConfig) {
    super(config)
    this.setupDefaultHandlers()
  }

  // デフォルトの応答ハンドラーを設定
  private setupDefaultHandlers() {
    // 挨拶
    this.addResponseHandler(
      /hello|hi|hey|こんにちは/i,
      () => `Hello! I'm ${this.config.profile.displayName}. How can I help you today?`,
    )

    // ヘルプ
    this.addResponseHandler(
      /help|ヘルプ|助けて/i,
      () =>
        'I can help you with:\n' +
        '• Answer questions\n' +
        '• Provide information\n' +
        '• Chat and keep you company\n' +
        "Just type your message and I'll respond!",
    )

    // 感謝
    this.addResponseHandler(/thank|ありがとう|thanks/i, () => "You're welcome! Happy to help! 😊")
  }

  // 応答ハンドラーを追加
  addResponseHandler(pattern: RegExp, handler: (message: string) => string) {
    this.responseHandlers.set(pattern, handler)
  }

  // レート制限付きでメッセージを送信
  private sendMessageWithRateLimit(message: string): void {
    const now = Date.now()
    if (now - this.lastMessageTime >= this.messageInterval) {
      this.sendMessage(message)
      this.lastMessageTime = now
    } else {
      console.log(
        `Rate limited: Message not sent (wait ${Math.ceil((this.messageInterval - (now - this.lastMessageTime)) / 1000)}s)`,
      )
    }
  }

  // メッセージを処理
  protected handleMessage(payload: MessagePayload): void {
    // 自分のメッセージは無視
    if (payload.from_session_id === this.getSessionId()) {
      return
    }
    if (payload.type !== 'chat') {
      return
    }

    console.log(`[${payload.from_session_id}] ${payload.body}`)

    // 応答ハンドラーをチェック
    for (const [pattern, handler] of this.responseHandlers) {
      if (pattern.test(payload.body)) {
        const response = handler(payload.body)
        this.sendMessageWithRateLimit(response)
        return
      }
    }

    // デフォルト応答
    if (payload.body.toLowerCase().includes(this.config.profile.displayName.toLowerCase())) {
      this.sendMessageWithRateLimit('Did you call me? How can I help?')
    }
  }

  // ユーザー参加時
  protected onUserJoin(_id: string, presence: PresenceData): void {
    const userName = presence.metas[0]?.profile?.displayName || 'Guest'
    console.log(`User joined: ${userName}`)
    this.sendMessageWithRateLimit(`Welcome to the room, ${userName}! 👋`)
  }

  // ユーザー退出時
  protected onUserLeave(_id: string, presence: PresenceData): void {
    const userName = presence.metas[0]?.profile?.displayName || 'Guest'
    console.log(`User left: ${userName}`)
  }

  // ルーム情報を表示
  async showRoomInfo() {
    const users = this.getPresenceList()
    const userCount = Object.keys(users).length

    let message = '📊 Room Status:\n'
    message += `• ${userCount} users online\n`
    message += `• Users: ${Object.values(users)
      .map((u) => u.profile.displayName)
      .join(', ')}`

    this.sendMessageWithRateLimit(message)
  }
}

// コマンドラインから実行
async function runBot() {
  // 環境変数またはコマンドライン引数から設定を取得
  const metatellUrl =
    process.argv[2] ||
    process.env.METATELL_URL ||
    'https://metatell.app/DfueGup/palatable-hospitable-outing'
  const botName = process.env.BOT_NAME || 'AI Assistant'
  const authToken = process.env.METATELL_AUTH_TOKEN

  let hubId: string
  let socketUrl: string

  try {
    hubId = extractHubIdFromUrl(metatellUrl)
    const url = new URL(metatellUrl)
    // Metatellの本番環境ではポート番号は不要
    socketUrl = `wss://${url.hostname}`
  } catch (_error) {
    console.error('Invalid Metatell URL:', metatellUrl)
    process.exit(1)
  }

  console.log('🚀 Starting bot...')
  console.log(`📍 URL: ${metatellUrl}`)
  console.log(`🏠 Hub ID: ${hubId}`)
  console.log(`🌐 Socket URL: ${socketUrl}`)
  console.log(`🤖 Bot Name: ${botName}`)

  const bot = new MetatellBot({
    socketUrl,
    hubId,
    authToken,
    profile: {
      displayName: botName,
      avatarId: 'ai-bot',
    },
    debug: true,
  })

  try {
    // 接続
    await bot.connect()
    console.log('✅ Connected to server')

    // 認証が必要な場合
    if (authToken) {
      await bot.signIn(authToken)
      console.log('✅ Authenticated')
    }

    // ハブに参加
    const joinResponse = await bot.joinHub()
    console.log('✅ Joined hub:', joinResponse.session_id)

    // ルームに入室
    await bot.enterRoom()
    console.log('✅ Entered room')

    // 入室メッセージ
    bot.sendMessage(`🤖 ${botName} is now online! Type "help" to see what I can do.`)

    // 定期的にルーム情報を表示（5分ごと）
    setInterval(
      () => {
        bot.showRoomInfo()
      },
      5 * 60 * 1000,
    )

    // カスタムコマンドを追加
    bot.addResponseHandler(/!status|!info/i, () => {
      const users = bot.getPresenceList()
      return `Room has ${Object.keys(users).length} users online`
    })

    bot.addResponseHandler(/!time|!date/i, () => {
      return `Current time: ${new Date().toLocaleString()}`
    })

    // プロセス終了時のクリーンアップ
    process.on('SIGINT', async () => {
      console.log('\n👋 Shutting down...')
      bot.sendMessage('Goodbye everyone! See you next time! 👋')
      await new Promise((resolve) => setTimeout(resolve, 1000))
      bot.disconnect()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      bot.disconnect()
      process.exit(0)
    })
  } catch (error) {
    console.error('❌ Bot error:', error)
    bot.disconnect()
    process.exit(1)
  }
}

// エントリーポイント
if (require.main === module) {
  runBot().catch(console.error)
}
