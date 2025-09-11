#!/usr/bin/env node

export function getConfig() {
  const url = process.argv[2]
  if (!url) {
    console.error('使い方: npm run demo:wav <metatell-room-url>')
    console.error('例: npm run demo:wav https://metatell.app/your-room-id')
    process.exit(1)
  }

  const urlObj = new URL(url)
  const serverUrl = `wss://${urlObj.host}`
  const roomId = urlObj.pathname.split('/')[1]

  if (!roomId) {
    console.error('ルームIDが見つかりません')
    process.exit(1)
  }

  return {
    serverUrl,
    roomId,
    username: process.env.METATELL_USERNAME || 'VoiceBot',
    token: process.env.METATELL_TOKEN,
  }
}
