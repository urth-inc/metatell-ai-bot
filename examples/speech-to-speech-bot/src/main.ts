#!/usr/bin/env node
import { SpeechToSpeechBot } from './speech-to-speech-bot.js'

async function main() {
  console.log('🎤 Speech-to-Speech Bot')
  console.log('======================')

  const url = process.argv[2]
  if (!url) {
    console.error('使い方: npm start <metatell-room-url>')
    console.error('例: npm start https://metatell.app/your-room-id')
    process.exit(1)
  }

  const geminiApiKey = process.env.GEMINI_API_KEY
  if (!geminiApiKey) {
    console.error('❌ GEMINI_API_KEY環境変数が設定されていません')
    console.error('export GEMINI_API_KEY=your-api-key を実行してください')
    process.exit(1)
  }

  const googleCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!googleCredentials) {
    console.error('❌ GOOGLE_APPLICATION_CREDENTIALS環境変数が設定されていません')
    console.error('export GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json を実行してください')
    process.exit(1)
  }

  const urlObj = new URL(url)
  const serverUrl = `wss://${urlObj.host}`
  const roomId = urlObj.pathname.split('/')[1]

  if (!roomId) {
    console.error('ルームIDが見つかりません')
    process.exit(1)
  }

  // ボットを作成
  const bot = new SpeechToSpeechBot(
    serverUrl,
    roomId,
    process.env.METATELL_USERNAME || 'SpeechToSpeechBot',
    geminiApiKey,
  )

  try {
    // 接続
    console.log('⏳ ルームに接続中...')
    await bot.start()
    console.log('✅ 接続成功！')

    console.log('\n📢 音声認識→LLM→音声合成モード')
    console.log('  話しかけると自動的に処理されます')
    console.log('  q: 終了（Ctrl+Cでも可）')
    console.log('')

    console.log('🚶 ボットがあなたに近づきます！')

    // コマンド入力待機
    const stdin = process.stdin
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    stdin.on('data', async (key: string) => {
      // Ctrl+C or q
      if (key === '\u0003' || key === 'q') {
        console.log('\n⏹️ 終了中...')
        await bot.disconnect()
        process.exit(0)
      }
    })

    // プロセスを維持
    await new Promise<void>(() => {})
  } catch (error) {
    console.error('❌ エラー:', error)
  } finally {
    await bot.disconnect()
  }
}

main().catch(console.error)
