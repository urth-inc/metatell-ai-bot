# Voice AI Bot

LiveKitを使用したGoogle Gemini音声対話ボットの実装例です。@metatell/bot-sdkの音声機能を使用して、リアルタイムで音声を録音し、Geminiに送信して音声で応答を受け取ることができます。

## 🚀 セットアップ

### 1. 依存関係のインストール
```bash
# 依存関係のインストール
pnpm install

# TypeScriptのビルド
pnpm build
```

### 2. 環境設定
Google AI StudioからAPIキーを取得してください。

1. [Google AI Studio](https://aistudio.google.com/) にアクセス
2. 「Get API key」をクリック
3. APIキーをコピー
4. `.env`ファイルを作成して設定：
```bash
cp .env.example .env
# .envファイルを編集してGEMINI_API_KEYを設定
```

## 📁 ファイル構造

```
examples/voice-ai-bot/
├── src/
│   ├── main.ts               # メインエントリポイント
│   ├── gemini-voice-bot.ts   # Gemini音声対話ボット
│   └── gemini-voice-client.ts # Gemini APIクライアント
├── recordings/               # 録音ファイル保存先（自動作成）
└── .env.example              # 環境変数のサンプル
```

## 🎯 実行方法

```bash
# GEMINI_API_KEYを環境変数に設定
export GEMINI_API_KEY=your-gemini-api-key

# ボットを起動
npm start <room-url>

# 例
npm start https://metatell-dev.app/scJgijz
```

### 使い方

- **自動音声認識**: 話しかけると自動的にGeminiが応答します
- `q` - 終了（Ctrl+Cでも可）

VAD（音声活動検出）により、発話の開始と終了を自動検出します。
1秒以上の無音で発話区切りと判定し、Geminiが応答を生成します。

## 🎨 主要コンポーネント

### GeminiVoiceBot (`gemini-voice-bot.ts`)
- Google Geminiとのリアルタイム音声対話
- 音声認識と音声合成を統合
- 自動VAD（音声活動検出）による発話区切り
- リアルタイムストリーミング（20ms単位）
- アバター自動追跡機能

### GeminiVoiceClient (`gemini-voice-client.ts`)
- Gemini Live API (gemini-2.5-flash-live-preview) との通信
- リアルタイムストリーミング入力（sendRealtimeInput）
- 自動音声活動検出（Automatic Activity Detection）
- WAVフォーマットの音声データ変換

## 🔧 技術的な詳細

- **音声フォーマット**: 48kHz, 16bit, モノラル
- **フレームサイズ**: 960サンプル（20ms）
- **トランスポート**: LiveKit WebRTC
- **Geminiモデル**: gemini-2.5-flash-live-preview

## 🛠️ 技術詳細

### サンプルレート変換
```typescript
// 24kHz → 48kHzへのアップサンプリング例
private resample(input: Int16Array, inputRate: number, outputRate: number): Int16Array {
  const ratio = outputRate / inputRate
  // 線形補間による滑らかな変換
}
```

### フレームバッファリング
```typescript
// 3フレーム（60ms）分のバッファで音飛びを防止
private frameBuffer: Int16Array[] = []
private bufferSize = 3
```

### 音声フォーマット
- サンプルレート: 48kHz（LiveKit標準）
- チャンネル数: 1（モノラル）
- フレームサイズ: 960サンプル（20ms）
- ビット深度: 16bit（PCM）

## 実装上の注意点

1. **非同期ストリーミング**: 効率的な音声ストリーミングのための非同期イテラブル使用
2. **バッファリング**: 3フレーム分のバッファで安定した再生
3. **リサンプリング**: 線形補間による滑らかなサンプルレート変換
4. **メモリ管理**: 切断時の適切なクリーンアップ

## 📝 注意事項

1. **ホットリロード無効**
   - `@livekit/rtc-node`は開発時もホットリロードを使用しないでください

2. **サンプルレート**
   - WAVファイルは自動的に48kHzにリサンプリングされます
   - 元の音声品質を保つため、可能な限り48kHzのファイルを使用してください

3. **ネットワーク設定**
   - IPv6環境で接続が遅い場合は、IPv4を優先するか環境変数で設定してください
   ```bash
   ICE_TRANSPORT_POLICY=relay npm run demo:wav <room-url>
   ```

## 🐛 トラブルシューティング

### 音声が途切れる場合
- バッファサイズを調整（`bufferSize`を5-10に増やす）
- ネットワーク帯域を確認

### 音質が悪い場合
- 元のWAVファイルのサンプルレートを確認
- より高度なリサンプリングアルゴリズムの実装を検討

### 接続が遅い場合
- IPv4を優先的に使用
- TURN強制モードを試す（`ICE_TRANSPORT_POLICY=relay`）