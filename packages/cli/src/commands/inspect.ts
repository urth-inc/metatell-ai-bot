/**
 * Room inspection command
 */

import { createMetatellClient } from '@metatell/bot-sdk'
import type { CliOptions } from '../types.js'
import { parseUrl } from '../utils/url.js'

export async function inspectCommand(url: string, options: CliOptions) {
  console.log('Inspecting room:', url)

  try {
    const { serverUrl, roomId } = parseUrl(url)

    const client = createMetatellClient({
      serverUrl,
      roomId,
      token: options.token || process.env.METATELL_TOKEN || '',
      username: 'MetatellInspector',
      debug: false, // Keep quiet for inspection
    })

    await client.connect()

    console.log('\n=== Room Information ===')
    console.log('Room ID:', roomId)
    console.log('Server:', serverUrl)
    console.log('Session:', client.getSessionId())

    const users = client.getUsers()
    console.log('\n=== User Presence ===')
    console.log(`Total users: ${users.length}`)

    const humans = users.filter((u) => !u.isBot)
    const bots = users.filter((u) => u.isBot)

    console.log(`Humans: ${humans.length}`)
    console.log(`Bots: ${bots.length}`)

    if (users.length > 0) {
      console.log('\nDetailed list:')
      users.forEach((user) => {
        const type = user.isBot ? '[Bot]' : '[Human]'
        console.log(`  ${type} ${user.name || 'Anonymous'} (${user.id})`)
      })
    }

    // Listen for a few seconds to detect activity
    console.log('\n=== Monitoring Activity (5 seconds) ===')
    let messageCount = 0
    let joinCount = 0
    let leaveCount = 0

    client.on('message', () => messageCount++)
    client.on('user-join', () => joinCount++)
    client.on('user-leave', () => leaveCount++)

    await new Promise((resolve) => setTimeout(resolve, 5000))

    console.log(`Messages: ${messageCount}`)
    console.log(`Users joined: ${joinCount}`)
    console.log(`Users left: ${leaveCount}`)

    await client.disconnect()
    console.log('\n✓ Inspection complete')
    process.exit(0)
  } catch (error) {
    console.error('Inspection failed:', error)
    process.exit(1)
  }
}
