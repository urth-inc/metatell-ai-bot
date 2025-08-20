#!/usr/bin/env node

/**
 * Debug mode entry point - runs without CLI interface
 */

import './websocket-polyfill.js'
import { Command } from 'commander'
import { ConfigManager } from './cli/config/config.js'
import { BotServiceFactory } from './bots/BotServiceFactory.js'
import {
  type BotConfiguration,
  createAgentClient,
  registerLoggerProvider,
  getLogger,
  DefaultLoggerProvider,
} from '@metatell/sdk'

// Register default logger provider at startup
const provider = new DefaultLoggerProvider()
provider.enableConsole(true) // Always enable console in debug mode
registerLoggerProvider(provider, { allowOverwrite: true })

/**
 * Extract hub ID from Metatell URL
 */
function extractHubIdFromUrl(url: string): string {
  const match = url.match(/metatell\.app\/([^/]+)/)
  if (match) {
    return match[1]
  }
  throw new Error('Invalid Metatell URL')
}

async function main() {
  const program = new Command()

  program
    .name('metatell-ai-bot-debug')
    .description('AI bot for Metatell metaverse (Debug Mode)')
    .version('1.0.0')
    .argument('[url]', 'Metatell room URL (e.g., https://metatell.app/LWF5w8n/)')
    .option('-t, --token <token>', 'Authentication token')
    .parse(process.argv)

  const options = program.opts()
  const [url] = program.args

  // Debug mode configuration
  const flags: Record<string, string | boolean> = {}
  if (url) flags['--url'] = url
  if (options.token) flags['--token'] = options.token
  flags['--debug'] = true // Always enable debug mode

  // Load configuration
  const configManager = new ConfigManager()
  const config = configManager.getConfig(flags)

  if (!config.url) {
    program.help()
    return
  }

  const metatellUrl = config.url
  const botName = config.profile?.displayName || 'AI Assistant'
  const avatarId = config.profile?.avatarId || 'hsBHyUu2'
  const authToken = config.token

  let hubId: string
  let socketUrl: string

  try {
    hubId = extractHubIdFromUrl(metatellUrl)
    const url = new URL(metatellUrl)
    socketUrl = `wss://${url.hostname}`
  } catch (error) {
    console.error('Invalid URL format:', metatellUrl)
    process.exit(1)
  }

  // Create bot configuration
  const botConfig: BotConfiguration = {
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
    debug: true,
  }

  // Initialize BotServiceFactory
  const factory = new BotServiceFactory(botConfig)
  
  // Set debug mode
  const appSettings = factory.getService<import('@metatell/sdk').IAppSettings>('IAppSettings')
  appSettings.setDebugMode(true)
  appSettings.setLogLevel('debug')

  // Create AgentClient
  const client = createAgentClient(factory, {
    profile: {
      displayName: botName,
      avatarId,
    },
    rateLimit: config.rate
      ? {
          messages: config.rate.messagesPerSec,
          moves: config.rate.movesPerSec,
          looks: config.rate.looksPerSec,
        }
      : undefined,
  })

  // Handle shutdown gracefully
  const shutdown = async () => {
    console.log('\nShutting down...')
    await client.disconnect()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    console.log('='.repeat(80))
    console.log('DEBUG MODE - All logs will be shown in console')
    console.log('='.repeat(80))
    console.log(`Connecting to: ${metatellUrl}`)
    console.log(`Bot name: ${botName}`)
    console.log(`Avatar ID: ${avatarId}`)
    console.log('='.repeat(80))
    
    await client.connect({
      url: metatellUrl,
      token: authToken,
    })
    
    console.log('Connected successfully!')
    console.log('Bot is running in debug mode. Press Ctrl+C to stop.')
    
    // Simple command handler without CLI
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    
    let inputBuffer = ''
    
    process.stdin.on('data', async (data) => {
      const key = data.toString()
      
      // Ctrl+C
      if (key === '\u0003') {
        await shutdown()
        return
      }
      
      // Enter key
      if (key === '\r' || key === '\n') {
        const command = inputBuffer.trim()
        inputBuffer = ''
        
        if (command) {
          console.log(`\nExecuting command: ${command}`)
          
          if (command === '/users') {
            const users = client.getUsers()
            console.log(`Users in room (${users.length}):`)
            users.forEach((user: any) => {
              console.log(`  - ${user.nickname || 'Unknown'} (${user.id})`)
              console.log(`    Position: (${user.position.x.toFixed(1)}, ${user.position.y.toFixed(1)}, ${user.position.z.toFixed(1)})`)
            })
          } else if (command.startsWith('/say ')) {
            const message = command.substring(5)
            await client.say(message)
            console.log(`Sent: ${message}`)
          } else {
            console.log('Unknown command. Available commands: /users, /say <message>')
          }
        }
        
        process.stdout.write('\n> ')
      } else if (key === '\u007f') { // Backspace
        if (inputBuffer.length > 0) {
          inputBuffer = inputBuffer.slice(0, -1)
          process.stdout.write('\r> ' + inputBuffer + ' ')
          process.stdout.write('\r> ' + inputBuffer)
        }
      } else {
        inputBuffer += key
        process.stdout.write(key)
      }
    })
    
    process.stdout.write('> ')
    
  } catch (error) {
    console.error('Failed to connect:', error)
    process.exit(1)
  }
}

// Run the debug mode
main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})