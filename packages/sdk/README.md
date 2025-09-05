# @metatell/bot-sdk — 開発者ガイド（外部公開版）

Metatell のボットを TypeScript/Node.js で素早く実装できる SDK です。最短の導入から、イベント、メッセージ、アバター、エラー処理までを段階的に説明します。

- 公式パッケージ: `@metatell/bot-sdk`
- 対応ランタイム: Node.js 18+（推奨: 20+）
- 型サポート: TypeScript フルサポート

この README は概要とクイックスタートを扱います。詳細は リポジトリ直下の `docs/` を参照してください。

## インストール

```bash
npm install @metatell/bot-sdk
# or
pnpm add @metatell/bot-sdk
# or
yarn add @metatell/bot-sdk
```

## クイックスタート

```ts
import { createMetatellClient } from '@metatell/bot-sdk'

async function main() {
  const client = createMetatellClient({
    serverUrl: 'wss://metatell.app', // パス不要
    roomId: 'YOUR_ROOM_ID',
    // token: process.env.METATELL_TOKEN, // 認証が必要な環境では設定
    logger: 'info',
  })

  client.on('error', (e) => console.error('SDK error:', e))

  await client.connect()
  const botInfo = await client.getInfo()

  client.chat.onMessage(async ({ from, text, mention, reply }) => {
    // 正しいメンション判定（自分宛てのみ応答）
    if (mention?.sessionId === botInfo.sessionId) {
      await reply(`Hi ${from.name ?? 'there'}! You said: ${text}`)
    }
  })
}

main().catch(console.error)
```

## 主な機能

- メッセージ送受信（`client.chat.send`, `client.chat.onMessage`）
- ルーム・プレゼンス（`room.getUsers`, `getUsers`）
- アバター操作（選択・移動・回転・アニメーション再生）
- 強力な型付きイベント（`MetatellClientEvents`）
- レート制御・ロギング・エラー階層（再試行判定に便利）

## API ハイライト（抜粋）

- `createMetatellClient(options)` → `MetatellClient`
  - `connect()` / `disconnect()`
  - `chat.send(text)` / `chat.onMessage(handler)`
  - `room.getUsers()` / `getUsers()`
  - `avatar.select(assetId)` / `avatar.moveTo(vec3)` / `avatar.rotateTo(euler)` / `avatar.play(animation)`
  - イベント: `connected`, `disconnected`, `user-join`, `chat-message`, ほか

- 低レベル制御向け `AgentClient` も提供
  - `createAgentClient(config)` / `connect`, `join`, `move`, `look`, `playAnimation` など

詳細は「API リファレンス」を参照してください。

## ドキュメント

- はじめに: `docs/getting-started.md`
- API リファレンス: `docs/api.md`
- 例・ベストプラクティス: `docs/examples.md`
- ロギング/レート制御/エラー: `docs/logging-and-errors.md`
- トラブルシューティング/FAQ: `docs/troubleshooting.md`, `docs/faq.md`
- NAF プロトコル（同期基盤）: `docs/NAF.md`

注記: 音声機能は現在開発中・検証中のため、本 README とドキュメントでは記載を最小化しています。将来的に仕様が変わる可能性があります。

## サポート

- ランタイム: Node.js 18+（LTS 推奨）
- モジュール形式: ESM
- 型定義: `dist/index.d.ts`

問題や改善提案はリポジトリの Issue までお願いします。
