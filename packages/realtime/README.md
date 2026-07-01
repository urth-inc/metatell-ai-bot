# @metatell/bot-realtime

Realtime transport helpers for metatell bots. The package provides LiveKit
WebRTC transport and a mock adapter for tests and local development.

## Requirements

- Node.js 20 or later. Node.js 22 is recommended.
- TypeScript 5 or later for TypeScript projects.

## Install

```bash
npm install @metatell/bot-realtime
# or
pnpm add @metatell/bot-realtime
# or
yarn add @metatell/bot-realtime
```

## Usage

```ts
import { LiveKitAdapter } from '@metatell/bot-realtime'

const adapter = new LiveKitAdapter()

adapter.on((event) => {
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

await adapter.connect({
  url: 'wss://livekit.example.com',
  tokenProvider: async () => getAccessToken(),
  topics: ['control', 'events', 'transcript'],
  audioPublish: {
    sampleRate: 48000,
    channels: 1,
  },
})

await adapter.send('control', JSON.stringify({ action: 'spawn' }))
await adapter.startAudioPublisher()
await adapter.pushPcmFrame(pcmData)
```

## LiveKit Adapter

Use the LiveKit adapter for room voice transport:

```ts
const options = {
  url: 'wss://your-livekit-server.com',
  tokenProvider: async () => token,
  topics: ['control', 'events', 'transcript', 'audio'],
  audioPublish: {
    sampleRate: 48000,
    channels: 1,
  },
}
```

Supported audio sample rates are 16000, 24000, and 48000 Hz. Mono and stereo
channels are supported.

## Mock Adapter

Use the mock adapter for tests and local development without a LiveKit room:

```ts
import { MockAdapter } from '@metatell/bot-realtime'

const mock = new MockAdapter()

mock.simulateConnection()
mock.simulateParticipant('user-123', 'Alice')
mock.simulateData('events', { type: 'test' })
```

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

## License

MIT
