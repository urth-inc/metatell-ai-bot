import {
  type MessagePayload,
  MetatellClient,
  type MetatellConfig,
  type PresenceData,
} from './metatell-client'

// カスタムボットクラスの例
class MetatellAIBot extends MetatellClient {
  private botName: string

  constructor(config: MetatellConfig) {
    super(config)
    this.botName = config.profile?.displayName || 'AI Bot'
  }

  // メッセージハンドラーをオーバーライド
  protected handleMessage(payload: MessagePayload): void {
    console.log(`[${payload.from_session_id}] ${payload.body}`)

    // 自分のメッセージは無視
    if (payload.from_session_id === this.getSessionId()) {
      return
    }

    // メッセージに反応
    if (payload.type === 'chat') {
      if (payload.body.toLowerCase().includes('hello')) {
        this.sendMessage(`Hello! I'm ${this.botName}, an AI assistant. How can I help you?`)
      } else if (payload.body.toLowerCase().includes('help')) {
        this.sendMessage('I can help you with various tasks in this metaverse!')
      }
    }
  }

  // ユーザー参加時の処理
  protected onUserJoin(_id: string, presence: PresenceData): void {
    const userName = presence.metas[0]?.profile?.displayName || 'User'
    this.sendMessage(`Welcome ${userName}! 👋`)
  }

  // アバターを動かす
  moveToPosition(x: number, y: number, z: number): void {
    this.updateObject(`player-${this.getSessionId()}`, {
      position: { x, y, z },
    })
  }

  // 手を振るアニメーション
  waveHand(): void {
    this.spawnObject(`gesture-${Date.now()}`, '#wave-gesture', {
      position: { x: 0, y: 2, z: -2 },
    })
  }
}

// 使用例
async function main() {
  // URL: https://metatell.app/DfueGup/palatable-hospitable-outing
  // hubId は "DfueGup" の部分
  const bot = new MetatellAIBot({
    socketUrl: 'wss://metatell.app:4443', // metatell.appのWebSocketエンドポイント
    hubId: 'DfueGup', // URLから抽出したHub ID
    profile: {
      displayName: 'AI Assistant Bot',
      avatarId: 'bot-avatar',
    },
    debug: true,
  })

  try {
    // 接続
    await bot.connect()
    console.log('✅ Connected to server')

    // ハブに参加
    const joinResponse = await bot.joinHub()
    console.log('✅ Joined hub:', joinResponse.session_id)

    // ルームに入室
    await bot.enterRoom()
    console.log('✅ Entered room')

    // 挨拶メッセージを送信
    bot.sendMessage('AI Bot has joined the room! Type "hello" or "help" to interact with me.')

    // アバターを初期位置に配置
    bot.moveToPosition(0, 0, -3)

    // 定期的に存在を示す
    setInterval(() => {
      const users = bot.getPresenceList()
      console.log(`Currently ${Object.keys(users).length} users in room`)
    }, 30000)

    // プロセス終了時のクリーンアップ
    process.on('SIGINT', async () => {
      console.log('\n👋 Shutting down...')
      bot.sendMessage('Goodbye everyone!')
      bot.disconnect()
      process.exit(0)
    })
  } catch (error) {
    console.error('❌ Error:', error)
    bot.disconnect()
    process.exit(1)
  }
}

// 認証が必要な場合の例
async function _authenticatedExample() {
  const bot = new MetatellAIBot({
    socketUrl: 'wss://secure-metatell.com:4443',
    hubId: 'private-hub-id',
    profile: {
      displayName: 'Secure Bot',
    },
  })

  try {
    await bot.connect()

    // 認証トークンでサインイン
    const authToken = process.env.METATELL_AUTH_TOKEN || ''
    await bot.signIn(authToken)

    // ハブに参加
    await bot.joinHub()
    await bot.enterRoom()

    bot.sendMessage('Authenticated bot is ready!')
  } catch (error) {
    console.error('Authentication error:', error)
  }
}

// エントリーポイント
if (require.main === module) {
  main().catch(console.error)
}
