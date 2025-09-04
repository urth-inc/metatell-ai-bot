# Metatell Bot SDK

Metatell Bot開発用のTypeScript SDKです。

## パッケージ

- `@metatell/bot-core` - コア機能
- `@metatell/bot-sdk` - Bot SDK
- `@metatell/bot-cli` - CLIツール
- `@metatell/bot-realtime` - リアルタイム通信

## インストール

```bash
npm install @metatell/bot-sdk
```

## 使い方

```typescript
import { createMetatellClient } from '@metatell/bot-sdk'

const client = createMetatellClient({
  serverUrl: 'wss://metatell.app/socket',
  roomId: 'YOUR_ROOM_ID',
})

await client.connect()

// メッセージハンドリング
client.chat.onMessage(async ({ from, text, reply }) => {
  if (text.includes('hello')) {
    await reply('Hello!')
  }
})
```

## 開発

```bash
# インストール
npm install

# ビルド
npm run build

# テスト
npm test
```

## ライセンス

MIT