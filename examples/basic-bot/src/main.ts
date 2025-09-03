#!/usr/bin/env node
import { createMetatellClient } from '@metatell/bot-sdk'

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

  const client = createMetatellClient({
    serverUrl,
    roomId,
    username: 'BasicBot',
    debug: process.argv.includes('--debug'),
  })

  // レート制限を設定（1秒あたりの回数）
  client.setRateLimit('moves', 2) // 移動は1秒に2回まで
  client.setRateLimit('looks', 4) // 視線は1秒に4回まで

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

    // ついてくる AIbot
    let lastPosition: { x: number; y: number; z: number } | null = null
    let lastMoveTime = 0

    setInterval(async () => {
      const users = client.getUsers()
      const meInfo = await client.getInfo()

      // 自分以外のユーザーを探す
      const otherUser = users.find((user) => user.name !== meInfo.name)
      if (!otherUser?.position) return

      const currentPosition = client.avatar.getPosition()
      if (!currentPosition) return

      // 目標位置を計算（ユーザーから1.5m離れた位置）
      const targetPosition = {
        x: otherUser.position.x + 1.5,
        y: otherUser.position.y,
        z: otherUser.position.z + 1.5,
      }

      // 現在位置と目標位置の距離を計算
      const dx = targetPosition.x - currentPosition.x
      const dy = targetPosition.y - currentPosition.y
      const dz = targetPosition.z - currentPosition.z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

      // 距離が0.5m以上離れている場合のみ移動（移動の閾値）
      const now = Date.now()
      if (distance > 0.5 && now - lastMoveTime > 500) {
        // 最低500ms間隔
        await client.avatar.moveTo(targetPosition)
        lastMoveTime = now
      }

      // 常に相手の方を向く
      if (
        !lastPosition ||
        Math.abs(otherUser.position.x - lastPosition.x) > 0.1 ||
        Math.abs(otherUser.position.z - lastPosition.z) > 0.1
      ) {
        await client.avatar.lookAt({
          x: otherUser.position.x,
          y: otherUser.position.y,
          z: otherUser.position.z,
        })
        lastPosition = { ...otherUser.position }
      }
    }, 200)
  } catch (error) {
    console.error('❌ Connection failed:', error)
    process.exit(1)
  }
}

main().catch(console.error)
