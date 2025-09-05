import { createMetatellClient, pcm } from '@metatell/bot-sdk'
import { synthesizeWithExternalTTS } from './my-tts-service' // 外部TTSサービス

async function main() {
  const client = createMetatellClient({
    serverUrl: 'wss://metatell.app',
    roomId: 'YOUR_ROOM_ID',
    logger: 'debug',
  })

  client.on('error', (err) => console.error('SDK Error:', err))
  client.on('user-join', (user) => console.log(`${user.name} joined!`))

  try {
    await client.connect()
    console.log('Bot connected successfully!')

    const botInfo = await client.getInfo()

    client.chat.onMessage(async ({ from, text, mention, reply }) => {
      if (mention && mention.sessionId === botInfo.sessionId) {
        console.log(`Mention from ${from.name}: ${text}`)

        if (text.includes('こんにちは')) {
          await reply('こんにちは！') // 簡易返信

          // TTSで音声を生成し、再生 (例: TTSは24kHzでPCMを返す)
          const pcm24k = await synthesizeWithExternalTTS('音声で失礼します。')

          // SDKユーティリティで48kHzにリサンプリング
          const pcm48kStream = pcm.resample(pcm24k, 24000, 48000)

          // 再生
          const playback = await client.voice.playPcm(pcm48kStream, {
            sampleRateHz: 48000,
            channels: 1,
          })
          await playback.finished // 再生完了を待つ
          console.log('Playback finished.')
        }
      }
    })
  } catch (error) {
    console.error('Failed to connect:', error)
  }
}

main()
