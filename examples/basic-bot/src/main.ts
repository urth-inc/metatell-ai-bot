#!/usr/bin/env node
import { createMetatellClient, type User } from '@metatell/bot-sdk'

async function main() {
  const url = process.argv[2]
  if (!url) {
    console.error('使い方: npm start <metatell-room-url>')
    process.exit(1)
  }

  const urlObj = new URL(url)
  const serverUrl = `wss://${urlObj.host}`
  const roomId = urlObj.pathname.split('/')[1]

  console.log(roomId)

  if (!roomId) {
    console.error('ルームIDが見つかりません')
    process.exit(1)
  }

  const client = createMetatellClient({
    serverUrl,
    roomId,
    username: 'BasicBot',
    debug: process.argv.includes('--debug'),
  })

  const shutdown = async () => {
    console.log('\nShutting down...')
    await client.disconnect()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    await client.connect()
    console.log('✅ 接続成功')

    client.chat.onMention(async ({ from, text, reply }) => {
      console.log(`💬 ${from.name}: ${text}`)
      await reply(`${from.name} さんこんにちは！👋`)
    })

    setInterval(async () => {
      let notMeFirstUser: User | undefined
      const meInfo = await client.getInfo()
      client.getUsers().forEach((user) => {
        console.log(user)
        if (user.name !== meInfo.name) {
          notMeFirstUser = user
        }
      })

      if (!notMeFirstUser?.position) return
      client.avatar.moveTo({ x: 0.1, y: 0.1, z: notMeFirstUser.position.z })
    }, 100)
  } catch (error) {
    console.error('❌ Connection failed:', error)
    process.exit(1)
  }
}

main().catch(console.error)
