# Getting Started

This guide creates a bot that connects to a metatell room and replies when it is
mentioned in chat.

## Prerequisites

- Node.js 20 or later. Node.js 22 is recommended.
- A metatell room URL.
- A room access token if your metatell environment requires authentication.

## Install

```bash
npm install @metatell/bot-sdk
```

For voice bots, install the realtime package as well:

```bash
npm install @metatell/bot-sdk @metatell/bot-realtime
```

## Create a Bot

```ts
import { createMetatellClient } from '@metatell/bot-sdk'

const client = createMetatellClient({
  serverUrl: 'wss://metatell.app',
  roomId: 'YOUR_ROOM_ID',
  username: 'GuideBot',
  token: process.env.METATELL_TOKEN,
})

await client.connect()
const botInfo = await client.getInfo()

client.chat.onMessage(async ({ from, text, mention, reply }) => {
  if (mention?.sessionId !== botInfo.sessionId) return

  await reply(`Hello ${from.name ?? 'there'}. You said: ${text}`)
})
```

## Configuration

| Option | Required | Description |
| --- | --- | --- |
| `serverUrl` | Yes | WebSocket origin for your metatell environment, for example `wss://metatell.app`. |
| `roomId` | Yes | Room identifier from the metatell room URL. |
| `token` | No | Access token for environments that require authentication. Store it in an environment variable. |
| `username` | No | Display name for the bot avatar. |
| `avatarId` | No | Avatar asset ID to select after connection. |
| `debug` | No | Enables verbose SDK logs. |
| `reconnect` | No | Reconnection settings for transient network failures. |

## Parse a Room URL

If your application receives a full room URL, derive `serverUrl` and `roomId`
before creating the client:

```ts
const roomUrl = new URL(process.env.METATELL_ROOM_URL!)
const serverUrl = `wss://${roomUrl.host}`
const roomId = roomUrl.pathname.split('/').filter(Boolean)[0]

if (!roomId) {
  throw new Error('Room ID was not found in METATELL_ROOM_URL')
}
```

## Run the Basic Example

```bash
cd examples/basic-bot
npm install
npm start -- https://metatell.app/YOUR_ROOM_ID
```

Add `-- --debug` after the room URL to print verbose logs:

```bash
npm start -- https://metatell.app/YOUR_ROOM_ID --debug
```

## Next Steps

- Use [API overview](./api.md) for available chat, room, avatar, voice, and event APIs.
- Use [Examples](./examples.md) for command handling, following users, voice streaming, and Dify integration.
- Use [Troubleshooting](./troubleshooting.md) if connection, authentication, or voice setup fails.
