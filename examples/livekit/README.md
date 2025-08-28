# LiveKit Audio ByteStream Agent

LiveKitルームに参加している参加者の音声をバイトストリームとして取得するエージェントの実装例です。

## セットアップ

1. 依存関係をインストール
```bash
npm install
```

2. 環境変数を設定
```bash
cp .env.example .env
# .envファイルを編集してLiveKitサーバーの情報を設定
```

## 実行方法

### 開発モード
```bash
npm run dev
```

### ビルドと本番実行
```bash
npm run build
npm start
```

## 機能

- LiveKitルームに接続
- 参加者の音声トラックを自動的に検出
- AudioByteStreamを使用して音声データを16kHz、モノラルでバッファリング
- 100ms分のサンプルごとにフレームを処理
- WAVファイルとして録音保存機能
- 取得したバイトストリームはSTT、録音、分析などに利用可能

## 録音機能

環境変数`ENABLE_RECORDING=true`を設定すると、各参加者の音声をWAVファイルとしてリアルタイムで保存します。

### 録音の仕組み
- **リアルタイム保存**: 音声データは受信と同時にファイルに書き込まれます
- **10秒ごとの自動フラッシュ**: データは定期的にディスクに強制書き込みされます
- **クラッシュ耐性**: アプリケーションが予期せず終了しても、その時点までの録音データは保存されています

### ファイル形式
録音ファイルは`recordings`ディレクトリに以下の形式で保存されます：
```
{ルーム名}_{参加者ID}_{タイムスタンプ}.wav
```

### 録音仕様
- サンプリングレート: 16kHz
- チャンネル数: 1（モノラル）
- ビット深度: 16bit
- フォーマット: PCM WAV

### 録音の終了タイミング
録音は以下のタイミングで自動的に終了し、WAVヘッダーが正しく更新されます：
- 参加者がルームから退出したとき
- 参加者が音声トラックを無効化したとき
- エージェントが終了したとき

## 環境変数

- `LIVEKIT_URL`: LiveKitサーバーのURL
- `LIVEKIT_API_KEY`: LiveKit APIキー
- `LIVEKIT_API_SECRET`: LiveKit APIシークレット
- `WORKER_MAX_IDLE_TIME`: ワーカーの最大アイドル時間（秒）
- `TARGET_ROOM_PATTERN`: 処理対象のルーム名パターン（正規表現）
- `AGENT_NAME`: エージェント名（明示的ディスパッチ用）
- `ENABLE_RECORDING`: 録音を有効にする（true/false）

## 特定のルームのみを処理する

`TARGET_ROOM_PATTERN`環境変数を使用して、特定のパターンにマッチするルームのみを処理できます。

例：
```bash
# microphoneで始まるルームのみを処理
TARGET_ROOM_PATTERN=^microphone:.*

# screenまたはmicrophoneで始まるルームを処理
TARGET_ROOM_PATTERN=^(screen|microphone):.*

# 特定のルーム名のみを処理
TARGET_ROOM_PATTERN=^myroom$
```

## コマンドラインから特定のルームに接続

開発時に特定のルームに直接接続する場合：
```bash
npm run dev -- connect --room <room-name>
```