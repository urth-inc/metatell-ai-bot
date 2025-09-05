# はじめに（Getting Started）

本書では、外部公開された `@metatell/bot-sdk` を使って最短でボットを動かす手順を説明します。

## 前提条件

- Node.js 18 以上（推奨: 20+）
- TypeScript 推奨（JS でも可）
- ルーム URL または `roomId`
- 認証トークン（要否は環境の設定に依存）

## インストール

```bash
npm install @metatell/bot-sdk
```

## 最小コード例

```ts
import { createMetatellClient } from '@metatell/bot-sdk'

const client = createMetatellClient({
  serverUrl: 'wss://metatell.app',
  roomId: 'YOUR_ROOM_ID',
  // token: process.env.METATELL_TOKEN, // 認証が必要な環境では設定
})

client.on('error', (e) => console.error(e))

await client.connect()
const botInfo = await client.getInfo()

client.chat.onMessage(async ({ mention, reply }) => {
  // 自分宛てメンションのみに応答
  if (mention?.sessionId === botInfo.sessionId) {
    await reply('こんにちは！')
  }
})
```

## よく使うオプション

- `logger`: `'silent' | 'info' | 'debug'`（開発時は `debug` が便利）
- `username`: 表示名
- `avatarId`: 既存アバターの選択
- `reconnect`: `{ enabled?: boolean; maxDelayMs?: number }`

## 次のステップ

- メッセージ送受信: `api.md#chat`
- アバター操作: `api.md#avatar`
- 低レベル制御（AgentClient）: `api.md#agentclient`
