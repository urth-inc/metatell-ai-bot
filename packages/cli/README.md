# @metatell/bot-cli

MetaTell Bot開発とテスト用のCLIツール。

## 必要要件

- Node.js 22+ (推奨)

## インストール

```bash
# グローバルインストール
npm install -g @metatell/bot-cli

# またはnpxで実行
npx @metatell/bot-cli <command>

# または開発依存として
npm install --save-dev @metatell/bot-cli
```

## 使い方

```bash
# インタラクティブモード（デフォルト）
metatell-cli https://metatell.app/ROOM_ID

# 認証トークン付き
metatell-cli https://metatell.app/ROOM_ID -t "your-auth-token"

# カスタムボット名
metatell-cli https://metatell.app/ROOM_ID -n "MyBot"

# デバッグログ有効
metatell-cli https://metatell.app/ROOM_ID -d
```

## コマンド

### インタラクティブモード

```bash
metatell-cli https://metatell.app/ROOM_ID [options]
# または
metatell-cli interactive https://metatell.app/ROOM_ID [options]
```

**利用可能なコマンド:**
- `/status` - 接続状態とルーム情報を表示
- `/users` - ルーム内の全ユーザーをリスト
- `/avatar spawn` - ボットアバターをスポーン
- `/avatar move <x> <y> <z>` - アバターを移動
- `/avatar animate <animation>` - アニメーション再生
- `/say <message>` - チャットメッセージ送信
- `/mention <user> <message>` - メンション付きメッセージ送信
- `/quit` または `/exit` - 切断して終了

### 接続テストコマンド

```bash
metatell-cli connect https://metatell.app/ROOM_ID [options]
```

### ルーム検査コマンド

```bash
metatell-cli inspect https://metatell.app/ROOM_ID [options]
```

## オプション

| オプション | エイリアス | 説明 | デフォルト |
|--------|-------|-------------|---------|
| `--token` | `-t` | 認証トークン（任意） | `METATELL_TOKEN`環境変数 |
| `--name` | `-n` | ボット表示名 | "MetatellCLI" |
| `--debug` | `-d` | デバッグログ有効 | false |

## 環境変数

- `METATELL_TOKEN` - デフォルト認証トークン（任意）

## License

MIT