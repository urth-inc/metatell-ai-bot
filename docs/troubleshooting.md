# トラブルシューティング

## 接続できない

- `serverUrl` が `wss://...` 形式（パス不要）であるか確認
- ファイアウォール/プロキシの制限を確認
- トークン必須のルームで `token` が無効/期限切れの可能性

## メッセージが届かない

- ハンドラを登録後に `connect()` しているか
- `chat.onMessage` は全メッセージ購読。メンションのみ応答する場合は
  `mention?.sessionId === (await client.getInfo()).sessionId` で自分宛てを判定。

## アニメーションが再生されない

- `avatarId` が設定済みか
- `id` の誤り、または対象アバターで未提供の可能性

## 音声機能について

音声関連の機能は現在開発中・検証中です。安定版公開後にドキュメントを更新します。

## 型エラーが出る

- TypeScript の `target`/`moduleResolution` を確認（SDK は ESM）
- Node.js のバージョンを更新
