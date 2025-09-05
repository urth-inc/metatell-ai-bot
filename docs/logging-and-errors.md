# ロギング / レート制御 / エラー処理

## ロギング

`createMetatellClient({ logger: 'info' | 'debug' | 'silent' })` で出力レベルを指定できます。拡張が必要な場合は `sdk/logging` のプロバイダを差し替え可能です。

```ts
import { getLogger } from '@metatell/bot-sdk' // 内部ロガー取得
const logger = getLogger('my-module')
logger.debug('something happened', { foo: 1 })
```

## レート制御

送信頻度を抑制したい場合は `getRateLimit` / `setRateLimit` を利用します。

```ts
client.setRateLimit('messages', 2) // 1 秒あたり 2 通まで
client.setRateLimit('moves', 10)
```

## エラー階層と再試行

- `MetatellError`（基底）
  - `AuthError`（認証）
  - `NetworkError`（ネットワーク）
  - `NotFoundError`（リソースなし）
  - `RateLimitError`（制限超過）

実装例:

```ts
try {
  await client.chat.send('hello')
} catch (e) {
  if (e.name === 'RateLimitError') {
    // バックオフして再試行
  }
}
```

`AgentClient` ではアニメーション関連の `AnimationPlaybackError` など、用途別の例外も用意されています。
