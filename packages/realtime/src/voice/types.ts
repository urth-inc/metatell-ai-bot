// type-only import で循環依存を避ける
import type { VoiceCapableClient } from '@metatell/bot-core'
import type { RealtimeTransport } from '../transport.js'

/**
 * 音声メタデータ
 */
export interface VoiceMetadata {
  /** 送信者のidentity */
  fromIdentity?: string
  /** 送信者のSID（将来拡張） */
  fromSid?: string
  /** トラックSID（将来拡張） */
  trackSid?: string
}

/**
 * 音声ハンドラー
 */
export interface VoiceHandlers {
  /**
   * 受信PCM処理（48kHz/PCM16/mono）
   * @param pcm - 受信したPCMデータ
   * @param meta - メタデータ
   */
  onRemotePcm?: (pcm: Int16Array, meta: VoiceMetadata) => Promise<void> | void

  /**
   * ローカルPCM供給元（TTS など）
   * @returns 10ms/20ms のPCMフレームを返すAsyncIterable
   */
  getLocalPcmStream?: () => AsyncIterable<Int16Array>
}

/**
 * attachVoice のオプション
 */
export interface AttachVoiceOptions {
  /** フレーム長（ミリ秒） default: 20 */
  frameDurationMs?: 10 | 20
  /** サンプルレート（情報目的、内部は48kHz固定） default: 48000 */
  sampleRate?: 48000 | 24000 | 16000
  /** チャンネル数（送信は1ch必須） default: 1 */
  channels?: 1 | 2
  /** 自動パブリッシュ開始 default: true */
  autoStartPublish?: boolean
  /** audioトピックの自動追加 default: true */
  enableTopicAutoAdd?: boolean
  /** ログタグ default: 'voice.bridge' */
  loggerTag?: string
}

/**
 * VoiceAttachment インターフェース
 */
export interface VoiceAttachment {
  /** ブリッジを解除する */
  detach(): Promise<void>
}

/**
 * 内部状態管理用（エクスポートしない）
 */
export interface AttachmentState {
  agent: VoiceCapableClient
  transport: RealtimeTransport
  original: {
    sendVoiceFrame?: VoiceCapableClient['sendVoiceFrame']
    muteVoice?: VoiceCapableClient['muteVoice']
  }
  removeListener?: () => void
  abortController?: AbortController
  isPublishing: boolean
  expectedSamples: 480 | 960
}
