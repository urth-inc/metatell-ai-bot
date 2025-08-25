# VRMアバターアニメーション機能実装計画書 v4

## 概要
metatell-ai-botにVRMアバターのアニメーション機能を実装する計画書です。v-air_clientの実装を参考に、管理画面で事前設定されたアニメーションをBot側から指定して再生できるようにします。

## 改訂履歴
- v2: 責務分担の明確化、NAFプロトコル設計の詳細化
- v3: SDKの拡張性・堅牢性強化、エラーハンドリング設計追加
- v4: IMessageServiceの純粋性確保、テスト計画の拡充

## 現状分析

### v-air_clientの実装構造

#### 1. アニメーションシステムの構成要素

```
v-air_client/
├── utils/vrm/vrmAnimation.ts         # VRMAファイルの読み込みとキャッシュ
├── components/
│   ├── vrm-avatar.js                 # VRMアバターコンポーネント
│   ├── vrm-avatar-status-manager.js  # アバター状態管理
│   └── animation-mixer.js            # Three.js AnimationMixer管理
└── utils/cachedApiClient.ts          # APIクライアント（アバター情報取得）
```

#### 2. アニメーション処理フロー

1. **アバター情報の取得**
   - `getCachedAvatar(avatarId)` でアバター情報を取得
   - レスポンスに `animations` 配列が含まれる
   ```typescript
   {
     id: "avatar-id",
     animations: [
       { id: "custom1", vrmaFilePath: "animations/custom1.vrma" },
       { id: "custom2", vrmaFilePath: "animations/custom2.vrma" }
     ]
   }
   ```

2. **アニメーションの種類**
   - **デフォルトアニメーション**: idle, walking, greeting, thankful, jumping系など
   - **カスタムアニメーション**: UUID形式のIDで識別（管理画面で設定）

3. **アニメーション再生の仕組み**
   - `vrm-avatar-status-manager` がアバターの状態を管理
   - `avatarStatusChanged` イベントでアニメーション切り替え
   - `animation-mixer` がThree.jsのAnimationMixerを使用して実際に再生

## アーキテクチャ設計

### 責務分担の明確化

#### レイヤー構造と責務

```
┌─────────────────────────────────────────────┐
│         AgentClient (Public API)            │
│  - playAnimation(animationId)               │
│  - getAvailableAnimations()                 │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│       IAvatarController (状態管理)          │
│  - playAnimation(animationId)               │
│  - state管理 (isSpawned, currentAnimation)  │
│  - IMessageService経由でNAF送信             │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌──────────────────┐   ┌─────────────────────┐
│ IMessageService  │   │ IAnimationService   │
│  - sendNAFR()    │   │  - getAvailable     │
│  - NAF通信抽象化 │   │    Animations()     │
└──────────────────┘   └─────────────────────┘
        │                       │
        ▼                       ▼
┌──────────────────┐   ┌─────────────────────┐
│ IChannelService  │   │  AvatarApiClient    │
│  - push()        │   │  - fetchAvatar()    │
└──────────────────┘   └─────────────────────┘
```

### 各層の詳細設計

#### 1. AgentClient (Public API層)
**責務**: SDK利用者向けの統一されたAPI提供

```typescript
// packages/sdk/src/sdk/AgentClient.ts

// SDKの設定（外部から注入可能）
export interface AnimationConfig {
  fallbackAnimations?: VRMAnimation[]  // APIエラー時のフォールバック
  defaultLoopBehavior?: AnimationLoopBehavior  // デフォルトのループ設定
  enableAnimationEvents?: boolean  // イベント発火の有効化
}

export class AgentClient {
  constructor(
    config: AgentClientConfig & { 
      animationConfig?: AnimationConfig 
    }
  ) {
    // 外部から設定を注入
    this.animationConfig = config.animationConfig || {}
  }

  /**
   * アバターアニメーションを再生
   * @param animationId - アニメーションID (preset名 or UUID)
   * @param options - 再生オプション
   * @returns Promise<AnimationPlaybackResult>
   * @throws AnimationNotFoundError | AvatarNotSpawnedError | NetworkError
   */
  async playAnimation(
    animationId: string,
    options?: AnimationPlayOptions
  ): Promise<AnimationPlaybackResult> {
    const avatarController = this.serviceFactory.getAvatarController()
    
    try {
      const result = await avatarController.playAnimation(animationId, options)
      
      // イベント待機（設定で有効化されている場合）
      if (this.animationConfig.enableAnimationEvents) {
        await this.waitForAnimationStart(result.playbackId)
      }
      
      return result
    } catch (error) {
      // 具体的なエラー型に変換
      if (error.message.includes('not spawned')) {
        throw new AvatarNotSpawnedError(
          'Avatar must be spawned to play animation'
        )
      }
      if (error.message.includes('not found')) {
        throw new AnimationNotFoundError(
          `Animation '${animationId}' not found`
        )
      }
      throw new AnimationPlaybackError(
        `Failed to play animation: ${error.message}`,
        error
      )
    }
  }

  /**
   * アニメーション再生の開始を待機
   * @private
   */
  private async waitForAnimationStart(
    playbackId: string,
    timeoutMs = 5000
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.eventBus.off('animation:started', handler)
        reject(new AnimationTimeoutError(
          `Animation start confirmation timeout after ${timeoutMs}ms`
        ))
      }, timeoutMs)

      const handler = (event: AnimationEvent) => {
        if (event.playbackId === playbackId) {
          clearTimeout(timeout)
          this.eventBus.off('animation:started', handler)
          resolve()
        }
      }

      this.eventBus.on('animation:started', handler)
    })
  }

  /**
   * 利用可能なアニメーション一覧を取得
   * @returns Promise<VRMAnimation[]>
   */
  async getAvailableAnimations(): Promise<VRMAnimation[]> {
    const animationService = this.serviceFactory.getAnimationService()
    const avatarId = this.config.avatarId
    
    try {
      if (!avatarId) {
        // 外部から注入されたフォールバックを使用
        return this.animationConfig.fallbackAnimations || []
      }
      
      return await animationService.getAvailableAnimations(avatarId)
    } catch (error) {
      this.logger.warn('Failed to fetch animations, using fallback', { error })
      return this.animationConfig.fallbackAnimations || []
    }
  }

  /**
   * アニメーション関連イベントの購読
   */
  onAnimationEvent(
    event: 'started' | 'completed' | 'failed',
    handler: (event: AnimationEvent) => void
  ): () => void {
    return this.eventBus.on(`animation:${event}`, handler)
  }
}
```

#### 2. IAvatarController (状態管理層)
**責務**: アバターの状態管理とアニメーション再生の実行

```typescript
// packages/sdk/src/core/interfaces/IAvatarController.ts
export interface IAvatarController {
  // 既存のメソッド
  spawnAvatar(avatarId: string): Promise<void>
  despawnAvatar(): Promise<void>
  moveAvatar(position: Position): Promise<void>
  
  // 新規追加
  playAnimation(animationId: string): Promise<void>
  getCurrentAnimation(): string | null
}

// packages/sdk/src/core/services/AvatarController.ts
export class AvatarController implements IAvatarController {
  private currentAnimation: string | null = null
  private currentPlaybackId: string | null = null

  constructor(
    private messageService: IMessageService,
    private presenceManager: IPresenceManager,
    private eventBus: IEventBus,
    private logger: ILogger
  ) {}

  async playAnimation(
    animationId: string,
    options?: AnimationPlayOptions
  ): Promise<AnimationPlaybackResult> {
    if (!this.isSpawned) {
      throw new AvatarNotSpawnedError()
    }

    const playbackId = uuidv4()
    const timestamp = Date.now()
    
    // 状態を更新
    this.currentAnimation = animationId
    this.currentPlaybackId = playbackId

    // NAFメッセージの構築（AvatarControllerの責務）
    const message: AnimationNAFMessage = {
      dataType: 'animation',
      data: {
        networkId: this.networkId,
        owner: this.clientId,
        animationId,
        playbackId,
        options,
        timestamp
      }
    }

    // MessageServiceは単にメッセージを送信するだけ（純粋性を保つ）
    await this.messageService.sendNAFR(message)

    // イベント発火（他のコンポーネントが監視できるように）
    this.eventBus.emit('animation:played', {
      animationId,
      playbackId,
      options
    })

    this.logger.info('Animation played', { 
      animationId, 
      playbackId,
      options 
    })

    return {
      playbackId,
      animationId,
      startedAt: timestamp,
      expectedDuration: this.calculateExpectedDuration(animationId, options)
    }
  }

  getCurrentAnimation(): string | null {
    return this.currentAnimation
  }

  getCurrentPlaybackId(): string | null {
    return this.currentPlaybackId
  }

  private calculateExpectedDuration(
    animationId: string,
    options?: AnimationPlayOptions
  ): number | undefined {
    // 実装は省略（アニメーション情報から計算）
    return undefined
  }
}
```

#### 3. IAnimationService (データ取得層)
**責務**: アニメーション設定データの取得のみ（状態を持たない）

```typescript
// packages/sdk/src/core/interfaces/IAnimationService.ts
export interface IAnimationService {
  /**
   * アバターに紐づくアニメーション設定を取得
   */
  getAvailableAnimations(avatarId: string): Promise<VRMAnimation[]>
}

// packages/sdk/src/core/services/AnimationService.ts
export class AnimationService implements IAnimationService {
  constructor(
    private apiClient: AvatarApiClient,
    private logger: ILogger,
    private cache: Map<string, VRMAnimation[]> = new Map()
  ) {}

  async getAvailableAnimations(avatarId: string): Promise<VRMAnimation[]> {
    // キャッシュチェック
    if (this.cache.has(avatarId)) {
      return this.cache.get(avatarId)!
    }

    try {
      const avatarInfo = await this.apiClient.fetchAvatarInfo(avatarId)
      const animations = avatarInfo.animations || []
      
      // キャッシュに保存
      this.cache.set(avatarId, animations)
      
      return animations
    } catch (error) {
      this.logger.warn('Failed to fetch avatar animations', { 
        avatarId, 
        error 
      })
      throw new AnimationFetchError(
        `Failed to fetch animations for avatar ${avatarId}`,
        error
      )
    }
  }

  /**
   * キャッシュをクリア
   */
  clearCache(avatarId?: string): void {
    if (avatarId) {
      this.cache.delete(avatarId)
    } else {
      this.cache.clear()
    }
  }
}
```

## 実装計画

### Phase 1: 基盤整備

#### 1.1 カスタムエラー型の定義

**ファイル**: `packages/sdk/src/core/errors/animation.ts`
```typescript
/**
 * アニメーション機能の基底エラークラス
 */
export class AnimationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

/**
 * アバターが未スポーン時のエラー
 */
export class AvatarNotSpawnedError extends AnimationError {
  constructor(message = 'Avatar must be spawned to play animation') {
    super(message, 'AVATAR_NOT_SPAWNED')
  }
}

/**
 * アニメーションが見つからない時のエラー
 */
export class AnimationNotFoundError extends AnimationError {
  constructor(
    public readonly animationId: string,
    message?: string
  ) {
    super(
      message || `Animation '${animationId}' not found`,
      'ANIMATION_NOT_FOUND'
    )
  }
}

/**
 * アニメーション再生エラー
 */
export class AnimationPlaybackError extends AnimationError {
  constructor(message: string, cause?: Error) {
    super(message, 'PLAYBACK_ERROR', cause)
  }
}

/**
 * アニメーションタイムアウトエラー
 */
export class AnimationTimeoutError extends AnimationError {
  constructor(
    public readonly timeoutMs: number,
    message?: string
  ) {
    super(
      message || `Animation operation timed out after ${timeoutMs}ms`,
      'ANIMATION_TIMEOUT'
    )
  }
}

/**
 * アニメーション取得エラー
 */
export class AnimationFetchError extends AnimationError {
  constructor(message: string, cause?: Error) {
    super(message, 'FETCH_ERROR', cause)
  }
}

/**
 * 権限エラー
 */
export class AnimationPermissionError extends AnimationError {
  constructor(message = 'Permission denied to play animation') {
    super(message, 'PERMISSION_DENIED')
  }
}
```

#### 1.2 データ構造の定義

**ファイル**: `packages/sdk/src/core/types/animation.ts`
```typescript
// ループ動作の定義（拡張可能）
export type AnimationLoopBehavior = 
  | 'once'      // 1回再生
  | 'repeat'    // 無限ループ
  | 'clamp'     // 再生後最後のフレームで停止
  | { count: number }  // 指定回数ループ

export interface VRMAnimation {
  id: string           // アニメーションID（UUID or preset name）
  name: string         // 表示名
  vrmaFilePath?: string // カスタムアニメーションのファイルパス
  loop: AnimationLoopBehavior  // ループ設定（拡張可能）
  duration?: number    // アニメーション時間（ms）
  metadata?: Record<string, unknown>  // 拡張用メタデータ
}

// 再生オプション
export interface AnimationPlayOptions {
  loop?: AnimationLoopBehavior  // デフォルトを上書き
  speed?: number  // 再生速度（1.0 = 通常）
  startTime?: number  // 開始時間（ms）
  priority?: number  // 優先度（高い値が優先）
}

// 再生結果
export interface AnimationPlaybackResult {
  playbackId: string  // 再生インスタンスの一意ID
  animationId: string  // 再生中のアニメーションID
  startedAt: number  // 再生開始タイムスタンプ
  expectedDuration?: number  // 予想再生時間
}

// アニメーションイベント
export interface AnimationEvent {
  type: 'started' | 'completed' | 'failed'
  playbackId: string
  animationId: string
  timestamp: number
  error?: Error  // failedの場合のみ
}

export interface AnimationNAFMessage {
  dataType: 'animation'
  data: {
    networkId: string
    owner: string
    animationId: string
    playbackId: string  // animationRunId → playbackIdに統一
    options?: AnimationPlayOptions
    timestamp: number
  }
}
```

### Phase 2: NAFプロトコル設計

#### 2.1 NAF vs NAFR の選択根拠

**NAFRを選択する理由:**
- **信頼性優先**: アニメーション再生は「一度きりのイベント」であり、確実に届くべき
- **ユーザー体験**: アニメーションが再生されないと、Botの応答が伝わらない
- **許容可能な遅延**: アニメーション再生の数十ms程度の遅延は許容範囲

**トレードオフ分析:**
| 項目 | NAF (unreliable) | NAFR (reliable) |
|------|------------------|-----------------|
| 配信保証 | なし | あり |
| 遅延 | 低い | やや高い（再送処理） |
| 適用場面 | 位置更新など高頻度 | イベント系の一度きり |

#### 2.2 メッセージ構造設計

**新しいdataTypeとして定義する理由:**
- 既存のメッセージタイプ（u, um, r）と明確に区別
- v-air_clientでの拡張性を考慮
- 将来的な機能追加（アニメーションキャンセル等）に対応可能

```typescript
// packages/sdk/src/core/types/naf.ts
export interface AnimationNAFMessage {
  dataType: 'animation'  // 新しいdataType
  data: {
    networkId: string        // 送信者のネットワークID
    owner: string           // 送信者のclientId
    animationId: string     // アニメーションID
    animationRunId: string  // 実行ID（重複実行防止）
    timestamp: number       // タイムスタンプ
  }
}
```

#### 2.3 既存クライアントとの互換性

**互換性確保の方法:**
1. **Unknown dataType の無視**: v-air_clientは未知のdataTypeを無視する実装
2. **段階的移行**: 最初はBotのみが送信、v-air_client側で対応後に相互送信

**検証項目:**
- [ ] v-air_clientが'animation' dataTypeを受信してもクラッシュしない
- [ ] エラーログが過度に出力されない
- [ ] 既存のNAFメッセージ処理に影響しない

**フォールバック案（必要に応じて）:**
既存のumメッセージのcomponentsに埋め込む方法:
```typescript
// 互換性を最優先する場合の代替案
{
  dataType: 'um',
  data: {
    // 既存のフィールド
    components: {
      '0': { position, rotation, scale },
      // アニメーション用の予約済みコンポーネントID
      '15': {
        template: 'animation',
        data: {
          animationId: 'greeting',
          animationRunId: 'xxx-xxx'
        }
      }
    }
  }
}
```

#### 2.4 MessageServiceの純粋性維持

```typescript
// packages/sdk/src/core/services/MessageService.ts
export class MessageService implements IMessageService {
  /**
   * NAFメッセージを送信（Unreliable）
   * MessageServiceは汎用的なメッセージ送信のみを担当
   */
  async sendNAF(message: NAFMessage): Promise<void> {
    await this.channelService.push(
      this.hubChannel,
      'naf',
      message
    )
    
    this.logger.debug('NAF message sent', { 
      dataType: message.dataType 
    })
  }

  /**
   * NAFメッセージを送信（Reliable）
   * 特定のドメイン知識を持たない純粋な送信処理
   */
  async sendNAFR(message: NAFMessage): Promise<void> {
    await this.channelService.push(
      this.hubChannel,
      'nafr',  // Reliableチャンネル
      message
    )
    
    this.logger.debug('NAFR message sent', { 
      dataType: message.dataType 
    })
  }

  // アニメーション固有のメソッドは追加しない
  // sendAnimationMessage() のような特化メソッドは作らない
}
```

### Phase 3: Bot API実装

#### 3.1 アニメーションコマンドの追加

**ファイル**: `packages/bot/src/bots/commands/AnimationCommand.ts`
```typescript
export class AnimationCommand extends BotCommand {
  name = 'animation'
  description = 'Play avatar animation'
  
  async execute(args: string[]): Promise<CommandResult> {
    const animationId = args[0]
    
    if (!animationId) {
      return {
        success: false,
        message: 'Please specify animation ID'
      }
    }
    
    try {
      await this.client.playAnimation(animationId)
      return {
        success: true,
        message: `Playing animation: ${animationId}`
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to play animation: ${error.message}`
      }
    }
  }
}
```

#### 3.2 AgentClient APIの拡張

**ファイル**: `packages/sdk/src/sdk/AgentClient.ts`
```typescript
export class AgentClient {
  // ... existing code ...
  
  /**
   * Play avatar animation
   * @param animationId - Animation ID (preset name or custom UUID)
   */
  async playAnimation(animationId: string): Promise<void> {
    const avatarController = this.serviceFactory.getAvatarController()
    await avatarController.playAnimation(animationId)
  }
  
  /**
   * Get available animations for current avatar
   */
  async getAvailableAnimations(): Promise<VRMAnimation[]> {
    const animationService = this.serviceFactory.getAnimationService()
    const avatarId = this.config.avatarId
    
    if (!avatarId) {
      return this.getDefaultAnimations()
    }
    
    const config = await animationService.getAvatarAnimations(avatarId)
    return config.animations
  }
  
  private getDefaultAnimations(): VRMAnimation[] {
    return [
      { id: 'idle', name: 'Idle', loopOnce: false },
      { id: 'walking', name: 'Walking', loopOnce: false },
      { id: 'greeting', name: 'Greeting', loopOnce: true },
      { id: 'thankful', name: 'Thankful', loopOnce: true }
    ]
  }
}
```

### Phase 4: 管理画面との連携

#### 4.1 アバター情報APIクライアント

**ファイル**: `packages/sdk/src/core/services/AvatarApiClient.ts`
```typescript
export class AvatarApiClient {
  constructor(private baseUrl: string) {}
  
  async getAvatarInfo(avatarId: string): Promise<AvatarInfo> {
    const response = await fetch(`${this.baseUrl}/api/v1/avatars/${avatarId}`)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch avatar info: ${response.statusText}`)
    }
    
    return response.json()
  }
}
```

### Phase 5: CLI統合

#### 5.1 CLIコマンドの追加

**ファイル**: `packages/bot/src/cli/commands/plan.ts`
```typescript
export const ANIMATION_COMMANDS = [
  {
    command: '/anim <id>',
    description: 'Play animation by ID',
    kind: 'animation' as const
  },
  {
    command: '/anim list',
    description: 'List available animations',
    kind: 'animation-list' as const
  }
]
```

## 使用例

### 1. 基本的な使用方法

```typescript
// SDK初期化時に設定を注入
const client = new AgentClient({
  url: 'https://metatell.app/room',
  token: 'xxx',
  animationConfig: {
    // ハードコードではなく、環境から注入
    fallbackAnimations: [
      { id: 'idle', name: 'Idle', loop: 'repeat' },
      { id: 'greeting', name: 'Greeting', loop: 'once', duration: 2000 }
    ],
    defaultLoopBehavior: 'once',
    enableAnimationEvents: true  // 再生確認を有効化
  }
})

// アニメーション再生（結果を受け取る）
try {
  const result = await client.playAnimation('greeting')
  console.log(`Animation started: ${result.playbackId}`)
} catch (error) {
  if (error instanceof AvatarNotSpawnedError) {
    console.error('Please spawn avatar first')
  } else if (error instanceof AnimationNotFoundError) {
    console.error(`Animation not found: ${error.animationId}`)
  } else if (error instanceof AnimationTimeoutError) {
    console.error('Animation start confirmation timeout')
  }
}
```

### 2. イベント駆動での使用

```typescript
// イベントリスナー登録
const unsubscribe = client.onAnimationEvent('started', (event) => {
  console.log(`Animation ${event.animationId} started`)
})

const unsubscribeComplete = client.onAnimationEvent('completed', (event) => {
  console.log(`Animation ${event.animationId} completed`)
})

// アニメーション再生（イベントで結果を監視）
client.playAnimation('greeting').catch(console.error)

// クリーンアップ
unsubscribe()
unsubscribeComplete()
```

### 3. 高度な再生オプション

```typescript
// カスタムループ設定で再生
await client.playAnimation('walking', {
  loop: { count: 3 },  // 3回ループ
  speed: 1.5,          // 1.5倍速
  priority: 10         // 高優先度
})

// 無限ループで再生
await client.playAnimation('idle', {
  loop: 'repeat'
})

// 最後のフレームで停止
await client.playAnimation('pose', {
  loop: 'clamp'
})
```

### 4. CLIから
```bash
/anim greeting       # 挨拶アニメーション再生
/anim list          # 利用可能なアニメーション一覧
/anim 550e8400-...  # カスタムアニメーション再生
/anim greeting --loop=3  # 3回ループ
/anim idle --loop=repeat  # 無限ループ
```

## 技術的考慮事項

### 1. キャッシュ戦略
- アバター情報は初回取得時にキャッシュ
- VRMAファイルもメモリにキャッシュ（v-air_clientと同様）

### 2. エラーハンドリング
- アバター未スポーン時のエラー
- 存在しないアニメーションIDの処理
- ネットワークエラーの処理

### 3. 互換性
- v-air_clientとのNAFメッセージ互換性を維持
- 既存のアバターステータス管理との整合性

## テスト計画

### 1. ユニットテスト

#### カスタムエラー型のテスト
```typescript
describe('Animation Error Handling', () => {
  it('should throw AnimationNotFoundError for non-existent animationId', async () => {
    // モック設定: アニメーションが存在しない
    mockAnimationService.getAvailableAnimations.mockResolvedValue([])
    
    await expect(client.playAnimation('non-existent-id'))
      .rejects.toThrow(AnimationNotFoundError)
    
    await expect(client.playAnimation('non-existent-id'))
      .rejects.toMatchObject({
        code: 'ANIMATION_NOT_FOUND',
        animationId: 'non-existent-id'
      })
  })

  it('should throw AvatarNotSpawnedError if avatar is not spawned', async () => {
    // アバターをdespawn
    await client.despawnAvatar()
    
    await expect(client.playAnimation('greeting'))
      .rejects.toThrow(AvatarNotSpawnedError)
    
    await expect(client.playAnimation('greeting'))
      .rejects.toMatchObject({
        code: 'AVATAR_NOT_SPAWNED'
      })
  })

  it('should throw AnimationTimeoutError when confirmation times out', async () => {
    const client = new AgentClient({
      animationConfig: {
        enableAnimationEvents: true  // イベント待機を有効化
      }
    })
    
    // イベントを発火しない（タイムアウトを引き起こす）
    mockEventBus.emit.mockImplementation(() => {})
    
    await expect(client.playAnimation('greeting'))
      .rejects.toThrow(AnimationTimeoutError)
    
    await expect(client.playAnimation('greeting'))
      .rejects.toMatchObject({
        code: 'ANIMATION_TIMEOUT',
        timeoutMs: 5000
      })
  })

  it('should throw AnimationFetchError when API fails', async () => {
    // API呼び出しが失敗
    mockAnimationService.getAvailableAnimations
      .mockRejectedValue(new Error('Network error'))
    
    await expect(animationService.getAvailableAnimations('avatar-id'))
      .rejects.toThrow(AnimationFetchError)
    
    await expect(animationService.getAvailableAnimations('avatar-id'))
      .rejects.toMatchObject({
        code: 'FETCH_ERROR',
        cause: expect.objectContaining({
          message: 'Network error'
        })
      })
  })
})
```

#### AnimationServiceのテスト
```typescript
describe('AnimationService', () => {
  it('should cache animations after successful fetch', async () => {
    const avatarId = 'test-avatar'
    const animations = [
      { id: 'custom1', name: 'Custom 1', loop: 'once' }
    ]
    
    mockApiClient.fetchAvatarInfo.mockResolvedValue({ animations })
    
    // 初回呼び出し
    const result1 = await service.getAvailableAnimations(avatarId)
    expect(mockApiClient.fetchAvatarInfo).toHaveBeenCalledTimes(1)
    
    // 2回目はキャッシュから
    const result2 = await service.getAvailableAnimations(avatarId)
    expect(mockApiClient.fetchAvatarInfo).toHaveBeenCalledTimes(1)
    
    expect(result1).toEqual(result2)
  })
  
  it('should clear cache when requested', async () => {
    const avatarId = 'test-avatar'
    
    // キャッシュを作成
    await service.getAvailableAnimations(avatarId)
    
    // キャッシュをクリア
    service.clearCache(avatarId)
    
    // 再度フェッチが必要
    await service.getAvailableAnimations(avatarId)
    expect(mockApiClient.fetchAvatarInfo).toHaveBeenCalledTimes(2)
  })
})
```

#### AvatarControllerのテスト
```typescript
describe('AvatarController.playAnimation', () => {
  it('should construct NAF message correctly', async () => {
    const animationId = 'greeting'
    const options = { loop: 'once', speed: 1.5 }
    
    await controller.playAnimation(animationId, options)
    
    expect(mockMessageService.sendNAFR).toHaveBeenCalledWith(
      expect.objectContaining({
        dataType: 'animation',
        data: expect.objectContaining({
          animationId,
          options,
          networkId: expect.any(String),
          owner: expect.any(String),
          playbackId: expect.any(String),
          timestamp: expect.any(Number)
        })
      })
    )
  })
  
  it('should update state and emit events', async () => {
    const result = await controller.playAnimation('greeting')
    
    expect(controller.getCurrentAnimation()).toBe('greeting')
    expect(controller.getCurrentPlaybackId()).toBe(result.playbackId)
    
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'animation:played',
      expect.objectContaining({
        animationId: 'greeting',
        playbackId: result.playbackId
      })
    )
  })
})
```

### 2. 統合テスト

#### E2Eシナリオ
```typescript
describe('Animation E2E', () => {
  it('CLI → Bot → NAF → Animation', async () => {
    // 1. CLIコマンド実行
    await cli.execute('/anim greeting')
    
    // 2. NAFRメッセージ送信確認
    expect(mockChannel.push).toHaveBeenCalledWith('nafr', {
      dataType: 'animation',
      data: expect.objectContaining({
        animationId: 'greeting'
      })
    })
    
    // 3. 状態確認
    expect(avatarController.getCurrentAnimation()).toBe('greeting')
  })
})
```

### 3. 互換性検証

#### v-air_clientとの互換性テスト

**検証環境:**
- metatell-ai-bot: 新実装
- v-air_client: 既存バージョン

**検証項目:**
1. **基本動作確認**
   - [ ] Botがアニメーションメッセージを送信
   - [ ] v-air_clientがクラッシュしない
   - [ ] コンソールエラーが出ない

2. **ログ確認**
   - [ ] 未知のdataTypeに関する警告が1回のみ
   - [ ] スパムログが発生しない

3. **既存機能への影響**
   - [ ] 位置同期（u/um）が正常動作
   - [ ] 音声通信が正常動作
   - [ ] その他のNAF機能が正常動作

**検証手順:**
```bash
# 1. テスト環境起動
npm run dev

# 2. Botを起動しアニメーション送信
/anim greeting

# 3. v-air_clientのコンソールログ確認
# Expected: Unknown dataType: animation (1回のみ)

# 4. 既存機能の動作確認
/move 10 0 10  # 位置移動
/say hello     # チャット
```

## スケジュール

1. **Phase 1**: 基盤整備（1日）
2. **Phase 2**: NAFプロトコル拡張（1日）
3. **Phase 3**: Bot API実装（1日）
4. **Phase 4**: 管理画面連携（1日）
5. **Phase 5**: CLI統合とテスト（1日）

計: 5日間

## リスクと対策

### リスク1: NAFプロトコルの互換性
**対策**: v-air_clientの実装を正確に模倣し、メッセージフォーマットを完全に一致させる

### リスク2: アニメーションファイルの取得失敗
**対策**: デフォルトアニメーションへのフォールバック機能を実装

### リスク3: パフォーマンス問題
**対策**: アニメーションデータのキャッシュとプリロード機能の実装

## 段階的実装アプローチ

### MVP（最小実装）
**目標**: デフォルトアニメーションの再生のみ

1. AvatarControllerにplayAnimation追加
2. MessageService経由でNAFR送信
3. デフォルト4種類のアニメーション対応
4. 互換性テスト実施

### Phase 1（基本機能）
**目標**: カスタムアニメーション対応

1. AnimationService実装
2. AvatarApiClient実装
3. 管理画面との連携
4. キャッシュ機能

### Phase 2（CLI統合）
**目標**: CLIからの操作

1. CLIコマンド実装
2. アニメーション一覧表示
3. E2Eテスト

## 実装判断ポイント

### 互換性戦略の選択

**Option A: 新dataType（推奨）**
```typescript
{ dataType: 'animation', data: {...} }
```
- ✅ クリーンな設計
- ✅ 将来の拡張性
- ⚠️ v-air_client側の対応待ち

**Option B: 既存umメッセージ活用**
```typescript
{ dataType: 'um', data: { components: { '15': {...} } } }
```
- ✅ 即座に動作可能
- ❌ 設計の複雑化
- ❌ 他コンポーネントとの衝突リスク

**推奨**: まずOption Aで実装し、互換性問題があればOption Bにフォールバック

## 今後の拡張案

1. **アニメーションのシーケンス再生**
   - 複数のアニメーションを順番に再生
   - 例: greeting → thankful の連続再生

2. **条件付きアニメーション**
   - 特定の条件（時間、イベント）でアニメーション自動再生
   - 例: ユーザー入室時に自動でgreeting

3. **アニメーションのプリセット**
   - よく使うアニメーションの組み合わせを保存
   - CLIショートカット設定

4. **リアクション機能**
   - ユーザーのメッセージに応じた自動アニメーション
   - 感情分析との連携

## 設計原則のまとめ

### 責務の純粋性
1. **IMessageService**: NAF/NAFRメッセージの「封筒」を届けるだけ。中身は知らない。
2. **IAvatarController**: アバター状態管理とメッセージ構築の責務
3. **IAnimationService**: データ取得のみ、状態を持たない

### SDKとしての品質
1. **外部注入可能**: ハードコードされたデフォルト値を排除
2. **拡張可能**: `AnimationLoopBehavior`のような柔軟な型定義
3. **型安全**: カスタムエラー型による明確なエラーハンドリング
4. **フィードバック**: イベントシステムによる状態通知

### インターフェイス設計の指針
> 「これはアバターの核となる操作か？」を常に自問自答する

- ✅ `playAnimation`: アバターの核となるアクション
- ✅ `getCurrentAnimation`: 状態取得として有用
- ⚠️ 将来的な肥大化に注意

## まとめ

この設計により：
- ✅ 責務が明確に分離され、保守性が向上
- ✅ IMessageServiceの純粋性を維持
- ✅ NAFRによる確実なメッセージ配信
- ✅ 堅牢なエラーハンドリング
- ✅ SDKとしての適切な抽象化と拡張性
- ✅ v-air_clientとの互換性を考慮
- ✅ 段階的な実装が可能