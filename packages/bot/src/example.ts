#!/usr/bin/env node

import './websocket-polyfill.js'
import {
  CoreServiceFactory,
  createAgentClient,
  type ConnectionOptions,
  getLogger,
  registerLoggerProvider,
  DefaultLoggerProvider,
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
  const authUrl = `wss://${url.host}`
  
  // Create service factory with configuration
  const factory = new CoreServiceFactory({
    authUrl: authUrl,
    hubUrl: roomUrl,
    hubId: hubId,
    profile: {
      displayName: 'Example Bot',
      avatarId: 'bot',
    },
  })

  // Create agent client
  const client = createAgentClient(factory)

  // Connect to the room
  try {
    const options: ConnectionOptions = {
      url: roomUrl,
      authUrl: roomUrl.replace('https:', 'wss:'),
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