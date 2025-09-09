# ロギング / レート制御 / エラー処理

## ロギング

- 詳細ログは `createMetatellClient({ debug: true })` で有効化できます。
- ロガー拡張が必要な場合は SDK の Logging SPI を利用してプロバイダを差し替えできます。

```ts
import { DefaultLoggerProvider, registerLoggerProvider, getLogger } from '@metatell/bot-sdk'

// プロバイダ差し替え（必要に応じて）
const provider = new DefaultLoggerProvider()
provider.setLogLevel('debug')
registerLoggerProvider(provider, { allowOverwrite: true })

// 任意モジュール用ロガー
const logger = getLogger('my-module')
logger.debug('something happened', { foo: 1 })
```

リングバッファを参照したい場合は `getRingBuffer()` を利用できます。

## レート制御

送信頻度を抑制したい場合は `getRateLimit` / `setRateLimit` を利用します。

```ts
client.setRateLimit('messages', 2) // 1 秒あたり 2 通まで
client.setRateLimit('moves', 10)
client.setRateLimit('looks', 5)
```

## エラー階層と再試行

- `MetatellError`（基底）
  - `AuthError`（認証）
  - `NetworkError`（ネットワーク）
  - `NotFoundError`（リソースなし）
  - `RateLimitError`（制限超過）
  - `UnsupportedAudioFormatError`（音声フォーマット）

実装例:

```ts
import { AuthError, NetworkError, RateLimitError } from '@metatell/bot-sdk'

try {
  await client.chat.send('hello')
} catch (e) {
  if (e instanceof RateLimitError) {
    // バックオフして再試行
  } else if (e instanceof AuthError) {
    // 再認証
  } else if (e instanceof NetworkError) {
    // 再接続処理
  }
}
```

注記: `error` イベントは型として存在しますが、現状 SDK 内からの発火は限定的です。多くの失敗は例外としてスローされるため、`try/catch` での扱いを基本としてください。

