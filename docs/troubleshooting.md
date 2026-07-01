# Troubleshooting

## The bot cannot connect

- Confirm `serverUrl` uses a WebSocket origin such as `wss://metatell.app`.
  Do not include the room path.
- Confirm `roomId` is the room ID, not the full URL.
- If the room requires authentication, confirm `token` is set and has not
  expired.
- Check network restrictions such as proxies or firewalls that block WebSocket
  connections.
- Run with `debug: true` to print more connection logs.

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
- Keep position updates at a reasonable rate. Use `setRateLimit()` for frequent
  movement loops.
- Use Euler angles in degrees for `rotateTo()`.
- Confirm your room client is not hiding or replacing the selected avatar.

## Animations do not play

- Call `avatar.getAvailableAnimations()` and use an ID that exists for the
  selected avatar.
- Some avatar-specific animation IDs are UUIDs. Do not assume preset names are
  available on every avatar.
- If a bot loops movement animations, stop or replace the loop before playing a
  one-shot animation.

## Voice does not start

- Install both `@metatell/bot-sdk` and `@metatell/bot-realtime`.
- Use a supported sample rate: 16000, 24000, or 48000 Hz.
- For 48000 Hz mono audio, provide 960-sample `Int16Array` frames for 20 ms
  frames.
- Confirm the room and environment support LiveKit voice transport.
- Start with the mock transport when testing audio logic without a live room.

## TypeScript reports module or type errors

- Use Node.js 20 or later.
- Use ESM-compatible TypeScript settings.
- Use TypeScript 5 or later.
- Reinstall dependencies if package versions are out of sync.

## Debug logs are too noisy

Disable `debug` for normal operation or register a custom logger provider. See
[Logging and errors](./logging-and-errors.md).
