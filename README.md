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

## バージョン管理

このプロジェクトはpnpmとchangesetsを使用してバージョン管理を行っています。

### バージョンを上げる手順

1. **changesetを作成**
   ```bash
   pnpm changeset
   ```
   - 変更したパッケージを選択
   - major/minor/patchを選択
   - 変更内容の説明を記入

2. **バージョンを更新**
   ```bash
   pnpm bumpup
   ```
   - `.changeset`内のファイルを元に各パッケージのバージョンを更新
   - CHANGELOGも自動生成

3. **ビルド**
   ```bash
   pnpm build
   ```

4. **パッケージを公開**
   ```bash
   pnpm release
   ```

### 注意事項
- ルートの`package.json`のバージョンは手動で更新する必要があります
- 内部依存関係は`workspace:*`を使用しているため、バージョン番号の更新は不要
- changesetの`fixed`設定により、全パッケージが同じバージョンになります

## ライセンス

MIT