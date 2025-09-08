# @metatell/bot-sdk

MetaTell Bot を TypeScript/Node.js で構築するための公式 SDK。

## 必要要件

- Node.js 20 以上（推奨: 22+）
- ESM モジュール
- TypeScript 5.0+（TS プロジェクトの場合）

## インストール

```bash
npm install @metatell/bot-sdk
# または
pnpm add @metatell/bot-sdk
# または
yarn add @metatell/bot-sdk
```

## クイックスタート

```typescript
import { createMetatellClient } from '@metatell/bot-sdk'

async function main() {
  const client = createMetatellClient({
    serverUrl: 'wss://metatell.app',
    roomId: 'YOUR_ROOM_ID',
    username: 'MyBot',
    // token: process.env.METATELL_TOKEN, // 認証が必要な環境では設定
    debug: true, // 詳細ログ
  })

  // 接続
  await client.connect()

  // ボット情報
  const botInfo = await client.getInfo()
  console.log('接続しました:', botInfo.name)

  // メッセージ処理（メンションにのみ応答）
  client.chat.onMessage(async ({ from, text, mention, reply }) => {
    if (mention?.sessionId === botInfo.sessionId) {
      await reply(`こんにちは ${from.name ?? ''}`.trim())
    }
  })

  // アバター選択と操作
  await client.avatar.select('default-avatar')
  await client.avatar.moveTo({ x: 1, y: 1.6, z: -2 })
  await client.avatar.rotateTo({ x: 0, y: 180, z: 0 })
  await client.avatar.play({ id: 'wave', loop: false })
}

main().catch(console.error)
```

## 主な機能

### 接続管理

```typescript
await client.connect()
await client.disconnect()

// 接続状態
const status = client.getStatus() // { connected: boolean, connecting: boolean }

// ボット情報
const info = await client.getInfo() // { name, version, roomId, sessionId? }
```

### チャット

```typescript
// メッセージ送信
await client.chat.send('こんにちは！')

// メッセージ購読 + 返信
client.chat.onMessage(async ({ from, text, reply }) => {
  console.log(`${from.name}: ${text}`)
  await reply('メッセージありがとうございます！')
})
```

### アバター制御

```typescript
// アバター選択
await client.avatar.select('avatar-asset-id')

// 移動/回転（度数法）
await client.avatar.moveTo({ x: 10, y: 0, z: 5 })
await client.avatar.rotateTo({ x: 0, y: 90, z: 0 })

// アニメーション再生
await client.avatar.play({ id: 'wave', loop: true, duration: 5000 })

// 利用可能なアセット/アニメーション
const assets = await client.avatar.getAvailableAssets()
const animations = await client.avatar.getAvailableAnimations()
```

### ルームとプレゼンス

```typescript
// すべてのユーザー
const users = await client.room.getUsers()

// 近傍ユーザー（既定 10m）
const nearby = await client.room.getNearbyUsers(10)

// 現在キャッシュしているユーザー（同期）
const cached = client.getUsers()
```

### イベント

```typescript
client.on('connected', () => {})
client.on('disconnected', (reason) => {})
client.on('chat-message', (message) => {})
client.on('user-join', (user) => {})
client.on('user-leave', (user) => {})
```

注記: 現状 `error` イベントの発火は限定的で、主に例外としてスローされます。

## エラーハンドリング

```typescript
import { AuthError, NetworkError } from '@metatell/bot-sdk'

try {
  await client.connect()
} catch (error) {
  if (error instanceof AuthError) {
    console.error('認証に失敗しました:', error.message)
  } else if (error instanceof NetworkError) {
    console.error('ネットワークエラー:', error.message)
  }
}
```

## ベストプラクティス

1. エラーハンドリング: 接続エラーと切断を必ず処理する
2. レート制御: `setRateLimit` で送信頻度を調整
3. クリーンアップ: 終了時は `disconnect()`
4. セキュリティ: トークンは環境変数で管理

## License

MIT

## 関連パッケージ

- [@metatell/bot-core](../core/README.md) — コアサービス/インフラ
- [@metatell/bot-cli](../cli/README.md) — 開発用 CLI
- [@metatell/bot-realtime](../realtime/README.md) — リアルタイム通信

