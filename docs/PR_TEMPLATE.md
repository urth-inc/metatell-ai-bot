# Pull Request Template

## Title
<!-- 簡潔で分かりやすいタイトル -->
feat: Professional CLI refactoring with SDK facade and structured logging

## Key Changes
<!-- 主な変更点を箇条書きで -->
- 構造化ログシステムの実装（RingBuffer、LogSink、LoggerFactory）
- CLI 3分割レイアウト（Header/LogPane/Footer）とモーダル表示
- コマンド体系の正規化（動詞ベース、統一されたUsage/エラー）
- SDK ファサード（AgentClient）による実装詳細の隠蔽
- エラーモデル・レート制御・再接続戦略の抽象化
- 設定管理システム（CLI flags > env > config.json > .env）
- イベントキューによるUI更新のバッチ処理

## Testing
<!-- 実行済みテストと追加したテスト -->
- [ ] `npm run check` - 型チェックとlint
- [ ] `npm test` - 既存テストがすべてパス
- [ ] 新規テストの追加:
  - [ ] `commands/plan.spec.ts` - コマンドパーサーの純粋関数テスト
  - [ ] `LogPane.spec.tsx` - フィルタ・折返し・行数制御のテスト
  - [ ] `RateLimitedQueue.spec.ts` - レート制限のテスト
  - [ ] `errors.spec.ts` - エラーモデルのテスト
- [ ] 手動テスト:
  - [ ] 端末リサイズ時のレイアウト調整
  - [ ] ログフィルタリング（`/logs filter <regex>`）
  - [ ] モーダル表示（JSON出力、ヘルプ）
  - [ ] キーバインド（↑/↓履歴、Tab補完、Ctrl+R検索、Esc解除）

## Screenshots/Demo
<!-- CLIの動作スクリーンショット -->
```
┌─────────────────────────────────────────────────────────────────┐
│ Connected | Users: 5 | RTT: 45ms | Retries: 0 | Rate: 2m/s     │
│ ─────────────────────────────────────────────────────────────── │
├─────────────────────────────────────────────────────────────────┤
│ [12:34:56] ℹ Starting Metatell Bot...                          │
│ [12:34:57] ✓ Connected successfully                            │
│ [12:34:58] ℹ /users list                                      │
│ [12:34:58] ℹ Users in room (5):                               │
│            Alice (user123)                                      │
│              Position: (0.0, 0.2, 0.0)                         │
│              Avatar: hsBHyUu2                                  │
│ ... 93 older messages hidden ...                               │
├─────────────────────────────────────────────────────────────────┤
│ ▸ /users    /user    /move    /look    /nearby                │
│ ↑/↓ to select • Tab to complete • Ctrl+R for history search   │
│ ─────────────────────────────────────────────────────────────── │
│ ❯ /u                                                           │
│ ↑/↓ History • Tab Complete • Ctrl+R Search • Esc Clear • C×2  │
└─────────────────────────────────────────────────────────────────┘
```

## How to Verify
<!-- 確認手順 -->
1. `npm install` で依存関係をインストール
2. `npm run build` でビルド
3. `npm start -- --url wss://example.com --token $TOKEN --room lobby`
4. `/help` でコマンド一覧を確認
5. `/logs filter "ERROR"` でログフィルタリングをテスト
6. `/status --json` でモーダル表示をテスト

## Related Tasks
<!-- 関連するタスクやissue -->
- #xxx - CLI UX改善の要望
- 設計ドキュメント: `.tmp/design.md`
- 実装タスク: `.tmp/task.md`

## Impact Analysis
<!-- 影響範囲 -->
- **Breaking Changes**: 
  - `startInkCli()` の引数が `AgentClient` に変更
  - 既存の `bot` と `userAvatarManager` の直接参照は不可
- **Migration Guide**:
  ```typescript
  // Before
  startInkCli(bot, userAvatarManager)
  
  // After
  const client = createAgentClient(factory, config)
  startInkCli(client)
  ```
- **Performance**: イベントキューによりUI更新が効率化

## Other Notes
<!-- その他の注意点 -->
- 色指定を完全に削除（ユーザー要望により）
- 構造化ログはCLI起動前はRingBufferに蓄積
- 将来のSDK分離を見据えた設計
- TypeScript strict modeとBiome準拠