/**
 * Quick start example for the new MetatellClient API
 */

import { createMetatellClient } from '@metatell/sdk'

async function main() {
  // 1. Create client
  const client = createMetatellClient({
    serverUrl: 'wss://metatell.app',
    roomId: 'test-room',
    token: 'your-auth-token',
    username: 'MyBot',
    debug: true,
  })

  // 2. Set up event listeners
  client.on('connected', () => {
    console.log('Connected to Metatell!')
  })

  client.on('disconnected', () => {
    console.log('Disconnected from Metatell')
  })

  // 3. Listen for mentions
  client.chat.onMention(({ from, text, reply }) => {
    console.log(`${from.name} mentioned me: ${text}`)
    reply(`Hello ${from.name}! You said: ${text}`)
  })

  // 4. Connect
  try {
    await client.connect()

    // 5. Get room users
    const users = await client.room.getUsers()
    console.log(`Users in room: ${users.map((u) => u.name).join(', ')}`)

    // 6. Send a greeting
    await client.chat.send('Hello everyone! I am a bot using the new SDK.')

    // 7. Play an animation
    await client.avatar.play({
      name: 'wave',
      loop: false,
    })

    // 8. Move avatar
    await client.avatar.moveTo({ x: 10, y: 0, z: 5 })
  } catch (error) {
    console.error('Failed to connect:', error)
  }
}

// Run the example
main().catch(console.error)
