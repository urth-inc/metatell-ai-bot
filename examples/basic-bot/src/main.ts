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
      // await client.avatar.play({ id: '31a7e9af-cd65-4efa-ad9c-132f21d03766', loop: false }) // 感謝するアニメーション(idはアバター依存なので適宜変更)
    })

    let isMoving = false

    // 利用可能なアニメーションを確認
    const animations = await client.avatar.getAvailableAnimations()
    console.log(
      'Available animations:',
      animations.map((a) => `${a.id}: ${a.name}`),
    )

    // アニメーション制御用の関数
    const playAnimation = async (animationId: string) => {
      try {
        await client.avatar.play({ id: animationId, loop: true })
      } catch (error) {
        console.warn(`Animation ${animationId} not available:`, error)
      }
    }

    setInterval(async () => {
      const users = client.getUsers()
      const meInfo = await client.getInfo()

      // 自分以外のユーザーを探す
      const otherUser = users.find((user) => user.name !== meInfo.name)
      if (!otherUser?.position) {
        // ユーザーがいない場合は待機
        if (isMoving) {
          isMoving = false
          await playAnimation('idle')
        }
        return
      }

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

      // 相手の方を向く（常に向きを調整）
      await client.avatar.lookAt({
        x: otherUser.position.x,
        y: otherUser.position.y,
        z: otherUser.position.z,
      })

      // 距離に応じて移動とアニメーションを制御
      const move_threshold = 1.0
      const slow_move_threshold = 3.0 // 3m以内はゆっくり移動

      if (distance > move_threshold) {
        // 移動が必要
        if (!isMoving) {
          isMoving = true
          await playAnimation('walking') // 歩行アニメーション開始
        }

        // 段階的に移動（ゆっくり近づく）
        const moveSpeed = distance < slow_move_threshold ? 0.2 : 1.0 // 近い時は遅く
        const moveRatio = Math.min(moveSpeed, distance) / distance

        const stepPosition = {
          x: currentPosition.x + dx * moveRatio,
          y: currentPosition.y + dy * moveRatio,
          z: currentPosition.z + dz * moveRatio,
        }

        await client.avatar.moveTo(stepPosition)
      } else {
        // 十分近い場合は停止
        if (isMoving) {
          isMoving = false
          await playAnimation('idle') // 待機アニメーション
        }
      }
    }, 200) // 200ms間隔で更新
  } catch (error) {
    console.error('❌ Connection failed:', error)
    process.exit(1)
  }
}

main().catch(console.error)
