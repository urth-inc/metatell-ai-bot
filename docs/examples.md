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

## 3) 音声対応ボット（Voice I/O Bridge）

```ts
import { createMetatellClient, enableVoice } from '@metatell/bot-sdk'
import { MockSTT, MockTTS } from './mock-stt-tts.js'

const client = createMetatellClient({ serverUrl, roomId, username })
await client.connect()

// STT/TTSのモック実装
const stt = new MockSTT()
const tts = new MockTTS()

// 音声認識結果を処理
stt.onTranscript = async (text) => {
  console.log(`👂 音声認識: "${text}"`)
  const response = generateResponse(text)
  
  // TTSで応答を音声に変換
  ttsStream = tts.textToSpeech(response)[Symbol.asyncIterator]()
}

// 音声機能を有効化
const voice = await enableVoice(client, {
  transport: { type: 'mock' },
  handlers: {
    onRemotePcm: async (pcm, meta) => {
      await stt.addAudioFrame(pcm)
    },
    getLocalPcmStream: async function* () {
      while (true) {
        if (ttsStream) {
          const result = await ttsStream.next()
          if (!result.done) {
            yield result.value
          } else {
            ttsStream = undefined
          }
        } else {
          yield new Int16Array(960) // 無音
        }
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    }
  }
})
```

詳細な実装は `examples/voice-bot/` を参照してください。より詳しい型安全な NAF 例は `packages/sdk/examples/typed-naf-usage.ts` を参照してください。
