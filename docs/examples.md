# 実装例とベストプラクティス

## 1) メンションにだけ応答するボット

```ts
import { createMetatellClient } from '@metatell/bot-sdk'

const client = createMetatellClient({ serverUrl: 'wss://metatell.app', roomId: 'ROOM' })

await client.connect()
const botInfo = await client.getInfo()

client.chat.onMessage(async ({ mention, reply }) => {
  if (mention?.sessionId === botInfo.sessionId) {
    await reply('はい、呼びましたか？')
  }
})
```

## 2) アバター操作（移動・回転・アニメーション）

```ts
await client.avatar.select('org-avatar-123')
await client.avatar.moveTo({ x: 1, y: 1.6, z: -2 })
await client.avatar.rotateTo({ x: 0, y: 180, z: 0 })
await client.avatar.play({ id: 'wave', loop: false })
```

注記: 音声機能は現在開発中・検証中のため、ここでは扱っていません。より詳しい型安全な NAF 例は `packages/sdk/examples/typed-naf-usage.ts` を参照してください。
