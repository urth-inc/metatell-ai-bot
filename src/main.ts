#!/usr/bin/env node

import './websocket-polyfill'
import { ServiceFactory } from './core/ServiceFactory'
import type { BotConfiguration } from './core/interfaces/IConfigurationProvider'

/**
 * Extract hub ID from Metatell URL
 */
function extractHubIdFromUrl(url: string): string {
  // https://metatell.app/DfueGup/palatable-hospitable-outing
  // から DfueGup を抽出
  const match = url.match(/metatell\.app\/([^/]+)/)
  if (match) {
    return match[1]
  }
  throw new Error('Invalid Metatell URL')
}

async function main() {
  // Get configuration from command line or environment
  const metatellUrl =
    process.argv[2] ||
    process.env.METATELL_URL ||
    'https://metatell.app/DfueGup/palatable-hospitable-outing'
  const botName = process.env.BOT_NAME || 'AI Assistant'
  const avatarId = process.env.AVATAR_ID || 'hsBHyUu2'
  const _authToken = process.env.METATELL_AUTH_TOKEN

  let hubId: string
  let socketUrl: string

  try {
    hubId = extractHubIdFromUrl(metatellUrl)
    const url = new URL(metatellUrl)
    // Use WebSocket protocol for Socket connection
    socketUrl = `wss://${url.hostname}`
  } catch (_error) {
    console.error('Invalid Metatell URL:', metatellUrl)
    process.exit(1)
  }

  console.log('🚀 Starting bot...')
  console.log(`📍 URL: ${metatellUrl}`)
  console.log(`🏠 Hub ID: ${hubId}`)
  console.log(`🌐 Socket URL: ${socketUrl}`)
  console.log(`🤖 Bot Name: ${botName}`)
  console.log(`👤 Avatar ID: ${avatarId}`)

  const config: BotConfiguration = {
    authUrl: socketUrl,
    hubUrl: metatellUrl,
    hubId: hubId,
    profile: {
      displayName: botName,
      avatarId,
    },
    context: {
      mobile: false,
      embed: false,
      hmd: false,
    },
  }

  // Create bot using factory
  const factory = new ServiceFactory()
  const bot = factory.createBot(config)

  // Add custom command handlers
  bot.addMessageHandler((message) => {
    if (message.toLowerCase() === 'help') {
      return `Available commands:
• help - Show this help message
• info - Show room information
• hello - Say hello!
• time - Show current time
• echo <text> - Echo your message
• calc <expression> - Simple calculator
• status - Show bot status
• move <x> <y> <z> - Move avatar to position`
    }
    return null
  })

  bot.addMessageHandler((message) => {
    if (message.toLowerCase().match(/!status|!info/)) {
      return 'Bot is running and ready!'
    }
    return null
  })

  bot.addMessageHandler((message) => {
    if (message.toLowerCase().match(/!time|!date/)) {
      return `Current time: ${new Date().toLocaleString()}`
    }
    return null
  })

  bot.addMessageHandler((message) => {
    const echoMatch = message.match(/^echo\s+(.+)$/i)
    if (echoMatch) {
      return `Echo: ${echoMatch[1]}`
    }
    return null
  })

  bot.addMessageHandler((message) => {
    const calcMatch = message.match(/^calc\s+(.+)$/i)
    if (calcMatch) {
      try {
        // Simple math evaluation (be careful with eval in production!)
        const result = Function(`"use strict"; return (${calcMatch[1]})`)()
        return `Result: ${result}`
      } catch (_error) {
        return 'Invalid math expression'
      }
    }
    return null
  })

  // Handle shutdown gracefully
  const shutdown = async () => {
    console.log('\n👋 Shutting down...')
    await bot.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    // Start the bot
    await bot.start()

    // Keep the process alive
    setInterval(() => {
      if (!bot.isActive()) {
        console.error('Bot is not active, restarting...')
        bot.start().catch(console.error)
      }
    }, 30000) // Check every 30 seconds
  } catch (error) {
    console.error('Failed to start bot:', error)
    process.exit(1)
  }
}

// Run the bot
main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
