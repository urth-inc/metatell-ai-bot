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

このプロジェクトはGitHub Actionsを使用して自動リリースを行います。

### リリースフロー

1. **変更の記録（開発者）**
   ```bash
   # 機能開発・バグ修正後
   pnpm changeset
   ```
   対話的に以下を選択：
   - 変更したパッケージを選択
   - バージョンタイプを選択:
     - `patch`: バグ修正
     - `minor`: 新機能（後方互換性あり）
     - `major`: 破壊的変更
   - 変更内容の説明を記入

2. **コミット＆プッシュ**
   ```bash
   git add .changeset/
   git commit -m "chore: add changeset"
   git push
   ```

3. **リリース実行（リリース担当者）**
   - [GitHub Actions](https://github.com/urth-inc/metatell-ai-bot/actions/workflows/release.yml) にアクセス
   - "Run workflow" をクリック
   - Branch: `develop` を選択して実行

4. **自動処理**
   - 初回: バージョン更新PRが自動作成される
   - PR承認・マージ後: 再度ワークフローを実行すると
     - npmへ自動公開（OIDC認証）
     - GitHub Releaseの作成
     - タグの作成

### セキュリティ

- npm OIDC trusted publishingを使用（トークン不要）
- 詳細は [docs/RELEASE.md](./docs/RELEASE.md) を参照

## ライセンス

MIT