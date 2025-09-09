# @metatell/bot-cli

MetaTell Bot 開発とテスト用の CLI ツール。

## 必要要件

- Node.js 20 以上（推奨: 22+）

## インストール

```bash
# グローバルインストール
npm install -g @metatell/bot-cli

# または npx で実行
npx @metatell/bot-cli <command>

# または開発依存として
npm install --save-dev @metatell/bot-cli
```

## 使い方

```bash
# インタラクティブモード（デフォルト）
metatell-bot https://metatell.app/ROOM_ID

# 認証トークン付き
metatell-bot https://metatell.app/ROOM_ID -t "your-auth-token"

# カスタムボット名
metatell-bot https://metatell.app/ROOM_ID -n "MyBot"

# デバッグログ有効
metatell-bot https://metatell.app/ROOM_ID -d
```

## コマンド

### インタラクティブモード

```bash
metatell-bot https://metatell.app/ROOM_ID [options]
# または
metatell-bot interactive https://metatell.app/ROOM_ID [options]
```

**利用可能なコマンド:**
- `/say <message>` — チャットメッセージ送信
- `/move <x> <y> <z>` — アバター移動
- `/look <x> <y> <z>` または `/look @<username>` — 指定座標/ユーザーを見る
- `/nearby [radius]` — 近傍ユーザーを表示（既定 10m）
- `/users` — ルーム内の全ユーザーを表示
- `/status` — 接続状態を表示
- `/info` — ボット情報を表示
- `/avatar <id>` — アバターを変更
- `/assets` — 利用可能なアバター一覧
- `/anime <name>` または `/animation <name>` — アニメーション再生
- `/animations` — 利用可能なアニメーション一覧
- `/stop` — アニメーション停止（アイドルに戻す）
- `quit` / `exit` — 終了

### 接続テストコマンド

```bash
metatell-bot connect https://metatell.app/ROOM_ID [options]
```

### ルーム検査コマンド

```bash
metatell-bot inspect https://metatell.app/ROOM_ID [options]
```

## オプション

| オプション | エイリアス | 説明 | デフォルト |
|--------|-------|-------------|---------|
| `--token` | `-t` | 認証トークン（任意） | `METATELL_TOKEN` 環境変数 |
| `--name` | `-n` | ボット表示名 | "MetatellCLI" |
| `--debug` | `-d` | デバッグログ有効 | false |

## 環境変数

- `METATELL_TOKEN` — デフォルト認証トークン（任意）

## 開発

### ローカル開発環境のセットアップ

CLIをローカルで開発・テストする場合の手順：

```bash
# 1. リポジトリをクローン
git clone https://github.com/urth-inc/metatell-ai-bot.git
cd metatell-ai-bot

# 2. 依存関係をインストール
npm install

# 3. CLIパッケージへ移動
cd packages/cli

# 4. ビルド
npm run build

# 5. ローカルにリンク（グローバルコマンドとして登録）
npm link

# 6. 動作確認
metatell-bot --version
metatell-bot --help
```

### 開発時の便利なコマンド

```bash
# TypeScriptをウォッチモードでコンパイル
npm run dev

# ビルド
npm run build

# 型チェック
npm run typecheck

# テスト実行（ルートディレクトリから）
cd ../.. && npm test packages/cli/src/cli.spec.ts
```

### アンリンク（クリーンアップ）

開発が終了したら、グローバルリンクを削除：

```bash
npm unlink -g @metatell/bot-cli
```

## License

MIT
