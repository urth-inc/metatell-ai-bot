import { ConversationBot } from './conversation-bot.js'

// 環境変数から設定を読み込み
const SERVER_URL = process.env.METATELL_SERVER_URL || 'wss://metatell.app'
const ROOM_ID = process.env.METATELL_ROOM_ID || 'demo-room'
const USERNAME = process.env.METATELL_USERNAME || 'VoiceBot'
const TOKEN = process.env.METATELL_TOKEN

/**
 * Voice I/O Bridge デモボット
 *
 * このデモは以下の機能を示します：
 * 1. 音声入力を受信してSTT処理
 * 2. AI応答を生成
 * 3. TTSで音声に変換して送信
 * 4. ミュート制御
 *
 * 実際の実装では：
 * - RealtimeTransportの詳細はSDK内部で管理
 * - STT/TTSは実際のサービス（Google, Azure, OpenAI等）を使用
 * - AI応答はLLM（GPT-4, Claude等）を使用
 */
async function main() {
  console.log('🚀 Voice Bot Demo')
  console.log('================')
  console.log('This demo shows Voice I/O Bridge functionality with mock STT/TTS')
  console.log('')

  // ボットを作成
  const bot = new ConversationBot(SERVER_URL, ROOM_ID, USERNAME, TOKEN)

  // 接続
  await bot.connect()

  // デモ: 5秒後にミュート、さらに3秒後にミュート解除
  setTimeout(async () => {
    await bot.setMuted(true)

    setTimeout(async () => {
      await bot.setMuted(false)
    }, 3000)
  }, 5000)

  // シャットダウンハンドラー
  process.on('SIGINT', async () => {
    console.log('\n⏹️  Stopping bot...')
    await bot.disconnect()
    process.exit(0)
  })

  // 使い方の説明
  console.log('\n📋 Instructions:')
  console.log('- The bot will process incoming audio through mock STT')
  console.log('- Recognized text will trigger AI responses')
  console.log('- Responses will be converted to audio through mock TTS')
  console.log('- Press Ctrl+C to stop')
  console.log('')
}

// エラーハンドリング
main().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})
