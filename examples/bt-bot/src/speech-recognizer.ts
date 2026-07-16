import speech from '@google-cloud/speech'

const SAMPLE_RATE_HZ = 48_000
const DEFAULT_START_THRESHOLD = 500
const DEFAULT_PRE_ROLL_MS = 200
const DEFAULT_MAX_UTTERANCE_MS = 15_000
const DEFAULT_END_GRACE_MS = 5_000
const DEFAULT_MAX_TRACKED_SPEAKERS = 32
const DEFAULT_MAX_ACTIVE_STREAMS = 4
const DEFAULT_ERROR_RETRY_MS = 5_000

type Timer = ReturnType<typeof setTimeout>
type StreamingResponse = speech.protos.google.cloud.speech.v1.IStreamingRecognizeResponse
type StreamingConfig = speech.protos.google.cloud.speech.v1.IStreamingRecognitionConfig

export interface RecognitionStream {
  write(audio: Uint8Array): boolean
  end(): void
  destroy(): void
  on(event: 'data', listener: (response: StreamingResponse) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  on(event: 'end' | 'close', listener: () => void): this
}

export interface StreamingSpeechClient {
  getProjectId(): Promise<string>
  streamingRecognize(config: StreamingConfig): RecognitionStream
  close(): Promise<void>
}

export interface RecognizedSpeech {
  fromIdentity: string
  text: string
}

export interface SpeechRecognizer {
  initialize(): Promise<void>
  accept(pcm: Int16Array, fromIdentity: string): void
  close(): Promise<void>
}

export interface GoogleSpeechRecognizerOptions {
  languageCode: string
  phrases?: string[]
  onTranscript(result: RecognizedSpeech): void
  log(message: string): void
  speechStartThreshold?: number
  preRollMs?: number
  maxUtteranceMs?: number
  endGraceMs?: number
  maxTrackedSpeakers?: number
  maxActiveStreams?: number
  errorRetryMs?: number
  now?: () => number
  scheduleTimeout?: (callback: () => void, delayMs: number) => Timer
  cancelTimeout?: (timer: Timer) => void
}

interface ActiveRecognition {
  stream: RecognitionStream
  timer: Timer | null
  accepting: boolean
  aborting: boolean
  delivered: boolean
  finished: boolean
}

interface BufferedAudio {
  audio: Buffer
  sampleCount: number
  isSpeech: boolean
}

interface SpeakerState {
  preRoll: BufferedAudio[]
  preRollSamples: number
  preRollSpeechFrames: number
  lastSeen: number
  retryAfterMs: number
  active: ActiveRecognition | null
}

/** Streams one short Google Speech-to-Text request per detected utterance and participant. */
export class GoogleSpeechRecognizer implements SpeechRecognizer {
  private readonly client: StreamingSpeechClient
  private readonly states = new Map<string, SpeakerState>()
  private readonly speechStartThreshold: number
  private readonly maxPreRollSamples: number
  private readonly maxUtteranceMs: number
  private readonly endGraceMs: number
  private readonly maxTrackedSpeakers: number
  private readonly maxActiveStreams: number
  private readonly errorRetryMs: number
  private readonly now: () => number
  private readonly scheduleTimeout: (callback: () => void, delayMs: number) => Timer
  private readonly cancelTimeout: (timer: Timer) => void
  private closed = false
  private closePromise: Promise<void> | null = null

  constructor(
    private readonly options: GoogleSpeechRecognizerOptions,
    client: StreamingSpeechClient = new speech.SpeechClient(),
  ) {
    this.client = client
    this.speechStartThreshold = options.speechStartThreshold ?? DEFAULT_START_THRESHOLD
    this.maxPreRollSamples = (SAMPLE_RATE_HZ * (options.preRollMs ?? DEFAULT_PRE_ROLL_MS)) / 1_000
    this.maxUtteranceMs = options.maxUtteranceMs ?? DEFAULT_MAX_UTTERANCE_MS
    this.endGraceMs = options.endGraceMs ?? DEFAULT_END_GRACE_MS
    this.maxTrackedSpeakers = options.maxTrackedSpeakers ?? DEFAULT_MAX_TRACKED_SPEAKERS
    this.maxActiveStreams = options.maxActiveStreams ?? DEFAULT_MAX_ACTIVE_STREAMS
    this.errorRetryMs = options.errorRetryMs ?? DEFAULT_ERROR_RETRY_MS
    this.now = options.now ?? Date.now
    this.scheduleTimeout =
      options.scheduleTimeout ?? ((callback, delay) => setTimeout(callback, delay))
    this.cancelTimeout = options.cancelTimeout ?? ((timer) => clearTimeout(timer))
  }

  async initialize(): Promise<void> {
    await this.client.getProjectId()
  }

  accept(pcm: Int16Array, fromIdentity: string): void {
    if (this.closed || pcm.length === 0 || fromIdentity === '') return

    const state = this.stateFor(fromIdentity)
    if (!state) return
    state.lastSeen = this.now()

    const audio = copyPcmBytes(pcm)
    const isSpeech = rootMeanSquare(pcm) >= this.speechStartThreshold
    const active = state.active
    if (active?.accepting) {
      this.writeAudio(state, active, audio)
      return
    }

    this.appendPreRoll(state, audio, pcm.length, isSpeech)
    this.startPendingRecognitions()
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise
    this.closed = true

    for (const state of this.states.values()) {
      const active = state.active
      if (!active) continue
      active.finished = true
      active.accepting = false
      if (active.timer !== null) this.cancelTimeout(active.timer)
      try {
        active.stream.destroy()
      } catch (error) {
        this.options.log(`Google Speech-to-Textの停止に失敗しました: ${String(error)}`)
      }
      state.active = null
    }
    this.states.clear()
    this.closePromise = Promise.resolve().then(() => this.client.close())
    return this.closePromise
  }

  private stateFor(fromIdentity: string): SpeakerState | null {
    const existing = this.states.get(fromIdentity)
    if (existing) return existing

    if (this.states.size >= this.maxTrackedSpeakers) {
      let oldest: [string, SpeakerState] | null = null
      for (const entry of this.states.entries()) {
        if (entry[1].active) continue
        if (!oldest || entry[1].lastSeen < oldest[1].lastSeen) oldest = entry
      }
      if (!oldest) return null
      this.states.delete(oldest[0])
    }

    const state: SpeakerState = {
      preRoll: [],
      preRollSamples: 0,
      preRollSpeechFrames: 0,
      lastSeen: this.now(),
      retryAfterMs: 0,
      active: null,
    }
    this.states.set(fromIdentity, state)
    return state
  }

  private appendPreRoll(
    state: SpeakerState,
    audio: Buffer,
    sampleCount: number,
    isSpeech: boolean,
  ): void {
    state.preRoll.push({ audio, sampleCount, isSpeech })
    state.preRollSamples += sampleCount
    if (isSpeech) state.preRollSpeechFrames++

    while (state.preRollSamples > this.maxPreRollSamples && state.preRoll.length > 1) {
      const removed = state.preRoll.shift()
      if (!removed) break
      state.preRollSamples -= removed.sampleCount
      if (removed.isSpeech) state.preRollSpeechFrames--
    }
  }

  private startRecognition(fromIdentity: string, state: SpeakerState): void {
    if (
      this.closed ||
      state.active ||
      state.preRollSpeechFrames === 0 ||
      this.now() < state.retryAfterMs ||
      this.activeStreamCount() >= this.maxActiveStreams
    ) {
      return
    }

    let stream: RecognitionStream
    try {
      stream = this.client.streamingRecognize({
        config: {
          encoding: speech.protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16,
          sampleRateHertz: SAMPLE_RATE_HZ,
          audioChannelCount: 1,
          languageCode: this.options.languageCode,
          enableAutomaticPunctuation: true,
          speechContexts:
            this.options.phrases && this.options.phrases.length > 0
              ? [{ phrases: this.options.phrases }]
              : undefined,
        },
        singleUtterance: true,
        interimResults: false,
      })
    } catch (error) {
      this.options.log(`Google Speech-to-Textの開始に失敗しました: ${String(error)}`)
      state.retryAfterMs = this.now() + this.errorRetryMs
      this.clearPreRoll(state)
      return
    }

    const active: ActiveRecognition = {
      stream,
      timer: null,
      accepting: true,
      aborting: false,
      delivered: false,
      finished: false,
    }
    state.active = active
    active.timer = this.scheduleTimeout(
      () => this.endRecognition(state, active),
      this.maxUtteranceMs,
    )

    stream.on('data', (response) => this.receiveTranscript(fromIdentity, state, active, response))
    stream.on('error', (error) => {
      if (this.closed || active.finished || active.aborting) return
      this.options.log(`Google Speech-to-Textでエラーが発生しました: ${error.message}`)
      state.retryAfterMs = this.now() + this.errorRetryMs
      this.clearPreRoll(state)
      this.abortRecognition(state, active)
    })
    stream.on('end', () => this.finishRecognition(state, active))
    stream.on('close', () => this.finishRecognition(state, active))

    const buffered = state.preRoll.splice(0)
    state.preRollSamples = 0
    state.preRollSpeechFrames = 0
    for (const { audio } of buffered) {
      if (!this.writeAudio(state, active, audio)) break
    }
  }

  private receiveTranscript(
    fromIdentity: string,
    state: SpeakerState,
    active: ActiveRecognition,
    response: StreamingResponse,
  ): void {
    if (this.closed || active.finished || active.delivered) return
    if (
      response.speechEventType ===
      speech.protos.google.cloud.speech.v1.StreamingRecognizeResponse.SpeechEventType
        .END_OF_SINGLE_UTTERANCE
    ) {
      this.endRecognition(state, active)
    }
    const text = (response.results ?? [])
      .filter((result) => result.isFinal === true)
      .map((result) => result.alternatives?.[0]?.transcript ?? '')
      .join(' ')
      .trim()
    if (text === '') return

    active.delivered = true
    try {
      this.options.onTranscript({ fromIdentity, text })
    } catch (error) {
      this.options.log(`音声認識結果の処理に失敗しました: ${String(error)}`)
    }
    this.endRecognition(state, active)
  }

  private writeAudio(state: SpeakerState, active: ActiveRecognition, audio: Buffer): boolean {
    if (active.finished || !active.accepting) return false
    try {
      // Writableのfalseはチャンク拒否ではなくbackpressure通知。LiveKit側をpauseできないため
      // 書き込みは続け、maxUtteranceMsと同時stream上限で内部bufferを有限に保つ。
      active.stream.write(audio)
      return true
    } catch (error) {
      this.options.log(`Google Speech-to-Textへの音声送信に失敗しました: ${String(error)}`)
      state.retryAfterMs = this.now() + this.errorRetryMs
      this.clearPreRoll(state)
      this.abortRecognition(state, active)
      return false
    }
  }

  private endRecognition(state: SpeakerState, active: ActiveRecognition): void {
    if (active.finished || !active.accepting) return
    active.accepting = false
    if (active.timer !== null) this.cancelTimeout(active.timer)
    active.timer = this.scheduleTimeout(() => {
      if (active.finished) return
      this.options.log('Google Speech-to-Textの終了待ちがタイムアウトしました')
      this.abortRecognition(state, active)
    }, this.endGraceMs)
    try {
      active.stream.end()
    } catch (error) {
      this.options.log(`Google Speech-to-Textの終了に失敗しました: ${String(error)}`)
      this.abortRecognition(state, active)
    }
  }

  private finishRecognition(state: SpeakerState, active: ActiveRecognition): void {
    if (active.finished) return
    active.finished = true
    active.accepting = false
    if (active.timer !== null) this.cancelTimeout(active.timer)
    if (state.active === active) state.active = null

    this.startPendingRecognitions()
  }

  private abortRecognition(state: SpeakerState, active: ActiveRecognition): void {
    if (active.finished || active.aborting) return
    active.aborting = true
    try {
      active.stream.destroy()
    } catch (error) {
      this.options.log(`Google Speech-to-Textの破棄に失敗しました: ${String(error)}`)
    } finally {
      active.aborting = false
    }
    this.finishRecognition(state, active)
  }

  private startPendingRecognitions(): void {
    if (this.closed) return
    const now = this.now()
    const pending = [...this.states.entries()]
      .filter(
        ([, state]) => !state.active && state.preRollSpeechFrames > 0 && now >= state.retryAfterMs,
      )
      .sort(([, left], [, right]) => left.lastSeen - right.lastSeen)

    for (const [fromIdentity, state] of pending) {
      if (this.activeStreamCount() >= this.maxActiveStreams) return
      this.startRecognition(fromIdentity, state)
    }
  }

  private activeStreamCount(): number {
    let count = 0
    for (const state of this.states.values()) {
      if (state.active) count++
    }
    return count
  }

  private clearPreRoll(state: SpeakerState): void {
    state.preRoll.length = 0
    state.preRollSamples = 0
    state.preRollSpeechFrames = 0
  }
}

function copyPcmBytes(pcm: Int16Array): Buffer {
  const view = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  return Buffer.from(view)
}

function rootMeanSquare(pcm: Int16Array): number {
  let sum = 0
  for (const sample of pcm) sum += sample * sample
  return Math.sqrt(sum / pcm.length)
}
