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

// Two-level map: client -> (transport -> state).
const attachments = new WeakMap<VoiceCapableClient, WeakMap<RealtimeTransport, AttachmentState>>()

/**
 * Creates a voice bridge between a VoiceCapableClient and a RealtimeTransport.
 * @param client - VoiceCapableClient instance.
 * @param transport - RealtimeTransport instance.
 * @param handlers - Voice handlers.
 * @param opts - Options.
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

  // Prevent duplicate attachments.
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

  // Enable the audio topic automatically.
  const transportWithTopics = transport as unknown as { activeTopics?: Set<string> }
  if (
    options.enableTopicAutoAdd &&
    transportWithTopics.activeTopics &&
    !transportWithTopics.activeTopics.has('audio')
  ) {
    transportWithTopics.activeTopics.add('audio')
    logger.debug('added "audio" to activeTopics')
  }

  // Receive handler.
  setupReceive(state, handlers, logger)

  // Send patch.
  patchSend(state, logger)

  // Mute patch.
  patchMute(state, logger)

  // Automatic publishing.
  if (options.autoStartPublish && handlers.getLocalPcmStream) {
    logger.debug('Starting auto-publish')
    startAutoPublish(state, handlers.getLocalPcmStream, logger).catch((err) =>
      logger.error('auto-publish start failed', err),
    )
    logger.debug('Auto-publish initiated')
  }

  inner.set(transport, state)
  return { detach: () => detachInternal(state, logger) }
}

/**
 * Sets up receive handling.
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
 * Patches the send method.
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
 * Patches mute controls.
 */
function patchMute(state: AttachmentState, logger: LoggerWrapper) {
  const client = state.agent
  if (client.muteVoice) {
    client.muteVoice = async (muted: boolean) => {
      if (typeof state.transport.setMicEnabled === 'function') {
        await state.transport.setMicEnabled(!muted)
        logger.debug(`microphone ${muted ? 'muted' : 'unmuted'}`)
      } else {
        // Fallback to the original flag operation.
        await state.original.muteVoice?.(muted)
      }
    }
  }
}

/**
 * Starts automatic publishing.
 */
async function startAutoPublish(
  state: AttachmentState,
  getLocalPcmStream: () => AsyncIterable<Int16Array>,
  logger: LoggerWrapper,
) {
  logger.debug('Calling startAudioPublisher')
  await state.transport.startAudioPublisher()
  logger.debug('Audio publisher started')
  state.isPublishing = true

  const ac = new AbortController()
  state.abortController = ac

  ;(async () => {
    try {
      // Normalize frame sizes with chunkToFrames(); resampling is not performed here.
      for await (const raw of getLocalPcmStream()) {
        if (ac.signal.aborted) break

        for (const frame of chunkToFrames(raw, state.expectedSamples)) {
          if (ac.signal.aborted) break
          await state.transport.pushPcmFrame(frame) // Follow backpressure.
        }
      }
    } catch (e) {
      if (!ac.signal.aborted) logger.error('local pcm stream error', e)
    }
  })()
}

/**
 * Detaches the voice bridge.
 */
async function detachInternal(state: AttachmentState, logger: LoggerWrapper) {
  const client = state.agent

  // Stop the send loop.
  state.abortController?.abort()
  state.abortController = undefined

  // Stop the publisher.
  if (state.isPublishing) {
    try {
      await state.transport.stopAudioPublisher()
    } catch (e) {
      logger.error('stop publisher failed', e)
    } finally {
      state.isPublishing = false
    }
  }

  // Remove the receive handler.
  state.removeListener?.()
  state.removeListener = undefined

  // Restore patched methods.
  if (client.sendVoiceFrame && state.original.sendVoiceFrame) {
    client.sendVoiceFrame = state.original.sendVoiceFrame
  }
  if (client.muteVoice && state.original.muteVoice) {
    client.muteVoice = state.original.muteVoice
  }

  // Remove the attachment registration.
  const inner = attachments.get(client)
  inner?.delete(state.transport)

  logger.debug('voice bridge detached')
}
