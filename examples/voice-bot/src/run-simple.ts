import { SimpleVoiceBot } from './simple-bot.js'

// 環境変数から設定を読み込み
const SERVER_URL = process.env.METATELL_SERVER_URL || 'wss://hub.metatell.ai'
const ROOM_ID = process.env.METATELL_ROOM_ID || 'demo-room'
const USERNAME = process.env.METATELL_USERNAME || 'SimpleVoiceBot'
const TOKEN = process.env.METATELL_TOKEN

async function main() {
  console.log('🚀 Simple Voice Bot Demo')
  console.log('=======================')
  console.log('')

  const bot = new SimpleVoiceBot(SERVER_URL, ROOM_ID, USERNAME, TOKEN)
  await bot.start()

  // デモ: 音声応答をシミュレート
  setTimeout(() => {
    console.log('\n📢 Simulating voice input...')
    // 実際の実装では、リモート音声が onRemotePcm 経由で到着
  }, 2000)

  // シャットダウンハンドラー
  process.on('SIGINT', async () => {
    console.log('\n⏹️  Stopping bot...')
    await bot.stop()
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})
