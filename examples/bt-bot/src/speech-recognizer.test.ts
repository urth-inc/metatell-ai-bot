import assert from 'node:assert/strict'
import { test } from 'node:test'
import speech from '@google-cloud/speech'
import {
  GoogleSpeechRecognizer,
  type GoogleSpeechRecognizerOptions,
  type RecognitionStream,
  type StreamingSpeechClient,
} from './speech-recognizer.js'

type StreamingResponse = speech.protos.google.cloud.speech.v1.IStreamingRecognizeResponse
type StreamingConfig = Parameters<StreamingSpeechClient['streamingRecognize']>[0]
type ScheduleTimeout = NonNullable<GoogleSpeechRecognizerOptions['scheduleTimeout']>
type CancelTimeout = NonNullable<GoogleSpeechRecognizerOptions['cancelTimeout']>
type Timer = ReturnType<ScheduleTimeout>

class FakeRecognitionStream implements RecognitionStream {
  readonly writes: Uint8Array[] = []
  writeResult = true
  endCalls = 0
  destroyCalls = 0

  private readonly dataListeners: Array<(response: StreamingResponse) => void> = []
  private readonly errorListeners: Array<(error: Error) => void> = []
  private readonly endListeners: Array<() => void> = []
  private readonly closeListeners: Array<() => void> = []

  write(audio: Uint8Array): boolean {
    this.writes.push(audio)
    return this.writeResult
  }

  end(): void {
    this.endCalls++
  }

  destroy(): void {
    this.destroyCalls++
  }

  on(event: 'data', listener: (response: StreamingResponse) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  on(event: 'end' | 'close', listener: () => void): this
  on(
    event: 'data' | 'error' | 'end' | 'close',
    listener: ((response: StreamingResponse) => void) | ((error: Error) => void) | (() => void),
  ): this {
    if (event === 'data') {
      this.dataListeners.push(listener as (response: StreamingResponse) => void)
    } else if (event === 'error') {
      this.errorListeners.push(listener as (error: Error) => void)
    } else if (event === 'end') {
      this.endListeners.push(listener as () => void)
    } else {
      this.closeListeners.push(listener as () => void)
    }
    return this
  }

  emitData(response: StreamingResponse): void {
    for (const listener of this.dataListeners) listener(response)
  }

  emitError(error: Error): void {
    for (const listener of this.errorListeners) listener(error)
  }

  emitEnd(): void {
    for (const listener of this.endListeners) listener()
  }

  emitClose(): void {
    for (const listener of this.closeListeners) listener()
  }
}

class FakeStreamingSpeechClient implements StreamingSpeechClient {
  readonly configs: StreamingConfig[] = []
  readonly streams: FakeRecognitionStream[] = []
  getProjectIdCalls = 0
  closeCalls = 0
  projectIdError: Error | null = null

  async getProjectId(): Promise<string> {
    this.getProjectIdCalls++
    if (this.projectIdError) throw this.projectIdError
    return 'test-project'
  }

  streamingRecognize(config: StreamingConfig): RecognitionStream {
    this.configs.push(config)
    const stream = new FakeRecognitionStream()
    this.streams.push(stream)
    return stream
  }

  async close(): Promise<void> {
    this.closeCalls++
  }
}

class FakeClock {
  nowMs = 1_000
  private nextTimerId = 1
  private readonly callbacks = new Map<Timer, () => void>()

  readonly now = (): number => this.nowMs

  readonly scheduleTimeout: ScheduleTimeout = (callback) => {
    const timer = this.nextTimerId++ as unknown as Timer
    this.callbacks.set(timer, callback)
    return timer
  }

  readonly cancelTimeout: CancelTimeout = (timer) => {
    this.callbacks.delete(timer)
  }

  get pendingCount(): number {
    return this.callbacks.size
  }

  runNext(): void {
    const entry = this.callbacks.entries().next().value
    assert.ok(entry, 'a scheduled timer should exist')
    const [timer, callback] = entry
    this.callbacks.delete(timer)
    callback()
  }
}

type FixtureOptions = Partial<
  Omit<
    GoogleSpeechRecognizerOptions,
    'languageCode' | 'onTranscript' | 'log' | 'now' | 'scheduleTimeout' | 'cancelTimeout'
  >
>

function createFixture(options: FixtureOptions = {}): {
  recognizer: GoogleSpeechRecognizer
  client: FakeStreamingSpeechClient
  clock: FakeClock
  transcripts: Array<{ fromIdentity: string; text: string }>
  logs: string[]
} {
  const client = new FakeStreamingSpeechClient()
  const clock = new FakeClock()
  const transcripts: Array<{ fromIdentity: string; text: string }> = []
  const logs: string[] = []
  const recognizer = new GoogleSpeechRecognizer(
    {
      languageCode: 'ja-JP',
      onTranscript: (result) => transcripts.push(result),
      log: (message) => logs.push(message),
      speechStartThreshold: 1,
      preRollMs: 20,
      maxUtteranceMs: 1_000,
      now: clock.now,
      scheduleTimeout: clock.scheduleTimeout,
      cancelTimeout: clock.cancelTimeout,
      ...options,
    },
    client,
  )
  return { recognizer, client, clock, transcripts, logs }
}

function speechFrame(value = 1_000): Int16Array {
  return Int16Array.from([value, -value, value, -value])
}

test('initializeはGoogle認証確認の失敗を呼び出し元へ返す', async () => {
  // Arrange
  const fixture = createFixture()
  fixture.client.projectIdError = new Error('invalid credentials')

  // Act / Assert
  await assert.rejects(fixture.recognizer.initialize(), /invalid credentials/)
  assert.equal(fixture.client.getProjectIdCalls, 1)
})

test('interimを無視し、複数のfinal結果を話者付きで一度だけ通知する', () => {
  // Arrange
  const { recognizer, client, transcripts } = createFixture()
  recognizer.accept(speechFrame(), 'speaker-a')
  const stream = client.streams[0]
  assert.ok(stream)

  // Act
  stream.emitData({
    results: [{ isFinal: false, alternatives: [{ transcript: '途中結果' }] }],
  })
  stream.emitData({
    results: [{ isFinal: true, alternatives: [{ transcript: '   ' }] }],
  })
  stream.emitData({
    results: [
      { isFinal: true, alternatives: [{ transcript: ' こんにちは' }] },
      { isFinal: false, alternatives: [{ transcript: '無視される途中結果' }] },
      { isFinal: true, alternatives: [{ transcript: '世界 ' }] },
    ],
  })
  stream.emitData({
    results: [{ isFinal: true, alternatives: [{ transcript: '重複結果' }] }],
  })

  // Assert
  assert.deepEqual(transcripts, [{ fromIdentity: 'speaker-a', text: 'こんにちは 世界' }])
  assert.equal(stream.endCalls, 1)
  assert.equal(client.configs[0]?.config?.sampleRateHertz, 48_000)
  assert.equal(client.configs[0]?.config?.audioChannelCount, 1)
  assert.equal(client.configs[0]?.singleUtterance, true)
  assert.equal(client.configs[0]?.interimResults, false)
})

test('END_OF_SINGLE_UTTERANCEで現在のstreamを終了し、終了待ちの音声を次のstreamへ渡す', () => {
  // Arrange
  const { recognizer, client, transcripts } = createFixture()
  recognizer.accept(speechFrame(1_000), 'speaker-a')
  const firstStream = client.streams[0]
  assert.ok(firstStream)

  // Act
  firstStream.emitData({
    speechEventType:
      speech.protos.google.cloud.speech.v1.StreamingRecognizeResponse.SpeechEventType
        .END_OF_SINGLE_UTTERANCE,
  })
  recognizer.accept(speechFrame(2_000), 'speaker-a')
  firstStream.emitEnd()

  // Assert
  assert.equal(firstStream.endCalls, 1)
  assert.equal(client.streams.length, 2)
  assert.deepEqual(
    Array.from(client.streams[1]?.writes[0] ?? []),
    Array.from(Buffer.from(speechFrame(2_000).buffer)),
  )
  assert.deepEqual(transcripts, [])
})

test('同時に話す参加者の音声と認識結果を別々のstreamへ帰属させる', () => {
  // Arrange
  const { recognizer, client, transcripts } = createFixture()

  // Act
  recognizer.accept(speechFrame(1_000), 'speaker-a')
  recognizer.accept(speechFrame(2_000), 'speaker-b')
  const firstStream = client.streams[0]
  const secondStream = client.streams[1]
  assert.ok(firstStream)
  assert.ok(secondStream)
  secondStream.emitData({
    results: [{ isFinal: true, alternatives: [{ transcript: 'Bです' }] }],
  })
  firstStream.emitData({
    results: [{ isFinal: true, alternatives: [{ transcript: 'Aです' }] }],
  })

  // Assert
  assert.deepEqual(transcripts, [
    { fromIdentity: 'speaker-b', text: 'Bです' },
    { fromIdentity: 'speaker-a', text: 'Aです' },
  ])
  assert.equal(client.streams.length, 2)
})

test('byteOffset付きPCMから対象範囲だけをコピーしてGoogle streamへ渡す', () => {
  // Arrange
  const { recognizer, client } = createFixture()
  const backing = Int16Array.from([111, 1_000, -2_000, 222])
  const pcm = backing.subarray(1, 3)

  // Act
  recognizer.accept(pcm, 'speaker-a')
  backing[1] = 0
  backing[2] = 0

  // Assert
  const written = client.streams[0]?.writes[0]
  assert.ok(written)
  const expected = Buffer.alloc(4)
  expected.writeInt16LE(1_000, 0)
  expected.writeInt16LE(-2_000, 2)
  assert.deepEqual(Buffer.from(written), expected)
})

test('writeのbackpressure通知を発話終了と誤認せず、後続PCMを送り続ける', () => {
  // Arrange
  const { recognizer, client, transcripts } = createFixture()
  recognizer.accept(speechFrame(), 'speaker-a')
  const stream = client.streams[0]
  assert.ok(stream)
  stream.writeResult = false

  // Act
  recognizer.accept(speechFrame(2_000), 'speaker-a')
  assert.equal(stream.endCalls, 0)
  stream.emitData({
    results: [{ isFinal: true, alternatives: [{ transcript: '長い発話の続き' }] }],
  })

  // Assert
  assert.equal(stream.writes.length, 2)
  assert.equal(stream.endCalls, 1)
  assert.deepEqual(transcripts, [{ fromIdentity: 'speaker-a', text: '長い発話の続き' }])
})

test('stream error後は待機期間中の再接続を抑止し、期限後の音声で認識を再開する', () => {
  // Arrange
  const { recognizer, client, clock, transcripts, logs } = createFixture({
    errorRetryMs: 5_000,
  })
  recognizer.accept(speechFrame(), 'speaker-a')
  const failedStream = client.streams[0]
  assert.ok(failedStream)

  // Act
  failedStream.emitError(new Error('temporary unavailable'))
  recognizer.accept(speechFrame(), 'speaker-a')
  const streamsImmediatelyAfterError = client.streams.length
  clock.nowMs = 5_999
  recognizer.accept(speechFrame(), 'speaker-a')
  const streamsBeforeRetryDeadline = client.streams.length
  clock.nowMs = 6_000
  recognizer.accept(speechFrame(), 'speaker-a')

  // Assert
  assert.equal(streamsImmediatelyAfterError, 1)
  assert.equal(streamsBeforeRetryDeadline, 1)
  assert.equal(client.streams.length, 2)
  assert.ok(logs.some((message) => message.includes('temporary unavailable')))
  const recoveredStream = client.streams[1]
  assert.ok(recoveredStream)
  recoveredStream.emitData({
    results: [{ isFinal: true, alternatives: [{ transcript: '復旧しました' }] }],
  })
  assert.deepEqual(transcripts, [{ fromIdentity: 'speaker-a', text: '復旧しました' }])
})

test('終了済みstreamの遅延errorで次の認識を抑止しない', () => {
  // Arrange
  const { recognizer, client, logs } = createFixture({ errorRetryMs: 5_000 })
  recognizer.accept(speechFrame(), 'speaker-a')
  const completedStream = client.streams[0]
  assert.ok(completedStream)

  // Act
  completedStream.emitClose()
  completedStream.emitError(new Error('late error'))
  recognizer.accept(speechFrame(), 'speaker-a')

  // Assert
  assert.equal(client.streams.length, 2)
  assert.equal(
    logs.some((message) => message.includes('late error')),
    false,
  )
})

test('最大発話時間でstreamを終了し、終了待ちに届いた音声を次のstreamで処理する', () => {
  // Arrange
  const { recognizer, client, clock } = createFixture()
  recognizer.accept(speechFrame(1_000), 'speaker-a')
  const firstStream = client.streams[0]
  assert.ok(firstStream)

  // Act
  clock.runNext()
  recognizer.accept(speechFrame(2_000), 'speaker-a')
  firstStream.emitClose()

  // Assert
  assert.equal(firstStream.endCalls, 1)
  assert.equal(client.streams.length, 2)
  assert.equal(clock.pendingCount, 1)
})

test('streamが終了通知を返さなくても強制破棄し、待機中の話者へ枠を譲る', () => {
  // Arrange
  const { recognizer, client, clock, logs } = createFixture({
    maxActiveStreams: 1,
    endGraceMs: 500,
  })
  recognizer.accept(speechFrame(1_000), 'speaker-a')
  const stalledStream = client.streams[0]
  assert.ok(stalledStream)
  recognizer.accept(speechFrame(2_000), 'speaker-b')
  assert.equal(client.streams.length, 1)

  // Act: max utteranceでhalf-closeし、その後の終了猶予も超過させる。
  clock.runNext()
  clock.runNext()

  // Assert
  assert.equal(stalledStream.endCalls, 1)
  assert.equal(stalledStream.destroyCalls, 1)
  assert.equal(client.streams.length, 2)
  assert.deepEqual(
    Array.from(client.streams[1]?.writes[0] ?? []),
    Array.from(Buffer.from(speechFrame(2_000).buffer)),
  )
  assert.ok(logs.some((message) => message.includes('終了待ちがタイムアウト')))
})

test('上限から外れた古い発話を引きずらず、無音だけでstreamを開始しない', () => {
  // Arrange
  const { recognizer, client } = createFixture({
    maxActiveStreams: 1,
    preRollMs: 0,
  })
  recognizer.accept(speechFrame(), 'speaker-a')
  const activeStream = client.streams[0]
  assert.ok(activeStream)

  // Act: 待機話者の発話フレームを無音フレームでpre-roll外へ押し出す。
  recognizer.accept(speechFrame(), 'speaker-b')
  recognizer.accept(new Int16Array(4), 'speaker-b')
  activeStream.emitClose()

  // Assert
  assert.equal(client.streams.length, 1)
})

test('closeは全streamを破棄して一度だけclientを閉じ、以後の入力と遅延結果を無視する', async () => {
  // Arrange
  const { recognizer, client, clock, transcripts } = createFixture()
  recognizer.accept(speechFrame(), 'speaker-a')
  recognizer.accept(speechFrame(), 'speaker-b')
  const activeStreams = [...client.streams]

  // Act
  const firstClose = recognizer.close()
  const secondClose = recognizer.close()
  recognizer.accept(speechFrame(), 'speaker-c')
  activeStreams[0]?.emitData({
    results: [{ isFinal: true, alternatives: [{ transcript: '遅延結果' }] }],
  })
  await Promise.all([firstClose, secondClose])

  // Assert
  assert.strictEqual(firstClose, secondClose)
  assert.equal(client.closeCalls, 1)
  assert.equal(client.streams.length, 2)
  assert.ok(activeStreams.every((stream) => stream.destroyCalls === 1))
  assert.equal(clock.pendingCount, 0)
  assert.deepEqual(transcripts, [])
})
