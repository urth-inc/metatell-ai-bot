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

  // Dify APIの設定（オプション）
  const difyApiUrl = process.env.DIFY_API_URL
  const difyApiKey = process.env.DIFY_API_KEY
  const difyAppId = process.env.DIFY_APP_ID
  if (difyApiUrl && difyApiKey && difyAppId) {
    console.log('🔗 Dify API統合が有効です')
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
    difyApiUrl,
    difyApiKey,
    difyAppId,
  )

  try {
    // 接続
    console.log('⏳ ルームに接続中...')
    await bot.start()
    console.log('✅ 接続成功！')

    console.log('\n📢 音声認識→LLM→音声合成')
    console.log('  話しかけると自動的に処理されます')
    console.log('\n💬 チャット入力')
    console.log('  テキスト入力後Enterで送信')
    console.log('  @ボット名 でメンションも可能')
    console.log('\n🔧 コマンド')
    console.log('  q: 終了（Ctrl+Cでも可）')
    console.log('')

    console.log('🚶 ボットがあなたに近づきます！')

    // 入力待機（TTYの場合のみ）
    if (process.stdin.isTTY) {
      const stdin = process.stdin
      stdin.setRawMode(false) // 通常の入力モードに設定
      stdin.resume()
      stdin.setEncoding('utf8')

      // 入力プロンプトを表示
      process.stdout.write('> ')

      let inputBuffer = ''

      stdin.on('data', async (data: string) => {
        // qのみで終了（Enterなし）を検出
        if (inputBuffer === '' && data === 'q\n') {
          console.log('\n⏹️ 終了中...')
          await bot.disconnect()
          process.exit(0)
        }

        // Ctrl+Cで終了
        if (data === '\u0003') {
          console.log('\n⏹️ 終了中...')
          await bot.disconnect()
          process.exit(0)
        }

        // 改行で送信
        if (data.includes('\n')) {
          const lines = data.split('\n')
          inputBuffer += lines[0]

          if (inputBuffer.trim() && inputBuffer.trim() !== 'q') {
            console.log('🤔 処理中...')
            const response = await bot.processChatInput(inputBuffer.trim())
            console.log(`🤖 ${response}`)
          }

          // 新しい入力行を開始
          inputBuffer = lines.slice(1).join('\n')
          process.stdout.write('> ')
        } else {
          inputBuffer += data
        }
      })
    } else {
      // TTYでない場合はCtrl+Cのシグナルをキャッチ
      process.on('SIGINT', async () => {
        console.log('\n⏹️ 終了中...')
        await bot.disconnect()
        process.exit(0)
      })
    }

    // プロセスを維持
    await new Promise<void>(() => {})
  } catch (error) {
    console.error('❌ エラー:', error)
  } finally {
    await bot.disconnect()
  }
}

main().catch(console.error)
