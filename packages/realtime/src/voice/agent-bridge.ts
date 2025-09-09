import type { VoiceCapableClient } from '@metatell/bot-core'
import { InvalidAudioFrameError } from '../errors.js'
import type { RealtimeEvent, RealtimeTransport } from '../transport.js'
import { chunkToFrames, toInt16View } from './frame-utils.js'
import type {
  AttachmentState,
  AttachVoiceOptions,
  VoiceAttachment,
  VoiceHandlers,
  VoiceMetadata,
} from './types.js'

// Logger type from transport options
type Logger = (level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: unknown) => void

// Create logger wrapper with methods
interface LoggerWrapper {
  debug: (msg: string, meta?: unknown) => void
  info: (msg: string, meta?: unknown) => void
  warn: (msg: string, meta?: unknown) => void
  error: (msg: string, meta?: unknown) => void
}

function createLogger(logger?: Logger): LoggerWrapper {
  const log = logger || (() => {})
  return {
    debug: (msg: string, meta?: unknown) => log('debug', msg, meta),
    info: (msg: string, meta?: unknown) => log('info', msg, meta),
    warn: (msg: string, meta?: unknown) => log('warn', msg, meta),
    error: (msg: string, meta?: unknown) => log('error', msg, meta),
  }
}

// 二段マップで管理: client → (transport → state)
const attachments = new WeakMap<VoiceCapableClient, WeakMap<RealtimeTransport, AttachmentState>>()

/**
 * VoiceCapableClient と RealtimeTransport の間に音声ブリッジを作成
 * @param client - VoiceCapableClient インスタンス
 * @param transport - RealtimeTransport インスタンス
 * @param handlers - 音声ハンドラー
 * @param opts - オプション
 * @returns VoiceAttachment
 */
export function attachVoice(
  client: VoiceCapableClient,
  transport: RealtimeTransport,
  handlers: VoiceHandlers = {},
  opts: AttachVoiceOptions = {},
): VoiceAttachment {
  const options = {
    frameDurationMs: 20 as 10 | 20,
    sampleRate: 48000,
    channels: 1,
    autoStartPublish: true,
    enableTopicAutoAdd: true,
    loggerTag: 'voice.bridge',
    ...opts,
  }
  // Logger setup with default no-op functions
  const transportWithOptions = transport as unknown as { options?: { logger?: Logger } }
  const logger = createLogger(transportWithOptions.options?.logger)

  // 多重アタッチ防止
  let inner = attachments.get(client)
  if (!inner) {
    inner = new WeakMap()
    attachments.set(client, inner)
  }
  const prev = inner.get(transport)
  if (prev) {
    logger.warn('duplicate attach detected, detaching previous')
    void detachInternal(prev, logger)
  }

  const expectedSamples = options.frameDurationMs === 10 ? 480 : 960
  const state: AttachmentState = {
    agent: client,
    transport,
    original: {
      sendVoiceFrame: client.sendVoiceFrame?.bind(client),
      muteVoice: client.muteVoice?.bind(client),
    },
    isPublishing: false,
    expectedSamples,
    abortController: undefined,
    removeListener: undefined,
  }

  // audio トピックの自動有効化
  const transportWithTopics = transport as unknown as { activeTopics?: Set<string> }
  if (
    options.enableTopicAutoAdd &&
    transportWithTopics.activeTopics &&
    !transportWithTopics.activeTopics.has('audio')
  ) {
    transportWithTopics.activeTopics.add('audio')
    logger.debug('added "audio" to activeTopics')
  }

  // 受信ハンドラ
  setupReceive(state, handlers, logger)

  // 送信パッチ
  patchSend(state, logger)

  // ミュートパッチ
  patchMute(state, logger)

  // 自動publish
  if (options.autoStartPublish && handlers.getLocalPcmStream) {
    startAutoPublish(state, handlers.getLocalPcmStream, logger).catch((err) =>
      logger.error('auto-publish start failed', err),
    )
  }

  inner.set(transport, state)
  return { detach: () => detachInternal(state, logger) }
}

/**
 * 受信処理のセットアップ
 */
function setupReceive(state: AttachmentState, handlers: VoiceHandlers, logger: LoggerWrapper) {
  if (!handlers.onRemotePcm) return

  const listener = (ev: RealtimeEvent) => {
    if (ev.type !== 'data' || ev.topic !== 'audio') return
    try {
      const pcm = toInt16View(ev.payload as Uint8Array)
      const meta: VoiceMetadata = { fromIdentity: ev.from || undefined }
      Promise.resolve(handlers.onRemotePcm?.(pcm, meta)).catch((e) =>
        logger.error('onRemotePcm error', e),
      )
    } catch (e) {
      logger.error('receive pipeline error', e)
    }
  }

  const removeListener = state.transport.on(listener)
  state.removeListener = removeListener
}

/**
 * 送信メソッドのパッチ
 */
function patchSend(state: AttachmentState, _logger: LoggerWrapper) {
  const client = state.agent
  if (client.sendVoiceFrame) {
    client.sendVoiceFrame = async (pcm: Int16Array) => {
      if (pcm.length !== state.expectedSamples) {
        throw new InvalidAudioFrameError(
          `invalid frame size: expected=${state.expectedSamples}, got=${pcm.length}`,
        )
      }
      await state.transport.pushPcmFrame(pcm)
    }
  }
}

/**
 * ミュート制御のパッチ
 */
function patchMute(state: AttachmentState, logger: LoggerWrapper) {
  const client = state.agent
  if (client.muteVoice) {
    client.muteVoice = async (muted: boolean) => {
      if (typeof state.transport.setMicEnabled === 'function') {
        await state.transport.setMicEnabled(!muted)
        logger.debug(`microphone ${muted ? 'muted' : 'unmuted'}`)
      } else {
        // フォールバック（元のフラグ操作）
        await state.original.muteVoice?.(muted)
      }
    }
  }
}

/**
 * 自動パブリッシュの開始
 */
async function startAutoPublish(
  state: AttachmentState,
  getLocalPcmStream: () => AsyncIterable<Int16Array>,
  logger: LoggerWrapper,
) {
  await state.transport.startAudioPublisher()
  state.isPublishing = true

  const ac = new AbortController()
  state.abortController = ac

  ;(async () => {
    try {
      // フレームサイズが不一致でも chunkToFrames() で合わせる（resampleは行わない）
      for await (const raw of getLocalPcmStream()) {
        if (ac.signal.aborted) break

        for (const frame of chunkToFrames(raw, state.expectedSamples)) {
          if (ac.signal.aborted) break
          await state.transport.pushPcmFrame(frame) // 背圧に追従
        }
      }
    } catch (e) {
      if (!ac.signal.aborted) logger.error('local pcm stream error', e)
    }
  })()
}

/**
 * デタッチ処理
 */
async function detachInternal(state: AttachmentState, logger: LoggerWrapper) {
  const client = state.agent

  // 送信ループ停止
  state.abortController?.abort()
  state.abortController = undefined

  // publisher 停止
  if (state.isPublishing) {
    try {
      await state.transport.stopAudioPublisher()
    } catch (e) {
      logger.error('stop publisher failed', e)
    } finally {
      state.isPublishing = false
    }
  }

  // 受信解除
  state.removeListener?.()
  state.removeListener = undefined

  // メソッド復元
  if (client.sendVoiceFrame && state.original.sendVoiceFrame) {
    client.sendVoiceFrame = state.original.sendVoiceFrame
  }
  if (client.muteVoice && state.original.muteVoice) {
    client.muteVoice = state.original.muteVoice
  }

  // 登録解除
  const inner = attachments.get(client)
  inner?.delete(state.transport)

  logger.debug('voice bridge detached')
}
