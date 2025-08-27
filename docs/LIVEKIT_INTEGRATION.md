# LiveKit音声通信機能実装ガイド

## 概要
Metatell SDKにLiveKitを使用した音声通信機能を実装しました。これにより、AIアバターとの音声対話が可能になります。

## アーキテクチャ

### 主要コンポーネント
1. **LiveKitService** - LiveKit Roomの管理とオーディオトラックの処理
2. **AgentClient** - 音声機能へのファサードインターフェース
3. **Token API** - LiveKitトークンの取得エンドポイント

### 通信フロー
```
1. WebSocket接続後、session_idを取得
2. session_idを使用してLiveKitトークンをリクエスト
3. LiveKit Roomに接続
4. マイクの公開/購読を管理
```

## 設定

### BotConfiguration
```typescript
const config: BotConfiguration = {
  serverUrl: 'wss://your-server.com',
  hubUrl: 'https://your-hub.com',
  hubId: 'your-hub-id',
  profile: {
    displayName: 'Bot Name',
    avatarId: 'bot-avatar-id',
  },
  // LiveKit設定
  livekitUrl: 'wss://your-livekit-server.com',
  apiBaseUrl: 'https://your-api-server.com',
}
```

### 環境変数
LiveKitサーバーには以下の環境変数が必要です：
- `LIVEKIT_API_KEY` - LiveKit API Key
- `LIVEKIT_API_SECRET` - LiveKit API Secret
- `LIVEKIT_WORKER_API_SECRET` - Worker API認証用シークレット

## 使用方法

### 1. 基本的な音声通信の有効化

```typescript
import { CoreServiceFactory, createAgentClient } from '@metatell/sdk'

// SDKの初期化
const factory = new CoreServiceFactory(config)
const agent = createAgentClient(factory)

// WebSocket接続
await agent.connect({
  url: 'https://metatell.app/your-hub',
})

// 音声通信を有効化
await agent.enableVoice()

// マイクを公開
await agent.publishMicrophone()
```

### 2. 音声イベントのハンドリング

```typescript
// 音声接続イベント
agent.on('voice:connected', () => {
  console.log('Voice connected')
})

// マイク公開イベント
agent.on('voice:microphone:published', () => {
  console.log('Microphone published')
})

// リモート音声トラック購読イベント
agent.on('voice:track:subscribed', (data) => {
  console.log('Audio track subscribed:', data.trackSid)
})

// エラーハンドリング
agent.on('voice:error', (error) => {
  console.error('Voice error:', error)
})
```

### 3. マイクのミュート/アンミュート

```typescript
// マイクをミュート
await agent.setMicrophoneEnabled(false)

// マイクをアンミュート
await agent.setMicrophoneEnabled(true)

// 現在の状態を確認
const isPublished = agent.isMicrophonePublished()
```

### 4. スピーカー音量の調整

```typescript
// 音量を設定 (0.0 - 1.0)
agent.setSpeakerVolume(0.8)

// 現在の音量を取得
const volume = agent.getSpeakerVolume()
```

### 5. 音声通信の切断

```typescript
// マイクの公開を停止
await agent.unpublishMicrophone()

// 音声通信を無効化
await agent.disableVoice()
```

## サンプルアプリケーション

```typescript
import { CoreServiceFactory, createAgentClient } from '@metatell/sdk'

async function startVoiceChat() {
  // 設定
  const config = {
    serverUrl: 'wss://metatell.app',
    hubUrl: 'https://metatell.app',
    hubId: 'your-hub-id',
    profile: {
      displayName: 'Voice Bot',
      avatarId: 'bot-avatar-id',
    },
    livekitUrl: 'wss://your-livekit-server.com',
    apiBaseUrl: 'https://your-api-server.com',
  }

  // SDKの初期化
  const factory = new CoreServiceFactory(config)
  const agent = createAgentClient(factory)

  // イベントリスナーの設定
  agent.on('voice:connected', () => {
    console.log('✅ Voice connected')
  })

  agent.on('voice:microphone:published', () => {
    console.log('🎤 Microphone active')
  })

  agent.on('voice:track:subscribed', (data) => {
    console.log('🔊 Listening to remote audio:', data.trackSid)
  })

  agent.on('voice:error', (error) => {
    console.error('❌ Voice error:', error)
  })

  try {
    // 接続
    await agent.connect({ url: `${config.hubUrl}/${config.hubId}` })
    console.log('Connected to hub')

    // 音声を有効化
    await agent.enableVoice()
    console.log('Voice enabled')

    // マイクを公開
    await agent.publishMicrophone()
    console.log('Microphone published')

    // ユーザー操作を待つ
    console.log('Press Ctrl+C to disconnect...')

  } catch (error) {
    console.error('Failed to start voice chat:', error)
  }
}

// アプリケーションの起動
startVoiceChat()
```

## トラブルシューティング

### 一般的な問題

1. **LiveKitトークンの取得に失敗する**
   - APIエンドポイントが正しく設定されているか確認
   - session_idが正しく取得されているか確認

2. **音声が再生されない**
   - ブラウザの自動再生ポリシーにより、ユーザーのクリック操作が必要な場合があります
   - スピーカー音量が0になっていないか確認

3. **マイクが公開できない**
   - ブラウザのマイク権限が許可されているか確認
   - 既に他のアプリケーションでマイクが使用されていないか確認

### デバッグ情報の取得

```typescript
// 接続状態を確認
const isVoiceEnabled = agent.isVoiceEnabled()
const isMicPublished = agent.isMicrophonePublished()

console.log({
  voiceEnabled: isVoiceEnabled,
  microphonePublished: isMicPublished,
  connectionStatus: agent.getStatus(),
})
```

## セキュリティ考慮事項

1. **トークンの管理**
   - LiveKitトークンは短期間（10分）で期限切れになります
   - トークンはサーバーサイドで生成され、クライアントには秘密鍵を公開しません

2. **権限の制限**
   - トークンには`roomJoin`権限のみが付与されます
   - 追加の権限が必要な場合は、サーバーサイドで適切に設定してください

3. **通信の暗号化**
   - LiveKitはWebRTCを使用し、すべての音声データはエンドツーエンドで暗号化されます

## 今後の拡張

1. **ノイズキャンセリング**
   - Krispノイズフィルターの統合

2. **録音機能**
   - サーバーサイドでの録音機能の実装

3. **複数トラックのサポート**
   - 画面共有やビデオトラックのサポート

4. **接続品質の監視**
   - 接続統計情報の取得と表示