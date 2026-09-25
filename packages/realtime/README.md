# @metatell/bot-realtime

Realtime transport helpers for metatell bots. The package provides LiveKit
WebRTC transport and a mock adapter for tests and local development.

## Requirements

- Node.js 20 or later. Node.js 24 is recommended and is the version used in CI.
- TypeScript 5 or later for TypeScript projects.

## Install

```bash
npm install @metatell/bot-realtime
# or
pnpm add @metatell/bot-realtime
# or
yarn add @metatell/bot-realtime
```

Most bots use this package through `enableVoice()` in `@metatell/bot-sdk`,
which creates the transport, requests the LiveKit token, and attaches the voice
bridge. Use the APIs below directly only for custom integrations.

## Usage

```ts
import { createRealtimeTransport } from '@metatell/bot-realtime'

const transport = createRealtimeTransport({ type: 'livekit' })

const unsubscribe = transport.on((event) => {
  switch (event.type) {
    case 'state':
      console.log('connection state:', event.state)
      break
    case 'data':
      console.log('data received:', event.topic, event.payload)
      break
    case 'participant-joined':
      console.log('participant joined:', event.identity)
      break
  }
})

await transport.connect({
  url: 'wss://livekit.example.com',
  tokenProvider: async () => getAccessToken(),
  topics: ['control', 'events', 'transcript', 'audio'],
  audioPublish: {
    sampleRate: 48000,
    channels: 1,
  },
})

await transport.send('control', JSON.stringify({ action: 'spawn' }))
await transport.startAudioPublisher()
await transport.pushPcmFrame(new Int16Array(960))
await transport.stopAudioPublisher()
await transport.disconnect()
unsubscribe()
```

`createRealtimeTransport()` accepts `type: 'livekit'`, `'mock'`, or `'auto'`
(the default). `'auto'` selects the mock transport when `NODE_ENV` is `test` and
LiveKit otherwise.

## Connection Options

| Option | Description |
| --- | --- |
| `url` | LiveKit WebSocket URL. |
| `tokenProvider` | Async function that returns a LiveKit access token. |
| `topics` | Data topics that can be sent. Defaults to `control`, `events`, `transcript`, and `audio`. Sending to another topic fails. |
| `audioPublish` | `sampleRate` (16000, 24000, or 48000), `channels` (1 or 2), optional `frameDurationMs` (10 or 20, default 20), and optional `trackName`. Defaults to 48000 Hz mono. |
| `connect` | Optional `autoSubscribe` and `dynacast` flags. |
| `timeouts` | Optional `connectMs`. |
| `logger` | Optional `(level, msg, meta) => void` logger. |

`pushPcmFrame()` expects one frame of `sampleRate * frameDurationMs / 1000`
samples per channel. Received remote audio is delivered on the `audio` topic as
48000 Hz mono signed 16-bit PCM.

## Voice Bridge

`attachVoice(client, transport, handlers, options)` connects a voice-capable
client to a connected transport. It forwards remote audio to
`handlers.onRemotePcm`, publishes `handlers.getLocalPcmStream` when
`autoStartPublish` is `true` (the default), and routes `client.sendVoiceFrame()`
to the transport. Call `detach()` on the returned object to stop.

## Mock Adapter

Use the mock adapter for tests and local development without a LiveKit room:

```ts
import { MockAdapter } from '@metatell/bot-realtime'

const mock = new MockAdapter()
await mock.connect({ url: 'mock://local', tokenProvider: async () => 'token' })
```

After connecting, the mock emits a `participant-joined` event for
`mock-participant` and then a 960-sample audio frame on the `audio` topic every
20 ms. Data passed to `send()` is echoed back as a `data` event from
`mock-echo`.

## Events

```ts
type RealtimeEvent =
  | { type: 'state'; state: ConnectionState }
  | { type: 'data'; topic: string; payload: Uint8Array; from?: string }
  | { type: 'participant-joined'; identity: string; sid: string }
  | { type: 'participant-left'; identity: string; sid: string }
  | { type: 'warning'; code: string; message: string }
  | { type: 'error'; code: string; message: string; cause?: unknown }
```

`ConnectionState` is `'idle'`, `'connecting'`, `'connected'`, `'reconnecting'`,
or `'disconnected'`.

## Errors

Transport failures reject with `RealtimeError`, a `MetatellError` subclass.
Its `code` is one of the `ErrorCodes` values, such as `NotConnected`,
`UnknownTopic`, or `AudioNotStarted`.

## License

MIT
