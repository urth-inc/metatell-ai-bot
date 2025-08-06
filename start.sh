#!/bin/bash

# Metatell Bot Starter Script

# デフォルトのURL
DEFAULT_URL="https://metatell.app/DfueGup/palatable-hospitable-outing"

# URLを引数から取得、なければデフォルトを使用
METATELL_URL=${1:-$DEFAULT_URL}

# ボット名を環境変数から取得、なければデフォルト
BOT_NAME=${BOT_NAME:-"AI Assistant"}

echo "🚀 Starting Metatell Bot..."
echo "📍 URL: $METATELL_URL"
echo "🤖 Bot Name: $BOT_NAME"
echo ""

# 依存関係をインストール
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# TypeScriptをビルド
echo "🔨 Building TypeScript..."
npm run build

# ボットを起動
echo "🏃 Starting bot..."
export METATELL_URL="$METATELL_URL"
export BOT_NAME="$BOT_NAME"
node dist/metatell-bot.js "$METATELL_URL"