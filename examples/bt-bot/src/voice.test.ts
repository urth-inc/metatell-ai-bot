import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AgentVoiceConfig, MetatellClient } from '@metatell/bot-sdk'
import {
  createRoomVoiceSpeaker,
  decodePcm16,
  PcmPlaybackQueue,
  type SpeechSynthesizer,
} from './voice.js'

function createWave(samples: Int16Array): Buffer {
  const dataSize = samples.length * 2
  const junkSize = 3
  const junkPaddedSize = junkSize + 1
  const buffer = Buffer.alloc(12 + 8 + 16 + 8 + junkPaddedSize + 8 + dataSize)
  let offset = 0
  buffer.write('RIFF', offset)
  buffer.writeUInt32LE(buffer.length - 8, offset + 4)
  buffer.write('WAVE', offset + 8)
  offset += 12
  buffer.write('fmt ', offset)
  buffer.writeUInt32LE(16, offset + 4)
  buffer.writeUInt16LE(1, offset + 8)
  buffer.writeUInt16LE(1, offset + 10)
  buffer.writeUInt32LE(48_000, offset + 12)
  buffer.writeUInt32LE(96_000, offset + 16)
  buffer.writeUInt16LE(2, offset + 20)
  buffer.writeUInt16LE(16, offset + 22)
  offset += 24
  buffer.write('JUNK', offset)
  buffer.writeUInt32LE(junkSize, offset + 4)
  buffer.fill(1, offset + 8, offset + 8 + junkSize)
  offset += 8 + junkPaddedSize
  buffer.write('data', offset)
  buffer.writeUInt32LE(dataSize, offset + 4)
  for (let index = 0; index < samples.length; index++) {
    buffer.writeInt16LE(samples[index], offset + 8 + index * 2)
  }
  return buffer
}

test('Google LINEAR16のWAVから追加チャンクを飛ばしてPCM dataを抽出する', () => {
  const expected = Int16Array.from([-32_768, -1, 0, 1, 32_767])
  assert.deepEqual(decodePcm16(createWave(expected)), expected)
})

test('ヘッダーなしのraw PCMも読み込める', () => {
  const bytes = Buffer.alloc(4)
  bytes.writeInt16LE(-123, 0)
  bytes.writeInt16LE(456, 2)
  assert.deepEqual(decodePcm16(bytes), Int16Array.from([-123, 456]))
})

test('PCMを960サンプルへ分割し、最後の不足分を無音で埋める', async () => {
  const queue = new PcmPlaybackQueue({ sleep: async () => {} })
  const samples = new Int16Array(961)
  samples.fill(7)
  const played = queue.enqueue(samples)
  const stream = queue.stream()[Symbol.asyncIterator]()

  const first = await stream.next()
  const second = await stream.next()
  const afterPlayback = stream.next()
  await played

  assert.equal(first.value?.length, 960)
  assert.ok(first.value?.every((sample) => sample === 7))
  assert.equal(second.value?.[0], 7)
  assert.ok(second.value?.subarray(1).every((sample) => sample === 0))
  assert.ok((await afterPlayback).value?.every((sample) => sample === 0))
  queue.close()
  await stream.return?.()
})

test('publisherが音声streamを消費しない場合は再生をタイムアウトする', async () => {
  const queue = new PcmPlaybackQueue({ playbackGraceMs: 0 })

  await assert.rejects(queue.enqueue(Int16Array.from([1])), /音声再生が20ms以内/)
  queue.close()
})

test('TTS初期化に失敗した場合もsynthesizerを閉じる', async () => {
  let synthesizerClosed = false
  let voiceEnabled = false
  const synthesizer: SpeechSynthesizer = {
    async initialize() {
      throw new Error('invalid credentials')
    },
    async synthesize() {
      return new Int16Array()
    },
    async close() {
      synthesizerClosed = true
    },
  }

  await assert.rejects(
    createRoomVoiceSpeaker(
      {} as MetatellClient,
      { languageCode: 'ja-JP', voiceName: 'test-voice' },
      {
        synthesizer,
        enableVoice: async () => {
          voiceEnabled = true
          return { async detach() {} }
        },
      },
    ),
    /invalid credentials/,
  )
  assert.equal(synthesizerClosed, true)
  assert.equal(voiceEnabled, false)
})

test('TTS失敗後も次の発言を再生でき、closeで音声接続とTTSを閉じる', async () => {
  const synthesized: string[] = []
  let synthCalls = 0
  let synthesizerClosed = false
  let detached = false
  let streamFactory: AgentVoiceConfig['handlers']['getLocalPcmStream']
  const synthesizer: SpeechSynthesizer = {
    async initialize() {},
    async synthesize(text) {
      synthesized.push(text)
      synthCalls++
      if (synthCalls === 1) throw new Error('temporary TTS error')
      return Int16Array.from([321])
    },
    async close() {
      synthesizerClosed = true
    },
  }

  const speaker = await createRoomVoiceSpeaker(
    {} as MetatellClient,
    { languageCode: 'ja-JP', voiceName: 'test-voice' },
    {
      synthesizer,
      sleep: async () => {},
      enableVoice: async (_client, config) => {
        streamFactory = config.handlers.getLocalPcmStream
        streamFactory()
        return {
          async detach() {
            detached = true
          },
        }
      },
    },
  )

  await assert.rejects(speaker.speak('first'), /temporary TTS error/)
  const second = speaker.speak('second')
  const stream = streamFactory?.()[Symbol.asyncIterator]()
  assert.ok(stream)
  let playedFrame: Int16Array | undefined
  for (let attempt = 0; attempt < 5; attempt++) {
    const frame = await stream.next()
    if (frame.value?.[0] === 321) {
      playedFrame = frame.value
      break
    }
  }
  assert.ok(playedFrame)
  // Resume the generator after the queued frame so it marks that utterance as played.
  const afterPlayback = stream.next()
  await second
  assert.equal(playedFrame?.[0], 321)
  await afterPlayback

  await speaker.close()
  assert.deepEqual(synthesized, ['first', 'second'])
  assert.equal(detached, true)
  assert.equal(synthesizerClosed, true)
  await stream.return?.()
})

test('音声キューを制限し、メンション返信を待機中の通常発話より先に再生する', async () => {
  const synthesized: string[] = []
  let releaseActive: (() => void) | undefined
  const synthesizer: SpeechSynthesizer = {
    async initialize() {},
    async synthesize(text) {
      synthesized.push(text)
      if (text === 'active') {
        await new Promise<void>((resolve) => {
          releaseActive = resolve
        })
      }
      return new Int16Array()
    },
    async close() {},
  }
  const speaker = await createRoomVoiceSpeaker(
    {} as MetatellClient,
    { languageCode: 'ja-JP', voiceName: 'test-voice' },
    {
      synthesizer,
      enableVoice: async (_client, config) => {
        config.handlers.getLocalPcmStream?.()
        return { async detach() {} }
      },
    },
  )

  const active = speaker.speak('active')
  const oldNormal = speaker.speak('old normal')
  const newNormal = speaker.speak('new normal')
  const reply = speaker.speak('reply', 'reply')

  await assert.rejects(oldNormal, /古い通常発話を省略/)
  releaseActive?.()
  await Promise.all([active, reply, newNormal])

  assert.deepEqual(synthesized, ['active', 'reply', 'new normal'])
  await speaker.close()
})

test('publisherが開始しない場合は音声接続とsynthesizerを閉じる', async () => {
  let synthesizerClosed = false
  let detached = false
  const synthesizer: SpeechSynthesizer = {
    async initialize() {},
    async synthesize() {
      return new Int16Array()
    },
    async close() {
      synthesizerClosed = true
    },
  }

  await assert.rejects(
    createRoomVoiceSpeaker(
      {} as MetatellClient,
      { languageCode: 'ja-JP', voiceName: 'test-voice' },
      {
        synthesizer,
        publisherReadyTimeoutMs: 0,
        enableVoice: async () => ({
          async detach() {
            detached = true
          },
        }),
      },
    ),
    /publisherを開始できませんでした/,
  )
  assert.equal(detached, true)
  assert.equal(synthesizerClosed, true)
})

test('publisher開始失敗後のdetachが停止しても初期化エラーを返す', async () => {
  let synthesizerClosed = false
  const synthesizer: SpeechSynthesizer = {
    async initialize() {},
    async synthesize() {
      return new Int16Array()
    },
    async close() {
      synthesizerClosed = true
    },
  }

  await assert.rejects(
    createRoomVoiceSpeaker(
      {} as MetatellClient,
      { languageCode: 'ja-JP', voiceName: 'test-voice' },
      {
        synthesizer,
        publisherReadyTimeoutMs: 0,
        initializationCleanupTimeoutMs: 0,
        enableVoice: async () => ({
          detach: () => new Promise<void>(() => {}),
        }),
      },
    ),
    /publisherを開始できませんでした/,
  )
  assert.equal(synthesizerClosed, true)
})
