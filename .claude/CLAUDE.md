# Metatell AI Bot Development Guidelines

## Quality Checklist

開発作業を完了する前に、必ず以下の3つのコマンドを実行して確認すること：

1. **Lint Check**
   ```bash
   npm run lint
   ```
   - すべてのlint警告を解決する
   - any型の使用を避ける
   - Function型は具体的な型に置き換える

2. **Test Suite**
   ```bash
   npm test
   ```
   - すべてのテストが成功することを確認
   - ブランチカバレッジ80%以上を維持

3. **TypeScript Build**
   ```bash
   npm run build
   ```
   - ビルドエラーがないことを確認
   - 型エラーをすべて解決

## 型定義のベストプラクティス

### モックオブジェクトの型定義
テストでモックを使用する際は、`test-utils/mocks.ts`に定義された型を使用する：
- `MockChannel`
- `MockSocket`
- `MockPresence`

### ヘルパー関数の活用
型安全なヘルパー関数を使用してモックの呼び出しを取得：
- `findEventBusCall()` - EventBusのon呼び出しを検索
- `findChannelCall()` - Channelのon呼び出しを検索
- `getMockCalls()` - モック関数の呼び出しを型安全に取得

### BotConfigurationの必須プロパティ
```typescript
{
  authUrl: string
  hubUrl: string  
  hubId: string
  profile: {
    displayName: string
    avatarId: string
  }
  context?: {
    mobile: boolean
    embed: boolean
    hmd: boolean
  }
}
```

## コミット前の確認事項

1. `npm run lint` - 警告0件
2. `npm test` - 全テスト成功
3. `npm run build` - ビルド成功

この3つすべてが成功していることを確認してからコミットすること。