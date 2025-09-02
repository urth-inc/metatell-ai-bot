# AgentClientとRealtimeTransportの統合計画

## 背景

現在、`AgentClient`は`IConnectionManager`と`IMessageService`を通じてPhoenixチャネル経由でメッセージをやり取りしている。今回実装した`RealtimeTransport`をこの既存のアーキテクチャに統合し、音声通信機能を追加する必要がある。

## 統合方針

### 1. BotServiceFactoryでの注入

```typescript
// packages/sdk/src/sdk/factories/BotServiceFactory.ts

export class BotServiceFactory implements IBotServiceFactory {
  // 既存のサービス
  private connectionManager: IConnectionManager
  private messageService: IMessageService
  
  // 新規追加
  private realtimeTransport?: RealtimeTransport
  
  constructor(config: BotServiceConfig) {
    // 既存のサービス初期化
    this.connectionManager = new PhoenixConnectionManager(config)
    this.messageService = new PhoenixMessageService(this.connectionManager)
    
    // RealtimeTransportの初期化（音声機能が有効な場合）
    if (config.voice?.enabled) {
      const TransportImpl = config.voice.useMock 
        ? MockAdapter 
        : LiveKitAdapter
      
      this.realtimeTransport = new TransportImpl()
    }
  }
  
  getRealtimeTransport(): RealtimeTransport | undefined {
    return this.realtimeTransport
  }
}
```

### 2. AgentClientでの利用

```typescript
// packages/sdk/src/sdk/AgentClient.ts

export class AgentClient implements IAgentClient {
  private realtimeTransport?: RealtimeTransport
  
  constructor(factory: IBotServiceFactory, config: BotConfig) {
    // 既存のコード
    this.connectionManager = factory.getConnectionManager()
    this.messageService = factory.getMessageService()
    
    // 新規追加
    this.realtimeTransport = factory.getRealtimeTransport()
  }
  
  async connect(options: ConnectOptions): Promise<void> {
    // 既存のPhoenix接続
    await this.connectionManager.connect(options)
    
    // 音声接続（有効な場合）
    if (this.realtimeTransport && options.voice?.enabled) {
      await this.connectRealtime(options)
    }
  }
  
  private async connectRealtime(options: ConnectOptions): Promise<void> {
    if (!this.realtimeTransport) return
    
    // RealtimeTransportのイベントをAgentClientのイベントにマッピング
    this.realtimeTransport.on((event) => {
      switch (event.type) {
        case 'data':
          if (event.topic === 'transcript') {
            // 音声フレームとして処理
            this.emit('voiceFrameReceived', {
              participantId: event.from || 'unknown',
              pcmData: new Int16Array(event.payload.buffer)
            })
          }
          break
        case 'error':
          this.emit('error', new Error(`Realtime: ${event.message}`))
          break
      }
    })
    
    // LiveKitトークンの取得（Phoenixセッション経由）
    const tokenProvider = async () => {
      const response = await this.messageService.request('livekit:token', {
        sessionId: this.connectionManager.getSessionId()
      })
      return response.token
    }
    
    // RealtimeTransportに接続
    await this.realtimeTransport.connect({
      url: options.voice.livekitUrl || 'wss://livekit.metatell.app',
      tokenProvider,
      topics: ['control', 'events', 'transcript'],
      audioPublish: {
        sampleRate: 48000,
        channels: 1,
        frameDurationMs: 20,
        trackName: 'bot-audio'
      }
    })
    
    // 音声パブリッシャーを開始
    await this.realtimeTransport.startAudioPublisher()
  }
  
  async sendVoiceFrame(pcmData: Int16Array): Promise<void> {
    if (!this.realtimeTransport) {
      throw new Error('Voice not enabled')
    }
    
    await this.realtimeTransport.pushPcmFrame(pcmData)
  }
  
  async disconnect(): Promise<void> {
    // RealtimeTransportを切断
    if (this.realtimeTransport) {
      await this.realtimeTransport.disconnect()
    }
    
    // 既存のPhoenix切断
    await this.connectionManager.disconnect()
  }
}
```

### 3. 設定インターフェースの拡張

```typescript
// packages/sdk/src/types/config.ts

export interface BotServiceConfig {
  // 既存の設定
  baseUrl: string
  apiKey?: string
  
  // 音声機能の設定を追加
  voice?: {
    enabled: boolean
    useMock?: boolean // 開発/テスト用
    livekitUrl?: string
  }
}

export interface ConnectOptions {
  // 既存のオプション
  url: string
  token: string
  
  // 音声オプションを追加
  voice?: {
    enabled: boolean
    livekitUrl?: string
  }
}
```

## 段階的な実装計画

### Phase 1: 基本統合（現在ここ）
- ✅ RealtimeTransportの実装
- ✅ LiveKitAdapterとMockAdapterの実装
- 🔄 BotServiceFactoryへの統合
- 🔄 AgentClientでの基本的な音声送受信

### Phase 2: 機能拡張
- [ ] ミュート/アンミュート機能
- [ ] 音声品質の動的調整
- [ ] 接続状態の詳細な監視

### Phase 3: プロダクション対応
- [ ] 自動再接続の強化
- [ ] エラーリトライ戦略
- [ ] メトリクス収集

## 技術的な考慮事項

1. **依存性の分離**: `@metatell/realtime`パッケージは`@metatell/sdk`のオプショナル依存として扱い、音声機能を使用しないユーザーはインストール不要とする。

2. **後方互換性**: 既存のAPIは変更せず、音声機能は完全にオプトインとする。

3. **テスト戦略**: MockAdapterを使用して、LiveKitサーバーなしでも音声機能のテストが可能。