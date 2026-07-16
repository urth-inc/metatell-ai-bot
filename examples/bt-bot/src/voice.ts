import textToSpeech from '@google-cloud/text-to-speech'
import type { AgentVoiceConfig, MetatellClient } from '@metatell/bot-sdk'
import { enableVoice } from '@metatell/bot-sdk'
import type { SpeechPriority } from './safety.js'
import {
  GoogleSpeechRecognizer,
  type RecognizedSpeech,
  type SpeechRecognizer,
} from './speech-recognizer.js'

const SAMPLE_RATE_HZ = 48_000
const FRAME_DURATION_MS = 20
const SAMPLES_PER_FRAME = (SAMPLE_RATE_HZ * FRAME_DURATION_MS) / 1_000
const PLAYBACK_GRACE_MS = 10_000
const TTS_REQUEST_TIMEOUT_MS = 30_000
const PUBLISHER_READY_TIMEOUT_MS = 10_000
const INITIALIZATION_CLEANUP_TIMEOUT_MS = 5_000
const MAX_QUEUED_UTTERANCES = 2

type Sleep = (ms: number) => Promise<void>
type Timer = ReturnType<typeof setTimeout>
type ScheduleTimeout = (callback: () => void, delayMs: number) => Timer
type CancelTimeout = (timer: Timer) => void

export interface SpeechSynthesizer {
  initialize(): Promise<void>
  synthesize(text: string): Promise<Int16Array>
  close(): Promise<void>
}

export interface RoomVoiceSpeaker {
  /** Synthesizes and plays one utterance through a bounded, reply-prioritized queue. */
  speak(text: string, priority?: SpeechPriority): Promise<void>
  close(): Promise<void>
}

interface VoiceAttachment {
  detach(): Promise<void>
}

type VoiceEnabler = (client: MetatellClient, config: AgentVoiceConfig) => Promise<VoiceAttachment>

export interface RoomVoiceDependencies {
  synthesizer?: SpeechSynthesizer
  recognizer?: SpeechRecognizer
  enableVoice?: VoiceEnabler
  sleep?: Sleep
  playbackGraceMs?: number
  publisherReadyTimeoutMs?: number
  initializationCleanupTimeoutMs?: number
  scheduleTimeout?: ScheduleTimeout
  cancelTimeout?: CancelTimeout
}

export interface GoogleSpeechOptions {
  languageCode: string
  voiceName: string
  recognition?: {
    languageCode: string
    phrases?: string[]
    shouldTranscribe(fromIdentity: string): boolean
    onTranscript(result: RecognizedSpeech): void
    log(message: string): void
  }
}

/** Convert Google TTS LINEAR16 output (WAV) or raw little-endian PCM into samples. */
export function decodePcm16(audioContent: Uint8Array | string): Int16Array {
  const audio =
    typeof audioContent === 'string'
      ? Buffer.from(audioContent, 'base64')
      : Buffer.from(audioContent)
  if (audio.length === 0) throw new Error('音声データが空です')

  const pcm = isWave(audio) ? findWaveData(audio) : audio
  if (pcm.length % 2 !== 0) throw new Error('PCM16のバイト数が奇数です')

  const samples = new Int16Array(pcm.length / 2)
  for (let index = 0; index < samples.length; index++) {
    samples[index] = pcm.readInt16LE(index * 2)
  }
  return samples
}

function isWave(audio: Buffer): boolean {
  return (
    audio.length >= 12 &&
    audio.toString('ascii', 0, 4) === 'RIFF' &&
    audio.toString('ascii', 8, 12) === 'WAVE'
  )
}

function findWaveData(audio: Buffer): Buffer {
  let offset = 12
  let formatFound = false
  let data: Buffer | null = null

  while (offset + 8 <= audio.length) {
    const chunkId = audio.toString('ascii', offset, offset + 4)
    const chunkSize = audio.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkSize
    if (chunkEnd > audio.length) throw new Error(`WAVの${chunkId}チャンクが壊れています`)

    if (chunkId === 'fmt ') {
      if (chunkSize < 16) throw new Error('WAVのfmtチャンクが短すぎます')
      const audioFormat = audio.readUInt16LE(chunkStart)
      const channels = audio.readUInt16LE(chunkStart + 2)
      const sampleRate = audio.readUInt32LE(chunkStart + 4)
      const bitsPerSample = audio.readUInt16LE(chunkStart + 14)
      if (
        audioFormat !== 1 ||
        channels !== 1 ||
        sampleRate !== SAMPLE_RATE_HZ ||
        bitsPerSample !== 16
      ) {
        throw new Error(
          `未対応のWAV形式です: format=${audioFormat}, channels=${channels}, ` +
            `sampleRate=${sampleRate}, bits=${bitsPerSample}`,
        )
      }
      formatFound = true
    } else if (chunkId === 'data') {
      data = audio.subarray(chunkStart, chunkEnd)
    }

    offset = chunkEnd + (chunkSize % 2)
  }

  if (!formatFound) throw new Error('WAVにfmtチャンクがありません')
  if (!data) throw new Error('WAVにdataチャンクがありません')
  return data
}

class GoogleSpeechSynthesizer implements SpeechSynthesizer {
  private readonly client = new textToSpeech.TextToSpeechClient()

  constructor(private readonly options: GoogleSpeechOptions) {}

  async initialize(): Promise<void> {
    const [response] = await this.client.listVoices(
      { languageCode: this.options.languageCode },
      { timeout: TTS_REQUEST_TIMEOUT_MS },
    )
    if (!response.voices?.some((voice) => voice.name === this.options.voiceName)) {
      throw new Error(`Google TTSの音声「${this.options.voiceName}」が見つかりません`)
    }
  }

  async synthesize(text: string): Promise<Int16Array> {
    const [response] = await this.client.synthesizeSpeech(
      {
        input: { text },
        voice: {
          languageCode: this.options.languageCode,
          name: this.options.voiceName,
        },
        audioConfig: {
          // Google returns LINEAR16 with a WAV header. decodePcm16 extracts its data chunk.
          audioEncoding: textToSpeech.protos.google.cloud.texttospeech.v1.AudioEncoding.LINEAR16,
          sampleRateHertz: SAMPLE_RATE_HZ,
        },
      },
      { timeout: TTS_REQUEST_TIMEOUT_MS },
    )
    if (!response.audioContent) throw new Error('Google TTSから音声データが返りませんでした')
    return decodePcm16(response.audioContent)
  }

  async close(): Promise<void> {
    await this.client.close()
  }
}

interface QueuedFrame {
  samples: Int16Array
  playbackId: symbol
  onPlayed?: () => void
}

interface PendingPlayback {
  timer: Timer
  reject(error: Error): void
}

interface QueuedUtterance {
  text: string
  priority: SpeechPriority
  resolve(): void
  reject(error: Error): void
}

export interface PcmPlaybackQueueOptions {
  sleep?: Sleep
  playbackGraceMs?: number
  scheduleTimeout?: ScheduleTimeout
  cancelTimeout?: CancelTimeout
}

/** A paced PCM queue used as the LiveKit publisher's infinite local audio stream. */
export class PcmPlaybackQueue {
  private readonly frames: QueuedFrame[] = []
  private readonly pending = new Map<symbol, PendingPlayback>()
  private readonly sleep: Sleep
  private readonly playbackGraceMs: number
  private readonly scheduleTimeout: ScheduleTimeout
  private readonly cancelTimeout: CancelTimeout
  private closed = false

  constructor(options: PcmPlaybackQueueOptions = {}) {
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.playbackGraceMs = options.playbackGraceMs ?? PLAYBACK_GRACE_MS
    this.scheduleTimeout =
      options.scheduleTimeout ?? ((callback, delay) => setTimeout(callback, delay))
    this.cancelTimeout = options.cancelTimeout ?? ((timer) => clearTimeout(timer))
  }

  enqueue(samples: Int16Array): Promise<void> {
    if (this.closed) return Promise.reject(new Error('音声キューは停止済みです'))
    if (samples.length === 0) return Promise.resolve()

    const playbackId = Symbol('playback')
    const queuedFrames: QueuedFrame[] = []
    for (let offset = 0; offset < samples.length; offset += SAMPLES_PER_FRAME) {
      const source = samples.subarray(offset, offset + SAMPLES_PER_FRAME)
      const frame = new Int16Array(SAMPLES_PER_FRAME)
      frame.set(source)
      queuedFrames.push({ samples: frame, playbackId })
    }
    const lastFrame = queuedFrames.at(-1)
    if (!lastFrame) return Promise.resolve()

    return new Promise<void>((resolve, reject) => {
      const complete = (): void => {
        const pending = this.pending.get(playbackId)
        if (!pending) return
        this.cancelTimeout(pending.timer)
        this.pending.delete(playbackId)
        resolve()
      }
      const timeoutMs = queuedFrames.length * FRAME_DURATION_MS + this.playbackGraceMs
      const timer = this.scheduleTimeout(() => {
        if (!this.pending.delete(playbackId)) return
        for (let index = this.frames.length - 1; index >= 0; index--) {
          if (this.frames[index].playbackId === playbackId) this.frames.splice(index, 1)
        }
        reject(new Error(`音声再生が${timeoutMs}ms以内に完了しませんでした`))
      }, timeoutMs)
      this.pending.set(playbackId, { timer, reject })

      lastFrame.onPlayed = complete
      this.frames.push(...queuedFrames)
    })
  }

  async *stream(): AsyncIterable<Int16Array> {
    while (!this.closed) {
      const frame = this.frames.shift()
      yield frame?.samples ?? new Int16Array(SAMPLES_PER_FRAME)
      frame?.onPlayed?.()
      await this.sleep(FRAME_DURATION_MS)
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.frames.length = 0
    const error = new Error('音声キューを停止しました')
    for (const { timer, reject } of this.pending.values()) {
      this.cancelTimeout(timer)
      reject(error)
    }
    this.pending.clear()
  }
}

async function settleBeforeDeadline(
  operations: Promise<unknown>[],
  timeoutMs: number,
  scheduleTimeout: ScheduleTimeout,
  cancelTimeout: CancelTimeout,
): Promise<void> {
  let timer: Timer | null = null
  const timeout = new Promise<void>((resolve) => {
    timer = scheduleTimeout(resolve, timeoutMs)
  })
  await Promise.race([Promise.allSettled(operations).then(() => {}), timeout])
  if (timer !== null) cancelTimeout(timer)
}

export async function createRoomVoiceSpeaker(
  client: MetatellClient,
  options: GoogleSpeechOptions,
  dependencies: RoomVoiceDependencies = {},
): Promise<RoomVoiceSpeaker> {
  const synthesizer = dependencies.synthesizer ?? new GoogleSpeechSynthesizer(options)
  let recognizer = options.recognition
    ? (dependencies.recognizer ??
      new GoogleSpeechRecognizer({
        languageCode: options.recognition.languageCode,
        phrases: options.recognition.phrases,
        onTranscript: options.recognition.onTranscript,
        log: options.recognition.log,
      }))
    : null
  const playback = new PcmPlaybackQueue({
    sleep: dependencies.sleep,
    playbackGraceMs: dependencies.playbackGraceMs,
    scheduleTimeout: dependencies.scheduleTimeout,
    cancelTimeout: dependencies.cancelTimeout,
  })
  const attachVoice: VoiceEnabler = dependencies.enableVoice ?? enableVoice
  const scheduleTimeout =
    dependencies.scheduleTimeout ??
    ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs))
  const cancelTimeout = dependencies.cancelTimeout ?? ((timer: Timer) => clearTimeout(timer))
  const publisherReadyTimeoutMs = dependencies.publisherReadyTimeoutMs ?? PUBLISHER_READY_TIMEOUT_MS
  let markPublisherReady: (() => void) | null = null
  const publisherReady = new Promise<void>((resolve) => {
    markPublisherReady = resolve
  })

  let attachment: VoiceAttachment | null = null
  try {
    await synthesizer.initialize()
    if (recognizer) {
      try {
        await recognizer.initialize()
      } catch (error) {
        options.recognition?.log(
          `音声認識を初期化できないため、音声入力は無効です: ${String(error)}`,
        )
        const failedRecognizer = recognizer
        recognizer = null
        await failedRecognizer.close().catch((closeError) => {
          options.recognition?.log(`音声認識の後片付けに失敗しました: ${String(closeError)}`)
        })
      }
    }
    const remotePcmHandler =
      recognizer && options.recognition
        ? (pcm: Int16Array, meta: { fromIdentity?: string }): void => {
            const fromIdentity = meta.fromIdentity
            if (!fromIdentity || !options.recognition?.shouldTranscribe(fromIdentity)) return
            try {
              recognizer?.accept(pcm, fromIdentity)
            } catch (error) {
              options.recognition?.log(`音声入力の処理に失敗しました: ${String(error)}`)
            }
          }
        : undefined
    attachment = await attachVoice(client, {
      transport: { type: 'livekit' },
      loggerTag: 'BtBot',
      handlers: {
        ...(remotePcmHandler ? { onRemotePcm: remotePcmHandler } : {}),
        getLocalPcmStream: () => {
          markPublisherReady?.()
          markPublisherReady = null
          return playback.stream()
        },
      },
      frameDurationMs: FRAME_DURATION_MS,
      sampleRate: SAMPLE_RATE_HZ,
      channels: 1,
      autoStartPublish: true,
      enableTopicAutoAdd: true,
    })
    await new Promise<void>((resolve, reject) => {
      const timer = scheduleTimeout(
        () => reject(new Error('LiveKit音声publisherを開始できませんでした')),
        publisherReadyTimeoutMs,
      )
      void publisherReady.then(() => {
        cancelTimeout(timer)
        resolve()
      })
    })
  } catch (error) {
    playback.close()
    await settleBeforeDeadline(
      [
        Promise.resolve().then(() => attachment?.detach()),
        Promise.resolve().then(() => synthesizer.close()),
        Promise.resolve().then(() => recognizer?.close()),
      ],
      dependencies.initializationCleanupTimeoutMs ?? INITIALIZATION_CLEANUP_TIMEOUT_MS,
      scheduleTimeout,
      cancelTimeout,
    )
    throw error
  }

  let closed = false
  let closePromise: Promise<void> | null = null
  let draining = false
  const utterances: QueuedUtterance[] = []

  const drop = (utterance: QueuedUtterance): void => {
    utterance.reject(new Error('音声キューが混雑したため古い通常発話を省略しました'))
  }

  const drain = async (): Promise<void> => {
    if (draining) return
    draining = true
    try {
      while (!closed) {
        const utterance = utterances.shift()
        if (!utterance) return
        try {
          const samples = await synthesizer.synthesize(utterance.text)
          if (closed) throw new Error('音声発話は停止済みです')
          await playback.enqueue(samples)
          utterance.resolve()
        } catch (error) {
          utterance.reject(error instanceof Error ? error : new Error(String(error)))
        }
      }
    } finally {
      draining = false
      if (!closed && utterances.length > 0) void drain()
    }
  }

  return {
    speak(text, priority = 'normal') {
      if (closed) return Promise.reject(new Error('音声発話は停止済みです'))

      return new Promise<void>((resolve, reject) => {
        const utterance: QueuedUtterance = { text, priority, resolve, reject }
        if (utterances.length >= MAX_QUEUED_UTTERANCES) {
          const oldestNormalIndex = utterances.findIndex(
            (candidate) => candidate.priority === 'normal',
          )
          if (oldestNormalIndex === -1) {
            reject(new Error('音声キューがメンション返信で満杯のため音声を省略しました'))
            return
          }
          const [dropped] = utterances.splice(oldestNormalIndex, 1)
          drop(dropped)
        }

        if (priority === 'reply') {
          const firstNormalIndex = utterances.findIndex(
            (candidate) => candidate.priority === 'normal',
          )
          if (firstNormalIndex === -1) utterances.push(utterance)
          else utterances.splice(firstNormalIndex, 0, utterance)
        } else {
          utterances.push(utterance)
        }
        void drain()
      })
    },

    close() {
      if (closePromise) return closePromise
      closed = true
      const error = new Error('音声発話は停止済みです')
      for (const utterance of utterances.splice(0)) utterance.reject(error)
      playback.close()
      closePromise = Promise.allSettled([
        attachment.detach(),
        synthesizer.close(),
        recognizer?.close(),
      ]).then((results) => {
        const rejected = results.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        )
        if (rejected) throw rejected.reason
      })
      return closePromise
    },
  }
}
