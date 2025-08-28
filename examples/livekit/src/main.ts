import 'dotenv/config'
import { createWriteStream } from 'node:fs'
import { mkdir, open } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AudioByteStream,
  cli,
  defineAgent,
  type JobContext,
  type JobRequest,
  WorkerOptions,
} from '@livekit/agents'
import { AudioStream, RoomEvent, type Track, TrackKind } from '@livekit/rtc-node'

// WAVファイルヘッダーを作成する関数
function createWavHeader(
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number,
  dataLength: number,
): Buffer {
  const header = Buffer.alloc(44)

  // RIFF chunk
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataLength, 4)
  header.write('WAVE', 8)

  // fmt chunk
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // fmt chunk size
  header.writeUInt16LE(1, 20) // PCM format
  header.writeUInt16LE(numChannels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE((sampleRate * numChannels * bitsPerSample) / 8, 28) // byte rate
  header.writeUInt16LE((numChannels * bitsPerSample) / 8, 32) // block align
  header.writeUInt16LE(bitsPerSample, 34)

  // data chunk
  header.write('data', 36)
  header.writeUInt32LE(dataLength, 40)

  return header
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect()
    console.log('starting audio byte stream example agent')

    // 録音用ディレクトリを作成
    const recordingDir = join(process.cwd(), 'recordings')
    await mkdir(recordingDir, { recursive: true })

    // 音声トラックを処理する関数
    const processAudioTrack = async (track: Track, participantIdentity: string) => {
      // 録音ファイルのパス設定
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const fileName = `${ctx.room.name}_${participantIdentity}_${timestamp}.wav`
      const filePath = join(recordingDir, fileName)

      console.log(`Starting recording to: ${filePath}`)
      // AudioByteStream設定
      const sampleRate = 16000
      const numChannels = 1
      const bitsPerSample = 16
      const samplesPerChannel = Math.floor(sampleRate / 10) // 100ms分のサンプル

      // バイトストリームを作成
      const audioByteStream = new AudioByteStream(sampleRate, numChannels, samplesPerChannel)

      // 録音用のストリームと変数
      let writeStream: ReturnType<typeof createWriteStream> | null = null
      let totalDataLength = 0
      let isFirstWrite = true

      // 録音が有効な場合、WAVファイルを初期化
      if (process.env.ENABLE_RECORDING === 'true') {
        writeStream = createWriteStream(filePath)
        // 最初に仮のヘッダーを書き込み（後で更新）
        const tempHeader = createWavHeader(sampleRate, numChannels, bitsPerSample, 0)
        writeStream.write(tempHeader)
      }

      // AudioStreamを作成して音声フレームを取得
      const audioStream = new AudioStream(track, {
        sampleRate,
        numChannels,
      })

      // 音声フレームを非同期で処理
      try {
        const reader = audioStream.getReader()

        while (true) {
          const { done, value: frame } = await reader.read()
          if (done) break

          // AudioFrameオブジェクトのdata.bufferを使用
          const frames = audioByteStream.write(frame.data.buffer as ArrayBuffer)

          // バイトストリームからフレームを処理
          for (const outputFrame of frames) {
            const audioBuffer = Buffer.from(outputFrame.data.buffer)

            // 録音が有効な場合、リアルタイムでファイルに書き込み
            if (process.env.ENABLE_RECORDING === 'true' && writeStream) {
              writeStream.write(audioBuffer)
              totalDataLength += audioBuffer.length

              if (isFirstWrite) {
                console.log(`Started recording to: ${filePath}`)
                isFirstWrite = false
              }

              // 10秒ごとに進捗をログ出力とフラッシュ
              const seconds = Math.floor(
                totalDataLength / ((sampleRate * numChannels * bitsPerSample) / 8),
              )
              if (seconds > 0 && seconds % 10 === 0) {
                console.log(`Recording progress: ${seconds} seconds recorded`)
                // データを強制的にディスクに書き込む
                writeStream.write('', () => {
                  console.log(`Flushed recording data to disk`)
                })
              }
            } else {
              console.log(`Processing audio frame: ${audioBuffer.length} bytes`)
            }
          }
        }
      } catch (error) {
        console.error('Audio processing error:', error)
      } finally {
        // 録音を終了し、WAVヘッダーを更新
        if (process.env.ENABLE_RECORDING === 'true' && writeStream) {
          try {
            // ストリームを終了
            await new Promise<void>((resolve, reject) => {
              writeStream?.end((err: Error | null | undefined) => {
                if (err) reject(err)
                else resolve()
              })
            })

            // WAVヘッダーを正しいデータ長で更新
            const fd = await open(filePath, 'r+')
            try {
              // RIFF chunk sizeを更新
              await fd.write(Buffer.from(new Uint32Array([36 + totalDataLength]).buffer), 0, 4, 4)
              // data chunk sizeを更新
              await fd.write(Buffer.from(new Uint32Array([totalDataLength]).buffer), 0, 4, 40)
            } finally {
              await fd.close()
            }

            const durationSeconds =
              totalDataLength / ((sampleRate * numChannels * bitsPerSample) / 8)
            console.log(
              `Recording saved to: ${filePath} (${totalDataLength} bytes, ${durationSeconds.toFixed(2)} seconds)`,
            )
          } catch (error) {
            console.error('Failed to finalize recording:', error)
          }
        }
      }
    }

    // 新しい参加者の音声トラックをリッスン
    ctx.room.on(RoomEvent.TrackSubscribed, async (track: Track, _publication, participant) => {
      if (track.kind === TrackKind.KIND_AUDIO) {
        console.log(`Audio track subscribed from ${participant.identity}, starting to process`)
        processAudioTrack(track, participant.identity)
      }
    })

    // クリーンアップ処理
    ctx.room.on(RoomEvent.Disconnected, () => {
      console.log('Disconnected from room')
    })
  },
})

// 特定のルームのみを処理するrequestFuncを定義
const requestFunc = async (job: JobRequest) => {
  // ルーム名を取得
  const roomName = job.room?.name
  console.log(`Received job request for room: ${roomName}`)

  // 環境変数から処理したいルーム名のパターンを取得
  const targetRoomPattern = process.env.TARGET_ROOM_PATTERN

  if (targetRoomPattern) {
    // パターンマッチング（正規表現をサポート）
    const pattern = new RegExp(targetRoomPattern)
    if (!roomName || !pattern.test(roomName)) {
      console.log(
        `Rejecting job for room: ${roomName} (doesn't match pattern: ${targetRoomPattern})`,
      )
      await job.reject()
      return
    }
  }

  // パターンにマッチした場合、または指定がない場合は受け入れる
  console.log(`Accepting job for room: ${roomName}`)
  await job.accept()
}

// エージェントを実行
const workerOptions = new WorkerOptions({
  agent: fileURLToPath(import.meta.url),
  requestFunc,
  // 明示的なディスパッチを使用したい場合はagentNameを設定
  ...(process.env.AGENT_NAME && { agentName: process.env.AGENT_NAME }),
})

cli.runApp(workerOptions)
