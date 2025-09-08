# @metatell/bot-sdk

MetaTell BotをTypeScript/Node.jsで構築するための公式SDK。

## 必要要件

- Node.js 22+ (推奨)
- ESMモジュールサポート
- TypeScript 5.0+ (TypeScriptプロジェクトの場合)

## インストール

```bash
npm install @metatell/bot-sdk
# または
pnpm add @metatell/bot-sdk
# または
yarn add @metatell/bot-sdk
```

## クイックスタート

```typescript
import { createMetatellClient } from '@metatell/bot-sdk';

async function main() {
  // クライアント作成
  const client = createMetatellClient({
    serverUrl: 'wss://metatell.app',
    roomId: 'YOUR_ROOM_ID',
    username: 'MyBot',
    // token: process.env.METATELL_TOKEN, // 認証が必要な場合
    logger: 'info'
  });

  // エラーハンドリング
  client.on('error', (error) => {
    console.error('ボットエラー:', error);
  });

  // 接続
  await client.connect();
  
  // ボット情報取得
  const botInfo = await client.getInfo();
  console.log('接続しました:', botInfo.username);

  // チャットメッセージ処理
  client.chat.onMessage(async ({ from, text, mention, reply }) => {
    // メンションに応答
    if (mention?.sessionId === botInfo.sessionId) {
      await reply(`こんにちは ${from.name}さん！「${text}」とおっしゃいましたね。`);
    }
  });

  // アバターをスポーン
  await client.avatar.select('default-avatar');
  await client.avatar.spawn();
}

main().catch(console.error);
```

## 主な機能

### 接続管理

```typescript
// 接続
await client.connect();

// 切断
await client.disconnect();

// 接続状態
const isConnected = client.isConnected;

// ボット情報
const info = await client.getInfo();
// { sessionId, userId, username }
```

### チャット

```typescript
// メッセージ送信
await client.chat.send('こんにちは！');

// メンション付き送信
await client.chat.mention('userId', '@user さん、こんにちは！');

// メッセージ受信
client.chat.onMessage(async (event) => {
  console.log(`${event.from.name}: ${event.text}`);
  
  // 返信
  await event.reply('メッセージありがとうございます！');
});
```

### アバター制御

```typescript
// アバター選択
await client.avatar.select('avatar-asset-id');

// スポーン
await client.avatar.spawn();

// 移動
await client.avatar.moveTo({ x: 10, y: 0, z: 5 });

// 回転（度数）
await client.avatar.rotateTo({ x: 0, y: 90, z: 0 });

// アニメーション再生
await client.avatar.play('wave', {
  loop: true,
  duration: 5000
});

// アニメーション停止
await client.avatar.stop();

// デスポーン
await client.avatar.despawn();
```

### ルームとプレゼンス

```typescript
// 全ユーザー取得
const users = await client.room.getUsers();

// 特定ユーザー取得
const user = await client.room.getUser('userId');
```

### イベント

```typescript
// 接続イベント
client.on('connected', () => {});
client.on('disconnected', (reason) => {});
client.on('error', (error) => {});

// ユーザーイベント
client.on('user-join', (user) => {});
client.on('user-leave', (user) => {});

// チャットイベント
client.on('chat-message', (message) => {});

// アバターイベント
client.on('avatar-spawned', (avatar) => {});
client.on('avatar-moved', (position) => {});

// リスナー削除
const off = client.on('event', handler);
off(); // 購読解除
```

## エラーハンドリング

```typescript
import { MetatellError, AuthError, NetworkError } from '@metatell/bot-sdk';

try {
  await client.connect();
} catch (error) {
  if (error instanceof AuthError) {
    console.error('認証に失敗しました:', error.message);
  } else if (error instanceof NetworkError) {
    console.error('ネットワークエラー:', error.message);
  }
}
```

## ベストプラクティス

1. **エラーハンドリング**: 接続エラーと切断を必ず処理する
2. **レート制限**: メッセージ頻度に注意
3. **クリーンアップ**: 終了時は適切に切断
4. **セキュリティ**: トークンはハードコードせず環境変数を使用

## License

MIT

## 関連パッケージ

- [@metatell/bot-core](../core/README.md) - コアサービスとインフラストラクチャ
- [@metatell/bot-cli](../cli/README.md) - 開発用CLIツール
- [@metatell/bot-realtime](../realtime/README.md) - リアルタイム通信レイヤー