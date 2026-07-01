# metatell Bot SDK

TypeScript and Node.js packages for building bots that connect to metatell rooms.
The SDK covers room connection, chat, presence, avatar movement, animation, and
experimental voice integration.

- API documentation: https://sdk.metatell.io/bot/
- Guides: [docs/](./docs/README.md)
- SDK package overview: [packages/sdk/README.md](./packages/sdk/README.md)

## Packages

| Package | Purpose |
| --- | --- |
| `@metatell/bot-sdk` | High-level bot SDK for most applications |
| `@metatell/bot-core` | Core services and shared types for advanced integrations |
| `@metatell/bot-realtime` | Realtime voice transport helpers |
| `@metatell/bot-cli` | Developer CLI utilities |

## Requirements

- Node.js 20 or later. Node.js 22 is recommended.
- ESM runtime.
- TypeScript 5 or later for TypeScript projects.

## Install

```bash
npm install @metatell/bot-sdk
```

Use `@metatell/bot-realtime` as well when your bot needs LiveKit voice transport:

```bash
npm install @metatell/bot-sdk @metatell/bot-realtime
```

## Quick Start

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

For runnable examples, see:

- [examples/basic-bot](./examples/basic-bot/README.md)
- [examples/voice-bot](./examples/voice-bot/README.md)
- [examples/voice-ai-bot](./examples/voice-ai-bot/README.md)
- [examples/speech-to-speech-bot](./examples/speech-to-speech-bot/README.md)
- [examples/dify-bot](./examples/dify-bot/README.md)

## Common Workflows

### Connect to a room

```ts
await client.connect()
console.log(await client.getInfo())
```

### Reply to chat messages

```ts
client.chat.onMessage(async ({ from, text, reply }) => {
  console.log(`${from.name ?? from.id}: ${text}`)
  await reply('Thanks for the message.')
})
```

### Move and animate the bot avatar

```ts
await client.avatar.moveTo({ x: 1, y: 1.6, z: -2 })
await client.avatar.rotateTo({ x: 0, y: 180, z: 0 })
await client.avatar.play({ id: 'wave', loop: false })
```

### Read room presence

```ts
const users = await client.room.getUsers()
const nearby = await client.room.getNearbyUsers(10)
```

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm check
pnpm typecheck
```

Generate the API documentation locally:

```bash
pnpm typedoc
```

## Release

See [docs/RELEASE.md](./docs/RELEASE.md) for the release workflow.

## License

MIT
