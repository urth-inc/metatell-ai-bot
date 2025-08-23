# VRMアバターアニメーション機能実装計画書 v2

## 概要
metatell-ai-botにVRMアバターのアニメーション機能を実装する計画書です。v-air_clientの実装を参考に、管理画面で事前設定されたアニメーションをBot側から指定して再生できるようにします。

## 改訂履歴
- v2: 責務分担の明確化、NAFプロトコル設計の詳細化

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
export class AgentClient {
  /**
   * アバターアニメーションを再生
   * @param animationId - アニメーションID (preset名 or UUID)
   * @returns Promise<void>
   * @throws Error - アバター未スポーン時、無効なアニメーションID時
   */
  async playAnimation(animationId: string): Promise<void> {
    const avatarController = this.serviceFactory.getAvatarController()
    return avatarController.playAnimation(animationId)
  }

  /**
   * 利用可能なアニメーション一覧を取得
   * @returns Promise<VRMAnimation[]>
   */
  async getAvailableAnimations(): Promise<VRMAnimation[]> {
    const animationService = this.serviceFactory.getAnimationService()
    const avatarId = this.config.avatarId
    
    if (!avatarId) {
      return animationService.getDefaultAnimations()
    }
    
    return animationService.getAvailableAnimations(avatarId)
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

  constructor(
    private messageService: IMessageService,
    private presenceManager: IPresenceManager,
    private eventBus: IEventBus,
    private logger: ILogger
  ) {}

  async playAnimation(animationId: string): Promise<void> {
    if (!this.isSpawned) {
      throw new Error('Avatar must be spawned to play animation')
    }

    const animationRunId = uuidv4()
    
    // 状態を更新
    this.currentAnimation = animationId

    // MessageServiceの新メソッドを使用
    // （MessageServiceでanimationメッセージのフォーマットを管理）
    await this.messageService.sendAnimationMessage(
      animationId,
      animationRunId
    )

    // イベント発火（他のコンポーネントが監視できるように）
    this.eventBus.emit('animation:played', {
      animationId,
      animationRunId
    })

    this.logger.info('Animation played', { animationId, animationRunId })
  }

  getCurrentAnimation(): string | null {
    return this.currentAnimation
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
  
  /**
   * デフォルトアニメーション一覧を取得
   */
  getDefaultAnimations(): VRMAnimation[]
}

// packages/sdk/src/core/services/AnimationService.ts
export class AnimationService implements IAnimationService {
  constructor(
    private apiClient: AvatarApiClient,
    private logger: ILogger
  ) {}

  async getAvailableAnimations(avatarId: string): Promise<VRMAnimation[]> {
    try {
      const avatarInfo = await this.apiClient.fetchAvatarInfo(avatarId)
      
      // カスタムアニメーションとデフォルトをマージ
      const customAnimations = avatarInfo.animations || []
      const defaultAnimations = this.getDefaultAnimations()
      
      return [...defaultAnimations, ...customAnimations]
    } catch (error) {
      this.logger.warn('Failed to fetch avatar animations, using defaults', { error })
      return this.getDefaultAnimations()
    }
  }

  getDefaultAnimations(): VRMAnimation[] {
    return [
      { id: 'idle', name: 'Idle', loopOnce: false },
      { id: 'walking', name: 'Walking', loopOnce: false },
      { id: 'greeting', name: 'Greeting', loopOnce: true, duration: 2000 },
      { id: 'thankful', name: 'Thankful', loopOnce: true, duration: 2000 },
    ]
  }
}
```

## 実装計画

### Phase 1: 基盤整備

#### 1.1 データ構造の定義

**ファイル**: `packages/sdk/src/core/types/animation.ts`
```typescript
export interface VRMAnimation {
  id: string           // アニメーションID（UUID or preset name）
  name: string         // 表示名
  vrmaFilePath?: string // カスタムアニメーションのファイルパス
  loopOnce: boolean    // 一度だけ再生するか
  duration?: number    // アニメーション時間（ms）
}

export interface AnimationNAFMessage {
  dataType: 'animation'
  data: {
    animationId: string      // 再生するアニメーションID
    animationRunId: string   // アニメーション実行の一意ID
    timestamp: number        // タイムスタンプ
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

#### 2.4 MessageServiceの拡張

```typescript
// packages/sdk/src/core/services/MessageService.ts
export class MessageService implements IMessageService {
  /**
   * アニメーションNAFメッセージを送信（Reliable）
   */
  async sendAnimationMessage(
    animationId: string,
    animationRunId: string
  ): Promise<void> {
    const message: AnimationNAFMessage = {
      dataType: 'animation',
      data: {
        networkId: this.networkId,
        owner: this.clientId,
        animationId,
        animationRunId,
        timestamp: Date.now()
      }
    }

    // NAFRで確実に送信
    await this.sendNAFR(message)
    
    this.logger.debug('Animation message sent', { 
      animationId, 
      animationRunId 
    })
  }
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

### 1. デフォルトアニメーションの再生
```typescript
// Botコード内で
await client.playAnimation('greeting')  // 挨拶アニメーション
await client.playAnimation('thankful')  // お礼アニメーション
```

### 2. カスタムアニメーションの再生
```typescript
// 管理画面で設定されたカスタムアニメーション
await client.playAnimation('550e8400-e29b-41d4-a716-446655440000')
```

### 3. CLIから
```bash
/anim greeting       # 挨拶アニメーション再生
/anim list          # 利用可能なアニメーション一覧
/anim 550e8400-...  # カスタムアニメーション再生
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

#### AnimationServiceのテスト
```typescript
describe('AnimationService', () => {
  it('should return default animations when API fails', async () => {
    // APIエラー時のフォールバック
  })
  
  it('should merge custom and default animations', async () => {
    // カスタムとデフォルトのマージ動作
  })
  
  it('should cache avatar animations', async () => {
    // キャッシュ動作の確認
  })
})
```

#### AvatarControllerのテスト
```typescript
describe('AvatarController.playAnimation', () => {
  it('should throw error when avatar not spawned', async () => {
    // 未スポーン時のエラー
  })
  
  it('should send NAFR message with correct format', async () => {
    // NAFRメッセージフォーマット検証
  })
  
  it('should update currentAnimation state', async () => {
    // 状態更新の確認
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

## まとめ

この設計により：
- ✅ 責務が明確に分離され、保守性が向上
- ✅ 既存の抽象化レイヤーを維持
- ✅ NAFRによる確実なメッセージ配信
- ✅ v-air_clientとの互換性を考慮
- ✅ 段階的な実装が可能