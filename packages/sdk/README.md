# @metatell/bot-sdk

High-level TypeScript SDK for building Node.js bots that connect to metatell
rooms.

## Requirements

- Node.js 20 or later. Node.js 22 is recommended.
- ESM runtime.
- TypeScript 5 or later for TypeScript projects.

## Install

```bash
npm install @metatell/bot-sdk
# or
pnpm add @metatell/bot-sdk
# or
yarn add @metatell/bot-sdk
```

Install `@metatell/bot-realtime` as well for LiveKit voice transport:

```bash
npm install @metatell/bot-sdk @metatell/bot-realtime
```

## Quick Start

```ts
import { createMetatellClient } from '@metatell/bot-sdk'

async function main() {
  const client = createMetatellClient({
    serverUrl: 'wss://metatell.app',
    roomId: 'YOUR_ROOM_ID',
    username: 'GuideBot',
    token: process.env.METATELL_TOKEN,
    debug: true,
  })

  await client.connect()

  const botInfo = await client.getInfo()
  console.log('Connected as:', botInfo.name)

  client.chat.onMessage(async ({ from, text, mention, reply }) => {
    if (mention?.sessionId === botInfo.sessionId) {
      await reply(`Hello ${from.name ?? 'there'}. You said: ${text}`)
    }
  })

  await client.avatar.moveTo({ x: 1, y: 1.6, z: -2 })
  await client.avatar.rotateTo({ x: 0, y: 180, z: 0 })
  await client.avatar.play({ id: 'wave', loop: false })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

## Main Features

- Chat send and receive APIs.
- Room presence and nearby-user queries.
- Avatar selection, movement, rotation, and animation playback.
- Typed events through `MetatellClientEvents`.
- Error classes for authentication, network, not found, rate limit, and audio
  format failures.
- Logging provider hooks.
- Optional realtime voice integration through `enableVoice()`.

## Connection

```ts
await client.connect()
await client.disconnect()

const status = client.getStatus()
const info = await client.getInfo()
const sessionId = client.getSessionId()
```

## Chat

```ts
await client.chat.send('Hello from a bot.')

client.chat.onMessage(async ({ from, text, reply }) => {
  console.log(`${from.name ?? from.id}: ${text}`)
  await reply('Thanks for the message.')
})
```

## Avatar Control

```ts
await client.avatar.select('avatar-asset-id')
await client.avatar.moveTo({ x: 10, y: 0, z: 5 })
await client.avatar.rotateTo({ x: 0, y: 90, z: 0 })
await client.avatar.lookAt({ x: 0, y: 1.6, z: 0 })
await client.avatar.play({ id: 'wave', loop: true, duration: 5000 })

const assets = await client.avatar.getAvailableAssets()
const animations = await client.avatar.getAvailableAnimations()
```

`moveTo()` uses room coordinates. `rotateTo()` uses Euler angles in degrees.

## Room Presence

```ts
const users = await client.room.getUsers()
const nearby = await client.room.getNearbyUsers(10)
const cached = client.getUsers()
```

## Events

```ts
client.on('connected', () => {})
client.on('disconnected', (reason) => {})
client.on('chat-message', (message) => {})
client.on('user-join', (user) => {})
client.on('user-leave', (user) => {})
client.on('voice:mute-changed', ({ muted }) => {})
```

## Voice

```ts
import { enableVoice } from '@metatell/bot-sdk'

const voice = await enableVoice(client, {
  transport: { type: 'livekit' },
  sampleRate: 48000,
  channels: 1,
  handlers: {
    onRemotePcm: async (pcm, meta) => {
      console.log('audio frame from', meta.fromIdentity, pcm.length)
    },
  },
})

await voice.stop()
```

## Error Handling

```ts
import { AuthError, NetworkError } from '@metatell/bot-sdk'

try {
  await client.connect()
} catch (error) {
  if (error instanceof AuthError) {
    console.error('Authentication failed:', error.message)
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.message)
  } else {
    throw error
  }
}
```

## Related Packages

- [@metatell/bot-core](../core/README.md): core services and shared types.
- [@metatell/bot-cli](../cli/README.md): developer CLI.
- [@metatell/bot-realtime](../realtime/README.md): realtime voice transport.

## License

MIT
