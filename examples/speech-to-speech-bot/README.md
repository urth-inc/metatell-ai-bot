# Speech-to-Speech Bot

音声認識→LLM→音声合成の流れで動作するボットの実装例です。Google Cloud Speech-to-Text、Google Gemini、Google Cloud Text-to-Speechを組み合わせて使用します。

## 🚀 セットアップ

### 1. 依存関係のインストール
```bash
# 依存関係のインストール
pnpm install

# TypeScriptのビルド
pnpm build
```

### 2. Google Cloud設定

1. [Google Cloud Console](https://console.cloud.google.com)でプロジェクトを作成
2. Speech-to-Text APIとText-to-Speech APIを有効化
3. サービスアカウントキーを作成してJSONファイルをダウンロード
4. 環境変数に設定：
```bash
export GOOGLE_APPLICATION_CREDENTIALS="path/to/your/service-account-key.json"
```

### 3. Gemini API設定

1. [Google AI Studio](https://makersuite.google.com/app/apikey)でAPIキーを取得
2. `.env`ファイルを作成：
```bash
cp .env.example .env
# .envファイルを編集してGEMINI_API_KEYを設定
```

## 📁 ファイル構造

```
examples/speech-to-speech-bot/
├── src/
│   ├── main.ts                    # メインエントリポイント
│   ├── speech-to-speech-bot.ts    # メインボットクラス
│   ├── speech-recognizer.ts       # Google Speech-to-Text
│   ├── gemini-llm-processor.ts    # Google Gemini処理
│   └── speech-synthesizer.ts      # Google Text-to-Speech
├── recordings/                    # 録音ファイル保存先（自動作成）
└── .env.example                   # 環境変数のサンプル
```

## 🎯 実行方法

```bash
# ボットを起動
npm start <room-url>

# 例
npm start https://metatell-dev.app/scJgijz
```

### 使い方

- **自動音声認識**: 話しかけると自動的に文字起こしされます
- **LLM処理**: Google Geminiが応答を生成します
- **音声合成**: テキストが音声に変換されて再生されます
- `q` - 終了（Ctrl+Cでも可）

VAD（音声活動検出）により、発話の開始と終了を自動検出します。
1秒以上の無音で発話区切りと判定し、処理を開始します。

## 🎨 主要コンポーネント

### SpeechToSpeechBot (`speech-to-speech-bot.ts`)
- 音声認識→LLM→音声合成のパイプライン管理
- リアルタイム音声処理
- アバター自動追跡機能

### SpeechRecognizer (`speech-recognizer.ts`)
- Google Cloud Speech-to-Text API連携
- リアルタイムストリーミング認識
- 日本語対応

### GeminiLLMProcessor (`gemini-llm-processor.ts`)
- Google Gemini API連携
- 会話コンテキスト管理
- プロンプトエンジニアリング

### SpeechSynthesizer (`speech-synthesizer.ts`)
- Google Cloud Text-to-Speech API連携
- 日本語音声合成
- WAVフォーマット変換

## 🔧 技術的な詳細

- **音声フォーマット**: 48kHz, 16bit, モノラル
- **フレームサイズ**: 960サンプル（20ms）
- **トランスポート**: LiveKit WebRTC（`@metatell/bot-realtime` を使用）
- **LLMモデル**: Gemini 1.5 Pro
- **音声認識言語**: 日本語（ja-JP）
- **音声合成**: Wavenet音声

## 🛠️ カスタマイズ

### LLMプロンプトの変更

`gemini-llm-processor.ts`のシステムプロンプトを編集して、ボットの性格や応答スタイルを変更できます。

### 音声パラメータの調整

`speech-synthesizer.ts`で音声の速度、ピッチ、ボリュームを調整できます。

### 言語の変更

各コンポーネントの言語コードを変更することで、他の言語にも対応できます。

## 📝 注意事項

1. **API料金**
   - Google CloudとGoogle Geminiの使用量に応じて料金が発生します
   - 開発時は料金アラートを設定することをお勧めします

2. **レイテンシー**
   - 音声認識→LLM→音声合成の各ステップで遅延が発生します
   - ネットワーク環境により応答時間が変わります

3. **認証情報の管理**
   - サービスアカウントキーとAPIキーは安全に管理してください
   - 本番環境では環境変数や秘密管理サービスを使用してください

## 🐛 トラブルシューティング

### 音声が認識されない場合
- マイクの権限を確認
- 音声レベルのしきい値を調整
- Google Cloud APIの有効化を確認

### LLMの応答が遅い場合
- Gemini APIの状態を確認
- モデルをGemini 1.5 Flashに変更して高速化

### 音声合成が失敗する場合
- Google Cloud APIの割り当てを確認
- 音声フォーマットの設定を確認
