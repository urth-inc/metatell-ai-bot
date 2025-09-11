#!/usr/bin/env node

import { getConfig } from '../config.js'
import { WavVoiceBot } from './wav-voice-bot.js'

async function main() {
  console.log('🎤 WAV Voice Bot Demo')
  console.log('====================')

  // 設定を取得
  const config = getConfig()

  // WAVファイルパス（引数から取得、デフォルトは assets/3.wav）
  const wavFilePath = process.argv[3] || './assets/3.wav'

  // ボットを作成
  const bot = new WavVoiceBot(config.serverUrl, config.roomId, config.username, config.token)

  try {
    // 接続
    console.log('⏳ Connecting to room...')
    await bot.start()
    console.log('✅ Connected successfully!')

    console.log('\n📢 Commands:')
    console.log('  p: Play WAV file')
    console.log('  r: Start recording')
    console.log('  s: Stop recording and save')
    console.log('  q: Quit')
    console.log('')

    // 録音開始
    console.log('🎤 Recording started automatically...')
    bot.startRecording()

    // コマンド入力待機
    const stdin = process.stdin
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    stdin.on('data', async (key: string) => {
      // Ctrl+C
      if (key === '\u0003' || key === 'q') {
        console.log('\n⏹️ Stopping...')
        if (bot.getIsPlaying()) bot.stopPlayback()

        // 録音を停止して保存
        const savedFile = await bot.stopRecording()
        if (savedFile) {
          console.log(`💾 Recording saved to: ${savedFile}`)
        }

        await bot.disconnect()
        process.exit(0)
      }

      // WAV再生
      if (key === 'p') {
        if (!bot.getIsPlaying()) {
          console.log(`\n🎵 Playing: ${wavFilePath}`)
          await bot.playWavFile(wavFilePath)

          // 再生状態を監視
          const checkPlayback = setInterval(() => {
            if (!bot.getIsPlaying()) {
              clearInterval(checkPlayback)
              console.log('✅ Playback finished')
            }
          }, 100)
        } else {
          console.log('\n⚠️ Already playing')
        }
      }

      // 録音開始
      if (key === 'r') {
        console.log('\n🔴 Recording started')
        bot.startRecording()
      }

      // 録音停止
      if (key === 's') {
        const savedFile = await bot.stopRecording()
        if (savedFile) {
          console.log(`\n💾 Recording saved to: ${savedFile}`)
        }
      }
    })

    // プロセスを維持
    await new Promise(() => {})
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await bot.disconnect()
  }
}

main().catch(console.error)
