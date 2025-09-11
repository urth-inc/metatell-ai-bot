#!/usr/bin/env node
import { GeminiVoiceBot } from './gemini-voice-bot.js'

async function main() {
  console.log('🎤 Gemini Voice AI Bot')
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
    console.error('export GEMINI_API_KEY=your-gemini-api-key を実行してください')
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
  const bot = new GeminiVoiceBot(
    serverUrl,
    roomId,
    process.env.METATELL_USERNAME || 'GeminiVoiceAI',
    geminiApiKey,
  )

  try {
    // 接続
    console.log('⏳ ルームに接続中...')
    await bot.start()
    console.log('✅ 接続成功！')

    console.log('\n📢 コマンド:')
    console.log('  g: Gemini会話を開始（録音開始）')
    console.log('  j: 録音を停止してGeminiに送信')
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

      // Gemini会話開始
      if (key === 'g') {
        console.log('\n🎙️ Gemini会話開始 - 話してください...')
        await bot.startGeminiConversation()
      }

      // Gemini会話終了と送信
      if (key === 'j') {
        console.log('\n📤 Geminiに送信中...')
        await bot.stopGeminiConversation()
      }
    })

    // プロセスを維持
    await new Promise(() => {})
  } catch (error) {
    console.error('❌ エラー:', error)
  } finally {
    await bot.disconnect()
  }
}

main().catch(console.error)
