import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const VAD = require('webrtcvad').default

/**
 * WebRTC VADを使用した音声活動検出
 */
export class VadProcessor {
  private vad: VAD
  private readonly sampleRate = 48000
  private readonly vadLevel = 1 // 0-3 (0が最も寛容, 3が最も厳格) - より敏感に設定

  // VAD判定用バッファ
  private speechFrames = 0
  private silenceFrames = 0
  private readonly speechThreshold = 10 // 200ms以上の発話で録音開始 (20ms * 10 = 200ms) - より早く録音開始
  private readonly silenceThreshold = 50 // 1秒以上の無音で録音終了 (20ms * 50 = 1000ms)

  constructor() {
    this.vad = new VAD(this.sampleRate, this.vadLevel)
  }

  /**
   * 音声フレームを処理してVAD状態を判定
   */
  processFrame(frame: Int16Array): {
    isSpeech: boolean
    shouldStartRecording: boolean
    shouldStopRecording: boolean
  } {
    // WebRTC VADは10ms, 20ms, 30msのフレームサイズのみサポート
    // 48kHzで20ms = 960サンプル
    const isSpeech = this.vad.process(frame)

    let shouldStartRecording = false
    let shouldStopRecording = false

    if (isSpeech) {
      this.speechFrames++
      this.silenceFrames = 0

      // 300ms以上の発話で録音開始
      if (this.speechFrames >= this.speechThreshold) {
        shouldStartRecording = true
      }
    } else {
      this.silenceFrames++

      // 録音中に1秒以上の無音で録音終了
      if (this.speechFrames > 0 && this.silenceFrames >= this.silenceThreshold) {
        shouldStopRecording = true
        this.reset()
      }
    }

    return {
      isSpeech,
      shouldStartRecording,
      shouldStopRecording,
    }
  }

  /**
   * VAD状態をリセット
   */
  reset() {
    this.speechFrames = 0
    this.silenceFrames = 0
  }

  /**
   * VADレベルを変更 (0-3)
   */
  setLevel(level: number) {
    if (level >= 0 && level <= 3) {
      this.vad = new VAD(this.sampleRate, level)
    }
  }
}
