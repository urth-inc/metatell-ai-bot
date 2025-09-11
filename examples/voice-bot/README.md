# Voice Bot Example

LiveKitを使用したWAV音声再生・録音ボットの実装例です。@metatell/bot-sdkの音声機能を使用してWAVファイルのリアルタイム配信と、受信音声の録音が可能です。

## 🚀 セットアップ

```bash
# 依存関係のインストール
pnpm install

# TypeScriptのビルド
pnpm build
```

## 📁 ファイル構造

```
examples/voice-bot/
├── src/
│   ├── main.ts             # メインエントリポイント
│   ├── wav-voice-bot.ts    # WAVファイル再生・録音ボット
│   └── wav-player.ts       # WAVファイルリーダー（リサンプリング対応）
├── assets/                 # WAVファイル置き場
│   └── 3.wav              # サンプル音声（24kHz）
└── recordings/             # 録音ファイル保存先（自動作成）
```

## 🎯 実行方法

```bash
# インタラクティブモードで起動
npm start <room-url>

# 例
npm start https://metatell-dev.app/scJgijz

# カスタムWAVファイル指定
npm start <room-url> ./path/to/your.wav

# 開発モード（ファイル監視）
npm run dev <room-url>
```

### コマンド操作
起動後、以下のキーで操作できます：
- `p` - WAVファイルを再生
- `r` - 録音を開始
- `s` - 録音を停止して保存
- `q` - 終了（Ctrl+Cでも可）

録音は自動的に開始され、`recordings/`ディレクトリに保存されます。

## 🎨 主要コンポーネント

### WavVoiceBot
- WAVファイルを読み込んで音声として配信
- 24kHz → 48kHzの自動リサンプリング
- 3フレーム分のバッファリングで安定した再生
- リモート音声の録音機能
- 録音データのWAVファイル保存

### WavPlayer
- WAVファイルのヘッダー解析
- サンプルレート変換（線形補間）
- フレーム単位での音声データ提供

## 使い方

### 基本的な使い方

```bash
# ボットを起動してルームに接続
npm start https://metatell-dev.app/your-room-id

# カスタムWAVファイルを指定
npm start https://metatell-dev.app/your-room-id ./path/to/your.wav
```

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