# データチャネルの信頼性設計（将来的な拡張）

## 現在の実装

現在、すべてのデータ送信は`reliable: true`で実行されている：

```typescript
// packages/realtime/src/livekit.ts
await this.room!.localParticipant!.publishData(bytes, {
  reliable: true,
  topic,
})
```

## 将来的な拡張案

### 1. トピック別の信頼性設定

```typescript
// transport.tsに追加
export interface TopicConfig {
  reliable?: boolean      // default: true
  ordered?: boolean       // default: true
  maxRetransmits?: number // reliableがfalseの場合のみ有効
  maxPacketLifeTime?: number // ミリ秒単位
}

export interface RealtimeOptions {
  // 既存のプロパティ...
  
  /** トピック別の詳細設定 */
  topicConfigs?: Record<string, TopicConfig>
}

// デフォルト設定の例
const defaultTopicConfigs: Record<string, TopicConfig> = {
  control: {
    reliable: true,  // 制御メッセージは確実に届ける
  },
  events: {
    reliable: true,  // イベントも確実に
  },
  transcript: {
    reliable: false, // 文字起こしは低遅延優先
    maxRetransmits: 2,
  },
}
```

### 2. LiveKitAdapterの実装変更

```typescript
// livekit.tsの修正案
async send(topic: string, data: Uint8Array | string): Promise<void> {
  // ... 既存のバリデーション ...
  
  // トピック別の設定を取得
  const topicConfig = this.options?.topicConfigs?.[topic] || {
    reliable: true,
  }
  
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  
  await this.room!.localParticipant!.publishData(bytes, {
    reliable: topicConfig.reliable ?? true,
    topic,
    // LiveKitが将来サポートする可能性のある追加オプション
    ...(topicConfig.maxRetransmits !== undefined && {
      maxRetransmits: topicConfig.maxRetransmits,
    }),
  })
}
```

### 3. 使用例

```typescript
// 低遅延が求められる用途での設定例
const client = await createAgentClient({
  voice: {
    enabled: true,
  },
  realtimeOptions: {
    topicConfigs: {
      // 制御コマンドは確実に
      control: { reliable: true },
      
      // リアルタイム文字起こしは速度優先
      transcript: { 
        reliable: false,
        maxRetransmits: 1,
      },
      
      // 分析データは多少の損失を許容
      analytics: {
        reliable: false,
        maxRetransmits: 0,
      },
    },
  },
})
```

## 考慮事項

1. **デフォルトは安全側に**: 明示的に指定されない限り`reliable: true`を維持
2. **トピックの性質に応じた設定**: リアルタイム性が重要なデータと確実性が重要なデータを区別
3. **メトリクスとモニタリング**: 信頼性設定による影響を測定できるようにする

## 実装タイミング

この拡張は以下の条件が揃ったときに実装を検討：

1. 実際のユースケースで低遅延が要求される
2. ネットワーク品質による影響が測定される
3. LiveKit SDKが追加のQoSオプションをサポートする