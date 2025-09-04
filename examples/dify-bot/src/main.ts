#!/usr/bin/env node
import { createMetatellClient } from '@metatell/bot-sdk'
import { config } from './config/index.js'
import { AvatarHandler } from './handlers/avatar-handler.js'
import { ChatHandler } from './handlers/chat-handler.js'

async function main() {
  const url = process.argv[2]
  if (!url) {
    console.error('使い方: npm start <metatell-room-url>')
    process.exit(1)
  }

  const urlObj = new URL(url)
  const serverUrl = `wss://${urlObj.host}`
  const roomId = urlObj.pathname.split('/')[1]

  if (!roomId) {
    console.error('ルームIDが見つかりません')
    process.exit(1)
  }

  // Dify APIキーのチェック
  if (!config.dify.apiKey || !config.dify.appId) {
    console.error('❌ 環境変数が設定されていません')
    console.error('以下の環境変数を.envファイルに設定してください:')
    console.error('- DIFY_API_KEY: DifyのAPIキー')
    console.error('- DIFY_APP_ID: DifyのアプリID')
    process.exit(1)
  }

  const client = createMetatellClient({
    serverUrl,
    roomId,
    username: config.bot.username,
    debug: process.argv.includes('--debug'),
  })

  let chatHandler: ChatHandler | null = null
  let avatarHandler: AvatarHandler | null = null

  const shutdown = async () => {
    console.log('\nShutting down...')

    // ハンドラーをクリーンアップ
    if (avatarHandler) {
      avatarHandler.stop()
    }

    await client.disconnect()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    await client.connect()
    console.log('✅ 接続成功')
    console.log(`🤖 Bot名: ${config.bot.username}`)
    console.log(`🔗 Dify API: ${config.dify.apiUrl}`)

    // ハンドラーを初期化
    chatHandler = new ChatHandler(client)
    avatarHandler = new AvatarHandler(client)

    await chatHandler.initialize()
    await avatarHandler.initialize()

    console.log('🎉 Dify Botが起動しました！')
    console.log('メンションしてメッセージを送ると、Difyが応答します。')
  } catch (error) {
    console.error('❌ Connection failed:', error)
    process.exit(1)
  }
}

main().catch(console.error)
