# Troubleshooting

## The bot cannot connect

- Confirm `serverUrl` uses a WebSocket origin such as `wss://metatell.app`.
  Do not include the room path.
- Confirm `roomId` is the room ID, not the full URL.
- If the bot needs room-role permissions, confirm `authToken` is set and has
  not expired.
- Check network restrictions such as proxies or firewalls that block WebSocket
  connections.
- Run with `debug: true` to print more connection logs.
- Catch the error from `connect()`: `AuthenticationError` indicates an
  authentication failure, and `TransportError.reason` contains the underlying
  connection error.

## The bot connects but no chat messages arrive

- Register `chat.onMessage()` before or immediately after `connect()`.
- Confirm users are sending messages in the same room.
- If your bot only responds to mentions, log all messages first and verify the
  `mention` field before filtering.

```ts
client.chat.onMessage(({ from, text, mention }) => {
  console.log({ from: from.name, text, mention })
})
```

## Mention replies do not work

Fetch the bot session ID after `connect()` and compare it with
`mention.sessionId`:

```ts
await client.connect()
const botInfo = await client.getInfo()

client.chat.onMessage(async ({ mention, reply }) => {
  if (mention?.sessionId === botInfo.sessionId) {
    await reply('Mention received.')
  }
})
```

## Avatar movement or rotation does not appear

- Confirm the bot is connected before calling avatar methods.
- Keep position updates at a reasonable rate. `MetatellClient` does not
  throttle `moveTo()`; use `RateLimitedQueue` or your own timer for frequent
  movement loops.
- Use Euler angles in degrees for `rotateTo()`.
- Confirm your room client is not hiding or replacing the selected avatar.

## Animations do not play

- Call `avatar.getAvailableAnimations()` and use an ID that exists for the
  selected avatar.
- Only `idle` and `walking` are guaranteed preset IDs.
- Some avatar-specific animation IDs are UUIDs. Do not assume preset names are
  available on every avatar.
- If a bot loops movement animations, stop or replace the loop before playing a
  one-shot animation.

## Voice does not start

- Install both `@metatell/bot-sdk` and `@metatell/bot-realtime`.
- Call `enableVoice()` after `connect()`.
- Provide 48000 Hz, mono, signed 16-bit PCM. The `sampleRate` option does not
  resample; convert other rates with `pcm.resample()`.
- `sendVoiceFrame()` requires 960-sample `Int16Array` frames for 20 ms, or 480
  samples with `frameDurationMs: 10`.
- Confirm the room and environment support LiveKit voice transport. For
  environments other than `metatell.app` and `metatell-stg.app`, set
  `METATELL_REALTIME_URL` to the LiveKit URL.
- Start with the mock transport (`transport: { type: 'mock' }`) when testing
  audio logic without a live room.

## Scene navigation fails

`prepareNavigation()` rejects with a `NavigationError`. Check its `code`:

- `SCENE_UNAVAILABLE`: the room join did not report a supported scene asset.
  Call `connect()` first.
- `SCENE_FETCH_FAILED`: the GLB request failed or its URL is not allowed. Add a
  custom-domain CDN to `additionalAllowedOrigins` as an exact HTTPS origin.
- `SCENE_FORMAT_UNSUPPORTED`: the scene is not a self-contained GLB.
- `SCENE_TOO_LARGE`: the download exceeds `maxBytes`.
- `NAV_MESH_TOO_LARGE`: the navmesh exceeds `maxDecodedBytes` or
  `maxTriangles`. Raise the limit only for trusted scenes.
- `NAV_MESH_NOT_FOUND` or `NAV_MESH_INVALID`: the first `nav-mesh` marker is
  missing, is not a character navmesh, or has no mesh.
- `NAV_MESH_UNSUPPORTED`: the scene uses a geometry compression extension other
  than `EXT_meshopt_compression`, `KHR_draco_mesh_compression`, or
  `KHR_mesh_quantization`.
- `SCENE_CHANGED`: the room scene changed. Prepare a new snapshot.

Retry only when `error.retryable` is `true`.

## TypeScript reports module or type errors

- Use Node.js 20 or later.
- Use ESM-compatible TypeScript settings. Set `moduleResolution` to `NodeNext`,
  `Node16`, or `Bundler` so the `@metatell/bot-sdk/navigation` subpath export
  resolves.
- Use TypeScript 5 or later. The packages are built with TypeScript 6.
- Reinstall dependencies if package versions are out of sync.

## Debug logs are too noisy

Disable `debug` for normal operation or register a custom logger provider. See
[Logging and errors](./logging-and-errors.md).
