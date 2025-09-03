#!/usr/bin/env node
import { createMetatellClient } from '@metatell/sdk'

async function main() {
  // Get URL from command line arguments
  const url = process.argv[2]
  if (!url) {
    console.error('Usage: npm start <metatell-room-url>')
    console.error('Example: npm start https://metatell.app/LWF5w8n')
    process.exit(1)
  }

  console.log('Creating Metatell bot client...')

  // Parse URL to extract components
  const urlObj = new URL(url)
  const serverUrl = `wss://${urlObj.host}`
  const pathParts = urlObj.pathname.split('/').filter(Boolean)
  const roomId = pathParts[0] || 'default'

  // Create client using simple SDK facade
  const client = createMetatellClient({
    serverUrl: serverUrl,
    roomId: roomId,
    token: process.env.TOKEN, // オプション - 未設定なら未ログイン入室
    username: 'MetatellBot',
    debug: process.argv.includes('--debug'),
  })

  // Handle shutdown gracefully
  const shutdown = async () => {
    console.log('\nShutting down bot...')
    await client.disconnect()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    console.log(`Connecting to: ${url}`)
    await client.connect()
    console.log('Bot connected successfully! Use Ctrl+C to exit.')

    // Basic message handling - reply to mentions
    client.chat.onMention(async ({ from, text, reply }) => {
      console.log(`Message from ${from.name}: ${text}`)
      await reply(`Hello ${from.name}! You said: ${text}`)
    })

    // Keep the process alive
    setInterval(() => {
      // Heartbeat to keep process alive
    }, 30000)
  } catch (error) {
    console.error('Failed to start bot:', error)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
