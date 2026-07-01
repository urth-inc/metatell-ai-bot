# Examples

This page shows common bot patterns. Runnable projects are available under
`examples/`.

## Runnable Examples

| Example | Purpose |
| --- | --- |
| [basic-bot](../examples/basic-bot/README.md) | Connect to a room, read chat, reply to mentions, and move near users. |
| [voice-bot](../examples/voice-bot/README.md) | Play a WAV file into a room and record remote PCM audio. |
| [voice-ai-bot](../examples/voice-ai-bot/README.md) | Connect voice input and output to Gemini Live. |
| [speech-to-speech-bot](../examples/speech-to-speech-bot/README.md) | Speech recognition, LLM response generation, and text-to-speech playback. |
| [dify-bot](../examples/dify-bot/README.md) | Forward room chat to a Dify application. |

## Reply When Mentioned

```ts
const botInfo = await client.getInfo()

client.chat.onMessage(async ({ from, text, mention, reply }) => {
  if (mention?.sessionId !== botInfo.sessionId) return

  await reply(`Hello ${from.name ?? 'there'}. I received: ${text}`)
})
```

## Command Bot

```ts
client.chat.onMessage(async ({ text, reply }) => {
  const [command, ...args] = text.trim().split(/\s+/)

  switch (command) {
    case '/wave':
      await client.avatar.play({ id: 'wave', loop: false })
      await reply('Wave animation requested.')
      break

    case '/move': {
      const [x, y, z] = args.map(Number)
      if ([x, y, z].some(Number.isNaN)) {
        await reply('Usage: /move <x> <y> <z>')
        return
      }

      await client.avatar.moveTo({ x, y, z })
      await reply(`Moved to ${x}, ${y}, ${z}.`)
      break
    }
  }
})
```

## Follow the Nearest User

```ts
setInterval(async () => {
  const [target] = await client.room.getNearbyUsers(10)
  const current = client.avatar.getPosition()

  if (!target?.position || !current) return

  await client.avatar.lookAt(target.position)

  await client.avatar.moveTo({
    x: target.position.x + 1.5,
    y: target.position.y,
    z: target.position.z + 1.5,
  })
}, 1000)
```

## List Room Users

```ts
const users = await client.room.getUsers()

for (const user of users) {
  console.log({
    id: user.id,
    name: user.name,
    position: user.position,
  })
}
```

## Play PCM Voice

```ts
import { enableVoice } from '@metatell/bot-sdk'

const voice = await enableVoice(client, {
  transport: { type: 'livekit' },
  sampleRate: 48000,
  channels: 1,
  handlers: {
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

## Record Remote PCM Frames

```ts
const frames: Int16Array[] = []

await enableVoice(client, {
  transport: { type: 'livekit' },
  handlers: {
    onRemotePcm: async (pcm, meta) => {
      console.log('audio from', meta.fromIdentity)
      frames.push(new Int16Array(pcm))
    },
  },
})
```

## Mute State

```ts
client.on('voice:mute-changed', ({ muted }) => {
  console.log('muted:', muted)
})

await client.muteVoice(true)
console.log(client.isVoiceMuted())
```

## Dify Chat Bridge

Use the Dify example when a bot should forward metatell chat to a Dify
application and post the application response back to the room.

```bash
cd examples/dify-bot
npm install
cp .env.example .env
npm start
```
