# FAQ

## Which runtime is supported?

Node.js 20 or later is supported. Node.js 22 is recommended. Deno and Bun are
not part of the supported test matrix.

## Can I use the SDK in a browser?

The SDK is designed for Node.js bot processes. Browser usage is not a supported
target because authentication, WebSocket, and realtime transport requirements
depend on the deployment environment.

## How do I get the room ID?

Use the first path segment of the metatell room URL:

```ts
const url = new URL('https://metatell.app/YOUR_ROOM_ID')
const roomId = url.pathname.split('/').filter(Boolean)[0]
```

## Do I need an access token?

Some environments and rooms require a token. Pass it as `token` when creating
the client and store it in an environment variable:

```ts
createMetatellClient({
  serverUrl,
  roomId,
  token: process.env.METATELL_TOKEN,
})
```

## How do I respond only to mentions?

Compare the mention session ID with the bot session ID:

```ts
const botInfo = await client.getInfo()

client.chat.onMessage(async ({ mention, reply }) => {
  if (mention?.sessionId === botInfo.sessionId) {
    await reply('How can I help?')
  }
})
```

## Where are the 3D synchronization types?

See [NAF messages](./NAF.md) and the NAF exports from `@metatell/bot-core`.

## Which API should I use for most bots?

Use `createMetatellClient()` and the high-level `MetatellClient` API. Use
`AgentClient` only when you need lower-level control.

## How do I build a voice bot?

Use `enableVoice()` with `@metatell/bot-realtime`. See
[examples/voice-bot](../examples/voice-bot/README.md) for a runnable WAV
playback and recording example.
