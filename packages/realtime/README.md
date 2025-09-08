# @metatell/bot-realtime

MetaTell Botのリアルタイム通信レイヤー。LiveKitを使用したWebRTC通信とテスト用モックアダプターを提供します。

## 必要要件

- Node.js 22+ (推奨)
- TypeScript 5.0+

## インストール

```bash
npm install @metatell/bot-realtime
# または
pnpm add @metatell/bot-realtime
# または
yarn add @metatell/bot-realtime
```

## 使い方

```typescript
import { LiveKitAdapter } from '@metatell/bot-realtime';

// アダプター作成
const adapter = new LiveKitAdapter();

// イベントリスナー
adapter.on((event) => {
  switch (event.type) {
    case 'state':
      console.log('接続状態:', event.state);
      break;
    case 'data':
      console.log('データ受信:', event.topic, event.payload);
      break;
    case 'participant-joined':
      console.log('ユーザー参加:', event.identity);
      break;
  }
});

// 接続
await adapter.connect({
  url: 'wss://livekit.example.com',
  tokenProvider: async () => getAccessToken(),
  topics: ['control', 'events', 'transcript'],
  audioPublish: {
    sampleRate: 48000,
    channels: 1
  }
});

// データ送信
await adapter.send('control', JSON.stringify({ action: 'spawn' }));

// 音声配信
await adapter.startAudioPublisher();
await adapter.pushPcmFrame(pcmData);
```

## 主な機能

### LiveKitアダプター

本番環境用のLiveKit WebRTCアダプター。

```typescript
const options = {
  url: 'wss://your-livekit-server.com',
  tokenProvider: async () => {
    // トークン取得ロジック
    return token;
  },
  topics: ['control', 'events', 'transcript', 'audio'],
  audioPublish: {
    sampleRate: 48000,  // 48kHz, 24kHz, または 16kHz
    channels: 1,        // モノラルまたはステレオ
  }
};
```

### モックアダプター

テストと開発用のモックアダプター。

```typescript
import { MockAdapter } from '@metatell/bot-realtime';

const mock = new MockAdapter();

// モック動作の設定
mock.simulateConnection();
mock.simulateParticipant('user-123', 'Alice');
mock.simulateData('events', { type: 'test' });
```

## イベント

```typescript
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