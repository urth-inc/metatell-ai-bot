# Metatell Bot Quick Start Guide

## 🚀 指定されたルームに接続する

URL: https://metatell.app/DfueGup/palatable-hospitable-outing

### 方法1: npm scriptを使う（最も簡単）

```bash
# 依存関係をインストール
npm install

# 指定のルームにボットを接続
npm run bot:room
```

### 方法2: start.shスクリプトを使う

```bash
# 実行権限を付与（初回のみ）
chmod +x start.sh

# デフォルトのルームに接続
./start.sh

# 別のルームに接続
./start.sh https://metatell.app/other-room-id/room-name
```

### 方法3: 環境変数を使う

```bash
# .envファイルを作成
cp .env.example .env

# .envファイルを編集してURLを設定
# METATELL_URL=https://metatell.app/DfueGup/palatable-hospitable-outing

# ボットを起動
npm run bot
```

### 方法4: 直接実行

```bash
# ビルド
npm run build

# URLを引数として渡して実行
node dist/metatell-bot.js https://metatell.app/DfueGup/palatable-hospitable-outing
```

## 🤖 ボットの機能

接続すると、ボットは以下の機能を提供します：

- **自動挨拶**: 新しいユーザーが入室すると歓迎メッセージを送信
- **チャットコマンド**:
  - `hello` / `hi` - 挨拶を返します
  - `help` - 使い方を表示
  - `!status` / `!info` - ルームの状態を表示
  - `!time` / `!date` - 現在時刻を表示

## ⚙️ カスタマイズ

### ボット名を変更

```bash
# 環境変数で指定
BOT_NAME="My Custom Bot" npm run bot:room

# または .env ファイルで設定
BOT_NAME=My Custom Bot
```

### 認証が必要な場合

```bash
# 環境変数で認証トークンを設定
METATELL_AUTH_TOKEN="your-token-here" npm run bot:room
```

## 🛑 ボットの停止

`Ctrl + C` を押すとボットが終了メッセージを送信してから切断します。

## 📝 ログ

ボットはデバッグモードで動作し、以下の情報を表示します：
- WebSocket接続状態
- ユーザーの入退室
- 送受信メッセージ
- エラー情報

## 🔧 トラブルシューティング

### 接続できない場合
1. URLが正しいか確認
2. インターネット接続を確認
3. ファイアウォールがWebSocket (wss://) をブロックしていないか確認

### 認証エラー
- プライベートルームの場合は認証トークンが必要です
- `METATELL_AUTH_TOKEN` 環境変数を設定してください

### ビルドエラー
```bash
# クリーンビルド
npm run clean
npm run build
```