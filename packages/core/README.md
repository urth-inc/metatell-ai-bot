# @metatell/bot-core

MetaTell Bot SDKのコアライブラリ。

## 必要要件

- Node.js 20 以上（推奨: 22+）
- TypeScript 5.0+

## インストール

```bash
npm install @metatell/bot-core
# または
pnpm add @metatell/bot-core
# または
yarn add @metatell/bot-core
```

## 使い方

```typescript
import { CoreServiceFactory } from '@metatell/bot-core';

const factory = new CoreServiceFactory({
  organizationId: 'your-org-id',
  hubId: 'your-hub-id',
  avatarData: {
    displayName: 'MyBot',
    avatarUrl: 'https://example.com/avatar.vrm'
  }
});
```

## 主なサービス

### EventBus

イベントの発行と購読を管理します。

```typescript
const eventBus = container.get(EventBus);

// イベントの購読
eventBus.on('custom.event', (data) => {
  console.log('イベントを受信:', data);
});

// イベントの発行
eventBus.emit('custom.event', { message: 'Hello' });

eventBus.on(SystemEvents.AVATAR_SPAWNED, (avatar) => {
  console.log('アバターがスポーンされました:', avatar.id);
});
```

### AvatarController

ボットアバターの管理とアニメーション制御。

```typescript
const avatarController = container.get(AvatarController);

// アバターをスポーン
await avatarController.spawn();

// アニメーション再生
await avatarController.playAnimation(PresetAnimationId.WAVE);

// 移動
await avatarController.setPosition({ x: 10, y: 0, z: 5 });
```

### その他のサービス

- **AnimationService**: VRMアニメーションの管理
- **MessageService**: NAFプロトコルメッセージの送受信
- **PresenceManager**: ユーザープレゼンスの追跡
- **AuthenticationService**: 認証処理
- **ConfigurationProvider**: 設定管理

## License

MIT
