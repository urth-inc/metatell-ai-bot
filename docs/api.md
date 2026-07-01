# API Overview

The SDK exposes two API layers:

1. `MetatellClient`: a high-level client for common bot use cases.
2. `AgentClient`: a lower-level client for advanced control and custom integrations.

Use the generated TypeDoc reference at https://sdk.metatell.io/bot/ for exact
signatures.

## `createMetatellClient(options)`

Creates a high-level `MetatellClient`.

```ts
import { createMetatellClient } from '@metatell/bot-sdk'

const client = createMetatellClient({
  serverUrl: 'wss://metatell.app',
  roomId: 'YOUR_ROOM_ID',
  username: 'GuideBot',
  token: process.env.METATELL_TOKEN,
})
```

### Options

| Option | Description |
| --- | --- |
| `serverUrl` | WebSocket origin for the metatell environment. Use an origin such as `wss://metatell.app`; do not include a room path. |
| `roomId` | Target room ID. |
| `token` | Optional access token. |
| `username` | Optional bot display name. |
| `avatarId` | Optional avatar asset ID. |
| `debug` | Enables verbose SDK logs. |
| `logger` | Custom logger implementation. |
| `reconnect` | Reconnection settings. |

### Connection

```ts
await client.connect()
await client.disconnect()

const status = client.getStatus()
const info = await client.getInfo()
const sessionId = client.getSessionId()
```

`getInfo()` returns the bot name, SDK version, room ID, and session ID when the
session is available.

### Chat

```ts
await client.chat.send('Hello from a bot.')

client.chat.onMessage(async ({ from, text, mention, reply }) => {
  if (mention) {
    await reply(`Hi ${from.name ?? from.id}.`)
  }
})
```

The message handler receives:

| Field | Description |
| --- | --- |
| `from` | User that sent the message. |
| `text` | Message text. |
| `mention` | Mention metadata when the message contains a recognized mention. |
| `reply(text)` | Convenience method for sending a chat reply. |

### Room and Presence

```ts
const users = await client.room.getUsers()
const nearby = await client.room.getNearbyUsers(10)
const cachedUsers = client.getUsers()
```

`room.getUsers()` returns the current room users asynchronously. `getUsers()`
returns the current local cache synchronously.

### Avatar

```ts
await client.avatar.select('avatar-asset-id')
await client.avatar.moveTo({ x: 1, y: 1.6, z: -2 })
await client.avatar.rotateTo({ x: 0, y: 180, z: 0 })
await client.avatar.lookAt({ x: 0, y: 1.6, z: 0 })
await client.avatar.play({ id: 'wave', loop: false })

const assets = await client.avatar.getAvailableAssets()
const animations = await client.avatar.getAvailableAnimations()
```

Positions are expressed in room coordinates. Rotations are Euler angles in
degrees.

### Events

```ts
client.on('connected', () => {})
client.on('disconnected', (reason) => {})
client.on('chat-message', (message) => {})
client.on('user-join', (user) => {})
client.on('user-leave', (user) => {})
client.on('voice:mute-changed', ({ muted }) => {})
```

Errors are primarily reported by rejected promises. The `error` event type is
available for integrations that attach their own event sources.

### Rate Limits

```ts
client.setRateLimit('chat.send', 2)
const current = client.getRateLimit('chat.send')
```

Use rate limits to avoid sending chat, movement, or animation updates too
frequently.

## Voice

Voice transport is provided through `@metatell/bot-realtime` and the
`enableVoice` helper exported by `@metatell/bot-sdk`.

```ts
import { createMetatellClient, enableVoice } from '@metatell/bot-sdk'

const client = createMetatellClient({ serverUrl, roomId, token })
await client.connect()

const voice = await enableVoice(client, {
  transport: { type: 'livekit' },
  sampleRate: 48000,
  channels: 1,
  handlers: {
    onRemotePcm: async (pcm, meta) => {
      console.log('audio frame from', meta.fromIdentity, pcm.length)
    },
    getLocalPcmStream: async function* () {
      while (true) {
        yield new Int16Array(960)
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
    },
  },
})

await voice.stop()
```

Supported sample rates are 16000, 24000, and 48000 Hz. Use 20 ms PCM frames for
the default 48000 Hz mono configuration.

## `AgentClient`

`AgentClient` exposes lower-level operations for integrations that need direct
control over connection, room membership, avatar updates, animation, and voice
events.

```ts
import { createAgentClient } from '@metatell/bot-sdk'

const client = createAgentClient({
  url: 'wss://metatell.app',
  room: 'YOUR_ROOM_ID',
  username: 'AgentBot',
})
```

Common methods:

| Area | Methods |
| --- | --- |
| Connection | `connect()`, `disconnect()`, `join(room)`, `leave()`, `getStatus()` |
| Chat | `send(text)` |
| Avatar | `move(position)`, `look(target)`, `lookAtNearest()` |
| Animation | `playAnimation(idOrOptions)`, `stopAnimation()`, `getAvailableAnimations()` |
| Voice | `sendVoiceFrame(frame)`, `muteVoice(muted)`, `isVoiceMuted()` |

Common events:

- `connection:established`
- `connection:lost`
- `connection:error`
- `room:joined`
- `room:left`
- `user:joined`
- `user:left`
- `user:updated`
- `message:received`
- `message:sent`
- `avatar:spawned`
- `avatar:moved`
- `avatar:updated`
- `voice:connected`
- `voice:disconnected`
- `voice:error`
- `voice:frame-received`
- `voice:mute-changed`

## Errors

The SDK exports a shared error hierarchy:

- `MetatellError`
- `AuthError`
- `NetworkError`
- `NotFoundError`
- `RateLimitError`
- `UnsupportedAudioFormatError`

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

## Types

Frequently used exported types include:

- `Vec3`
- `Euler`
- `User`
- `BotInfo`
- `AvatarAsset`
- `Animation`
- `CreateClientOptions`
- `PcmInput`
- `PcmInputOptions`
- `PlaybackControls`
- `MetatellClientEvents`

The SDK also re-exports typed NAF helpers from `@metatell/bot-core`. See
[NAF messages](./NAF.md).
