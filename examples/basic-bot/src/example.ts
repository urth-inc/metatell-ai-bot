#!/usr/bin/env node

import './websocket-polyfill.js'
import {
  type ConnectionOptions,
  CoreServiceFactory,
  createAgentClient,
  DefaultLoggerProvider,
  getLogger,
  registerLoggerProvider,
} from '@metatell/sdk'

// Register logger provider
registerLoggerProvider(new DefaultLoggerProvider(), { allowOverwrite: true })

const logger = getLogger('Example')

async function main() {
  // Configuration
  const roomUrl = process.env.METATELL_ROOM_URL || 'https://metatell.app/LWF5w8n/'
  const authToken = process.env.METATELL_AUTH_TOKEN

  if (!authToken) {
    logger.error('METATELL_AUTH_TOKEN environment variable is required')
    process.exit(1)
  }

  // Parse room URL to get hub ID
  const url = new URL(roomUrl)
  const hubId = url.pathname.split('/')[1]
  const serverUrl = `wss://${url.host}`

  // Create configuration
  const config = {
    serverUrl: serverUrl,
    hubUrl: roomUrl,
    hubId: hubId,
    profile: {
      displayName: 'Example Bot',
      avatarId: 'bot',
    },
  }

  // Create service factory with configuration
  const _factory = new CoreServiceFactory(config)

  // Create agent client
  const client = createAgentClient(config)

  // Connect to the room
  try {
    const options: ConnectionOptions = {
      url: roomUrl,
      serverUrl: roomUrl.replace('https:', 'wss:'),
      hubUrl: roomUrl,
      hubId: roomUrl.split('/')[3], // Extract hub ID from URL
    }

    await client.connect(options)
    logger.info('Successfully connected to the room')

    // Keep the bot running
    process.on('SIGINT', async () => {
      logger.info('Shutting down...')
      await client.disconnect()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      logger.info('Shutting down...')
      await client.disconnect()
      process.exit(0)
    })
  } catch (error) {
    logger.error('Failed to connect:', error)
    process.exit(1)
  }
}

// Run the example
main().catch((error) => {
  logger.error('Unhandled error:', error)
  process.exit(1)
})
