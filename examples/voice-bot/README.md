# Voice Bot サンプル

このサンプルは、MetaTell Bot SDK の Voice I/O Bridge 機能を使用して音声対応ボットを作成する方法を示しています。

## セットアップ

### 通常の使用方法（npmパッケージを使用）

```bash
# 依存関係のインストール
npm install

# TypeScriptのビルド
npm run build

# 実行
npm start
```

### 開発時の使用方法（ワークスペースのパッケージを使用）

開発時は、ルートディレクトリから以下のように実行できます：

```bash
# ルートディレクトリから
pnpm build

# examples/voice-botディレクトリで
pnpm install # workspace:* の依存関係を解決
pnpm run dev # または pnpm run voice:simple
```

## 必要なパッケージ

- `@metatell/bot-sdk`: メインのSDK
- `@metatell/bot-realtime`: 音声機能用のリアルタイム通信パッケージ

## 機能

- **音声入出力**: 受信・送信音声ストリームの処理
- **STT統合**: 音声からテキストへの変換用モックSTT
- **TTS統合**: 応答を音声に変換するモックTTS
- **高レベルSDK API**: トランスポート実装の詳細を隠蔽する `enableVoice` API を使用
- **ミュート制御**: 音声ミュート機能のデモンストレーション

## アーキテクチャ

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Remote    │     │    Voice    │     │    Local    │
│   Audio     │────▶│   Bridge    │────▶│  STT/TTS    │
│  (Users)    │     │   (SDK)     │     │  Handlers   │
└─────────────┘     └─────────────┘     └─────────────┘
```

## 使い方

### シンプルボット

```typescript
import { createMetatellClient, enableVoice } from '@metatell/bot-sdk'

const client = createMetatellClient({ serverUrl, roomId, username })
await client.connect()

// 高レベルAPIで音声を有効化
const voice = await enableVoice(client, {
  handlers: {
    onRemotePcm: async (pcm, meta) => {
      // 受信音声を処理
    },
    getLocalPcmStream: async function* () {
      // 送信音声を提供
    }
  }
})
```

### サンプルの実行

```bash
# 環境変数を設定
export METATELL_SERVER_URL="wss://metatell.app"
export METATELL_ROOM_ID="your-room-id"
export METATELL_USERNAME="VoiceBot"

# シンプルボット
npm run voice:simple

# 会話ボット
npm run voice:conversation
```

## 音声フォーマット

- **サンプルレート**: 48000 Hz (48kHz)
- **フォーマット**: PCM16 (16ビット符号付き整数)
- **チャンネル**: モノラル (1チャンネル)
- **フレーム長**: 10ms または 20ms

## 実装上の注意点

1. **トランスポート抽象化**: SDK が LiveKit, WebRTC などの詳細を隠蔽
2. **ハンドラベース設計**: STT/TTS はハンドラ経由でプラガブル
3. **非同期ストリーミング**: 効率的な音声ストリーミングのための非同期イテラブル使用
4. **メモリ管理**: 切断時の適切なクリーンアップ

## 本番環境での統合

本番環境では、モック実装を実際のサービスに置き換えてください：

- **STT**: Google Speech-to-Text, Azure Speech, OpenAI Whisper
- **TTS**: Google Text-to-Speech, Azure Speech, ElevenLabs
- **AI**: GPT-4, Claude, またはカスタムモデル

## エラーハンドリング

SDK が処理するエラー:
- 接続失敗
- 音声フレーム検証
- 切断時のクリーンアップ
- 複数アタッチの防止

### エラーハンドリングの実装例

```typescript
try {
  const voice = await enableVoice(client, {
    transport: { type: 'mock' },
    handlers: {
      onRemotePcm: async (pcm, meta) => {
        try {
          await stt.addAudioFrame(pcm)
        } catch (error) {
          console.error('STT処理エラー:', error)
        }
      },
      getLocalPcmStream: async function* () {
        try {
          while (true) {
            yield await getTTSFrame()
          }
        } catch (error) {
          console.error('TTS処理エラー:', error)
        }
      }
    }
  })
} catch (error) {
  console.error('音声機能の有効化に失敗:', error)
}
```

## トラブルシューティング

### よくある問題

1. **接続エラー**
   ```
   Error: Connection failed
   ```
   - 解決方法: サーバーURLとルームIDを確認してください

2. **音声が聞こえない**
   - MockTransportを使用していることを確認
   - `transport: { type: 'mock' }` が設定されているか確認

3. **依存関係エラー**
   ```bash
   # ワークスペースの依存関係を再インストール
   pnpm install
   pnpm build
   ```

4. **TypeScriptエラー**
   ```bash
   # 型チェックの実行
   npm run typecheck
   ```