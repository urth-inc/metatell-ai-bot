# リリースプロセス

このプロジェクトはpnpm、changesets、npm OIDC trusted publishingを使用してリリースを管理しています。

## リリースワークフロー概要

1. **release.yml**: メインワークフロー（チェンジセット作成、バージョンPR作成・マージ、publish.yml呼び出し）
2. **publish.yml**: 再利用可能ワークフロー（npmへの公開とGitHubリリース作成）

## 初回セットアップ

### 1. スコープパッケージの公開設定

初回公開時は各パッケージの`package.json`に以下の設定が必要です：

```json
"publishConfig": {
  "access": "public",
  "registry": "https://registry.npmjs.org/"
}
```

### 2. npm OIDC Trusted Publisher の設定

各パッケージでOIDC trusted publisherを設定する必要があります：

1. [npmjs.com](https://www.npmjs.com) にログイン
2. 各パッケージの設定ページへ移動：
   - [@metatell/bot-core](https://www.npmjs.com/package/@metatell/bot-core/access)
   - [@metatell/bot-sdk](https://www.npmjs.com/package/@metatell/bot-sdk/access)
   - [@metatell/bot-cli](https://www.npmjs.com/package/@metatell/bot-cli/access)
   - [@metatell/bot-realtime](https://www.npmjs.com/package/@metatell/bot-realtime/access)
3. "Publishing access" → "Trusted Publishers" セクションで設定
4. "GitHub Actions" を選択して以下を入力：
   - **Organization/Username**: `urth-inc`
   - **Repository**: `metatell-ai-bot`
   - **Workflow file name**: `release.yml` （注意：publish.ymlを呼び出す呼び出し元のrelease.ymlを指定）
   - **Environment name**: (空欄のまま)

### 3. GitHub リポジトリの設定

NPM_TOKENは不要です。OIDCが自動的に認証を処理します。

## 開発フロー

### 1. 変更の記録

開発中に変更を記録：

```bash
# changeset を作成
pnpm changeset

# 対話的に以下を選択：
# 1. 変更したパッケージを選択
# 2. バージョンタイプを選択：
#    - patch: バグ修正
#    - minor: 新機能（後方互換性あり）
#    - major: 破壊的変更
# 3. 変更内容の説明を入力

# コミット
git add .changeset/
git commit -m "chore: add changeset for [変更内容]"
git push
```

### 2. リリースの実行

リリース担当者が実行：

1. [GitHub Actions](https://github.com/urth-inc/metatell-ai-bot/actions/workflows/release.yml) へアクセス
2. "Run workflow" をクリック
3. 設定：
   - Branch: `develop`
   - Semver bump type: `patch`、`minor`、または `major` を選択
4. "Run workflow" をクリック

### 3. リリースプロセス

自動的に以下が実行されます：

1. **release.yml ワークフロー**：
   - コミット履歴から自動的にチェンジセットを生成（create-changeset.mjs）
   - changesets/actionでバージョン更新PRを作成
   - PRを自動マージ（gh pr merge --auto --merge）
   - マージ完了を待機（最大10分）
   - publish.ymlワークフローを呼び出し

2. **publish.yml ワークフロー**（release完了後に自動実行）：
   - 最新の`develop`ブランチをチェックアウト
   - 依存関係をインストール（pnpm install）
   - ワークスペース全体をビルド（pnpm build）
   - changesets/actionでnpmへ公開（OIDC認証、Provenance付き）
   - GitHub Releaseを自動作成
   - バージョンタグを作成

## トラブルシューティング

### 初回パッケージ公開エラー

エラー: `E404 Not Found - PUT https://registry.npmjs.org/@metatell%2fbot-* - Not found`

原因：スコープパッケージ（@組織名/*）の初回公開時に発生

対策：
1. 各パッケージの`package.json`に`publishConfig`を追加：
   ```json
   "publishConfig": {
     "access": "public",
     "registry": "https://registry.npmjs.org/"
   }
   ```
2. コミットしてPRを作成・マージ
3. リリースワークフローを再実行

### npm公開エラー（E403）

エラー: `npm error code E403`

原因と対策：
1. Trusted Publisherが未設定 → 上記のセットアップ手順を確認
2. ワークフロー名が一致しない → `release.yml` （呼び出し元）であることを確認
3. ブランチが異なる → `develop` ブランチから実行

### 権限エラー

エラー: `Error: HttpError: Resource not accessible by integration`

対策：リポジトリ設定でGitHub Actionsの権限を確認：
- Settings → Actions → General → Workflow permissions
- "Read and write permissions" を選択

## 注意事項

- npm CLI v11.5.1以降が必要（GitHub Actionsでは自動）
- セルフホストランナーはサポートされていません
- 各パッケージに1つのtrusted publisherのみ設定可能
- OIDCは`npm publish`のみに適用（installには従来の認証が必要）
