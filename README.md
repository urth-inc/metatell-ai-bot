# Metatell Bot SDK

Metatell Bot開発用のTypeScript SDKです。導入、設定、API仕様を中心にドキュメントを用意しています。詳細は SDK パッケージの README とドキュメントを参照してください。

- SDK ドキュメント: `docs/`
- SDK パッケージの概要: `packages/sdk/README.md`

## パッケージ

- `@metatell/bot-core` - コア機能
- `@metatell/bot-sdk` - Bot SDK
- `@metatell/bot-cli` - CLIツール
- `@metatell/bot-realtime` - リアルタイム通信

## インストール

```bash
npm install @metatell/bot-sdk
```

## 使い方（クイックスタート）

```typescript
import { createMetatellClient } from '@metatell/bot-sdk'

const client = createMetatellClient({
  serverUrl: 'wss://metatell.app',
  roomId: 'YOUR_ROOM_ID',
})

await client.connect()
const botInfo = await client.getInfo()

// メンション宛てにのみ返信
client.chat.onMessage(async ({ from, text, mention, reply }) => {
  if (mention?.sessionId === botInfo.sessionId) {
    await reply(`Hello ${from.name ?? ''}`.trim())
  }
})
```

## 開発

```bash
# インストール
pnpm install

# ビルド
pnpm build

# テスト
pnpm test

# コードチェック
pnpm check

# 型チェック
pnpm typecheck
```

## リリース

リリースプロセスの詳細については [docs/RELEASE.md](./docs/RELEASE.md) を参照してください。

## ライセンス

MIT
