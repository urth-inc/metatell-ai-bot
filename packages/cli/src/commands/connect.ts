/**
 * Simple connection test command
 */

import { createMetatellClient } from '@metatell/bot-sdk'
import type { CliOptions } from '../types.js'
import { parseUrl } from '../utils/url.js'

export async function connectCommand(url: string, options: CliOptions) {
  console.log('Connecting to:', url)

  try {
    const { serverUrl, roomId } = parseUrl(url)

    const client = createMetatellClient({
      serverUrl,
      roomId,
      token: options.token || process.env.METATELL_TOKEN || '',
      username: 'MetatellCLI',
      debug: options.debug,
    })

    await client.connect()
    console.log('✓ Connected successfully!')
    console.log('Session ID:', client.getSessionId())
    console.log('Status:', client.getStatus())

    // Show presence info
    const users = client.getUsers()
    console.log(`\nUsers in room: ${users.length}`)
    users.forEach((user) => {
      console.log(`- ${user.name || 'Anonymous'} (${user.id})${user.isBot ? ' [Bot]' : ''}`)
    })

    // Clean disconnect
    await client.disconnect()
    console.log('\n✓ Disconnected successfully')
    process.exit(0)
  } catch (error) {
    console.error('Connection failed:', error)
    process.exit(1)
  }
}
