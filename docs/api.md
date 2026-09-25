# API Overview

The SDK exposes two API layers:

1. `MetatellClient`: a high-level client for common bot use cases.
2. `AgentClient`: a lower-level client for advanced control and custom integrations.

Use the generated TypeDoc reference at https://sdk.metatell.io/bot/ for exact
signatures.

## `createMetatellClient(options)`

Creates a high-level `MetatellClient`. It throws `ProtocolError` when
`serverUrl` or `roomId` is missing.

```ts
import { createMetatellClient } from '@metatell/bot-sdk'

const client = createMetatellClient({
  serverUrl: 'wss://metatell.app',
  roomId: 'YOUR_ROOM_ID',
  username: 'GuideBot',
  authToken: process.env.METATELL_TOKEN,
})
```

### Options

| Option | Description |
| --- | --- |
| `serverUrl` | WebSocket origin for the metatell environment. Use an origin such as `wss://metatell.app`; do not include a room path. |
| `roomId` | Target room ID. |
| `authToken` | Optional OIDC access token sent when joining the room. It authenticates the bot so it receives room-role permissions such as text chat. |
| `username` | Optional bot display name. Defaults to `MetatellBot`. |
| `avatarId` | Optional avatar ID. When omitted, the first organization avatar is used. |
| `avatarSrc` | Optional GLTF URL used when `avatarId` is an organization avatar UUID. |
| `defaultAvatarId` | Optional fallback avatar ID used when neither `avatarId` nor an organization avatar is available. |
| `debug` | Enables verbose SDK logs. |

### Connection

```ts
await client.connect()
await client.disconnect()

const status = client.getStatus() // { connected, connecting }
const info = await client.getInfo()
const sessionId = client.getSessionId()
```

`connect()` accepts optional `ConnectOptions`:

| Option | Description |
| --- | --- |
| `mode` | `'enter'` (default) joins the room and spawns the avatar. `'join-only'` joins without spawning an avatar. |
| `initialPosition` | Spawn position for `'enter'` mode. It cannot be combined with `'join-only'`. |
| `expectedSceneIdentity` | Rejects with a `NavigationError` (`SCENE_CHANGED`) when the room's current scene does not match. |

`connect()` rejects with `AuthenticationError` for authentication failures,
`TransportError` for other connection failures, and `NavigationError` for a
scene mismatch.

`getInfo()` returns the bot name, a version string, the room ID, and the
session ID when the session is available.

### Chat

```ts
await client.chat.send('Hello from a bot.')

client.chat.onMessage(async ({ from, text, mention, reply }) => {
  if (mention) {
    await reply(`Hi ${from.name}.`)
  }
})
```

The message handler receives every chat message in the room:

| Field | Description |
| --- | --- |
| `from` | User that sent the message. |
| `text` | Message text with the mention token removed. |
| `mention` | `{ sessionId, name }` when the message contains a `[@name](session-id)` mention. |
| `reply(text)` | Sends a chat message to the room. |

### Room and Presence

```ts
const users = await client.room.getUsers()
const nearby = await client.room.getNearbyUsers(10)
const cachedUsers = client.getUsers()
```

`room.getUsers()` returns the current room users asynchronously. `getUsers()`
returns the same local cache synchronously. `getNearbyUsers(radius)` uses a
default radius of 10 and returns all users while the bot avatar is not spawned.

### Avatar

```ts
await client.avatar.select('avatar-asset-id')
await client.avatar.moveTo({ x: 1, y: 1.6, z: -2 })
await client.avatar.rotateTo({ x: 0, y: 180, z: 0 })
await client.avatar.lookAt({ x: 0, y: 1.6, z: 0 })
const position = client.avatar.getPosition()
const assets = await client.avatar.getAvailableAssets()
const animations = await client.avatar.getAvailableAnimations()
await client.avatar.play({ id: 'walking', loop: false })
```

Positions are expressed in room coordinates (meters). Rotations are Euler
angles in degrees. Only `idle` and `walking` are presets; avatar-specific
animation IDs must come from `getAvailableAnimations()`. `play()` requires an
`id`; URL-based animations are not supported. An unknown animation rejects with
a `MetatellError` whose `code` is `ANIMATION_NOT_FOUND`.

### Scene Navigation

`room.getSceneInfo()` returns the scene reported when the bot joined the room.
`room.prepareNavigation()` fetches and parses the scene GLB, and
`createNavigationRuntime()` from `@metatell/bot-sdk/navigation` samples points,
projects positions, and finds paths on the navmesh. See the
[`@metatell/bot-sdk` package README](../packages/sdk/README.md) for the full
workflow, allowed origins, and protected-scene handling.

### Events

```ts
client.on('connected', () => {})
client.on('disconnected', () => {})
client.on('chat-message', ({ from, text, mention }) => {})
client.on('message', (data) => {})
client.on('user-join', (user) => {})
client.on('user-leave', (user) => {})
client.on('user-moved', (user) => {
  console.log(user.name, user.position)
})
client.on('voice:mute-changed', ({ muted }) => {})
client.on('room-scene-changed', ({ previousIdentity, current }) => {})
```

Use `client.off(event, listener)` to unsubscribe. `message` receives raw room
message data; `chat-message` receives parsed chat messages.

Position updates are pushed over NAF. `user-moved` and `getNearbyUsers()` use
the presence session ID (same space as `user-join` / `user-leave`) when it can
be resolved. `getNearbyUsers()` reads a snapshot of the same cache.

Errors are reported by rejected promises. `MetatellClient` does not emit an
`error` event.

### Rate Limits

```ts
client.setRateLimit('messages', 2)
const current = client.getRateLimit('messages')
```

Supported keys are `messages`, `moves`, and `looks`. `setRateLimit()` stores a
per-second value that `getRateLimit()` returns. The high-level client does not
currently throttle calls based on these values; use `TokenBucketRateLimiter` or
`RateLimitedQueue` to throttle your own loops. `AgentClient` applies these
limits to `send()`, `move()`, `look()`, and `lookAtNearest()`.

## Voice

Voice transport is provided through `@metatell/bot-realtime` and the
`enableVoice` helper exported by `@metatell/bot-sdk`. Call it after
`connect()`, because the LiveKit token request uses the bot session ID.

```ts
import { createMetatellClient, enableVoice } from '@metatell/bot-sdk'

const client = createMetatellClient({ serverUrl, roomId, authToken })
await client.connect()

const voice = await enableVoice(client, {
  transport: { type: 'livekit' },
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

await voice.detach()
```

Voice audio is signed 16-bit PCM, 48000 Hz, mono. `onRemotePcm` receives frames
in that format, and local audio must be supplied in that format. The
`sampleRate` option does not resample; use `pcm.resample()` to convert other
rates. Frames are 20 ms (960 samples) by default, or 10 ms (480 samples) with
`frameDurationMs: 10`. Chunks from `getLocalPcmStream` are split into frames
automatically, while `client.sendVoiceFrame()` requires exact frame sizes.

| Option | Description |
| --- | --- |
| `handlers` | `onRemotePcm` and `getLocalPcmStream`. |
| `transport.type` | `'livekit'`, `'mock'`, or `'auto'` (default; `mock` when `NODE_ENV` is `test`, otherwise `livekit`). |
| `frameDurationMs` | `20` (default) or `10`. |
| `autoStartPublish` | Starts publishing `getLocalPcmStream` automatically. Defaults to `true`. |

The LiveKit URL is derived from `serverUrl` for `metatell.app` and
`metatell-stg.app`. Set the `METATELL_REALTIME_URL` environment variable to use
a different LiveKit URL.

## `AgentClient`

`AgentClient` exposes lower-level operations for integrations that need direct
control over connection, room membership, avatar updates, animation, and voice.
`createAgentClient()` takes a core `BotConfiguration`:

```ts
import { createAgentClient } from '@metatell/bot-sdk'

const agent = createAgentClient(
  {
    serverUrl: 'wss://metatell.app',
    hubUrl: 'https://metatell.app',
    hubId: 'YOUR_ROOM_ID',
    profile: { displayName: 'AgentBot', avatarId: 'YOUR_AVATAR_ID' },
    authToken: process.env.METATELL_TOKEN,
  },
  { rateLimit: { messages: 2 } },
)

await agent.connect({ url: 'https://metatell.app/YOUR_ROOM_ID' })
```

Use `createAgentClientWithFactory(factory, config)` to reuse an existing
`CoreServiceFactory`. Read the session ID from `getStatus().sessionId`;
`getSessionId()` exists on `DefaultAgentClient` but not on the `AgentClient`
interface type.

Common methods:

| Area | Methods |
| --- | --- |
| Connection | `connect(options)`, `disconnect()`, `join(room)`, `leave()`, `getStatus()` |
| Chat | `send(text)` |
| Avatar | `move(position)`, `look(target)`, `lookAtNearest()` |
| Users | `getUsers()`, `getUser(id)`, `getUsersNearby(radius)` |
| Animation | `playAnimation(id, options)`, `stopAnimation()`, `getCurrentAnimation()`, `getAvailableAnimations()` |
| Voice | `sendVoiceFrame(frame)`, `muteVoice(muted)`, `isVoiceMuted()` |
| Rate limits | `setRateLimit(key, perSecond)`, `getRateLimit(key)` |

`AgentClientEvents` declares connection, room, user, message, avatar, and voice
event names. `DefaultAgentClient` currently emits `voice:mute-changed` itself;
subscribe to the core `EventBus` service for other core events.

## Errors

The SDK exports a shared error hierarchy based on `MetatellError`:

| Class | `code` | Description |
| --- | --- | --- |
| `AuthenticationError` | `AUTH_ERROR` | Authentication failed. |
| `TransportError` | `TRANSPORT_ERROR` | Connection or transport failure. |
| `ProtocolError` | `PROTOCOL_ERROR` | Invalid configuration or protocol data. |
| `TimeoutError` | `TIMEOUT_ERROR` | Operation timed out. |
| `RateLimitedError` | `RATE_LIMITED` | Request was rate limited. |
| `NavigationError` | `NavigationErrorCode` | Scene fetch, parse, or navmesh failure. |

Use `isMetatellError(error)` to detect SDK errors and `isRetryableError(error)`
to check whether a retry may succeed.

```ts
import { AuthenticationError, TransportError, isRetryableError } from '@metatell/bot-sdk'

try {
  await client.connect()
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Authentication failed:', error.message)
  } else if (error instanceof TransportError) {
    console.error('Connection failed:', error.reason ?? error.message)
  } else if (isRetryableError(error)) {
    // Retry later.
  } else {
    throw error
  }
}
```

## Utilities

- `pcm.resample(input, fromHz, toHz)`: resamples 16-bit PCM with linear
  interpolation and yields `Int16Array` chunks.
- `pcm.chunk(input, samplesPerChunk)`: splits an `AsyncIterable<Int16Array>`
  into fixed-size chunks.
- `TokenBucketRateLimiter` and `RateLimitedQueue`: token-bucket throttling
  helpers.
- Logging helpers. See [Logging and errors](./logging-and-errors.md).

## Types

Frequently used exported types include:

- `Vec3`
- `Euler`
- `User`
- `BotInfo`
- `AvatarAsset`
- `Animation`
- `CreateClientOptions`
- `ConnectOptions`
- `MetatellClientEvents`
- `RoomSceneInfo`
- `RoomSceneChangedEvent`
- `PrepareNavigationOptions`
- `PrepareNavigationResult`
- `NavigationSnapshot`
- `NavigationRuntime`
- `AgentVoiceConfig`
- `AgentVoiceAttachment`
- `PcmInput`

The SDK also re-exports typed NAF helpers from `@metatell/bot-core`. See
[NAF messages](./NAF.md).
