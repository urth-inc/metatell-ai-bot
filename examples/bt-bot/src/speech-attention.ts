import type { Vec3 } from './engine/types.js'
import type { SpeechContext } from './safety.js'

interface SpeechAttentionDependencies {
  getTargetPosition(sessionId: string): Vec3 | undefined
  holdPositionAndLookAt(target?: Vec3): Promise<() => void>
}

/**
 * Serializes the physical attention around each utterance so a queued reply
 * cannot turn the avatar away from the person it is currently speaking to.
 */
export class SpeechAttentionCoordinator {
  private tail = Promise.resolve()
  private closed = false

  constructor(private readonly dependencies: SpeechAttentionDependencies) {}

  run(context: SpeechContext | undefined, speak: () => Promise<void>): Promise<void> {
    const task = this.tail.then(async () => {
      if (this.closed) throw new Error('音声案内は停止済みです')
      const target = context?.targetSessionId
        ? this.dependencies.getTargetPosition(context.targetSessionId)
        : undefined
      const releasePosition = await this.dependencies.holdPositionAndLookAt(target)
      try {
        await speak()
      } finally {
        releasePosition()
      }
    })
    // A failed utterance must not poison the queue for later replies.
    this.tail = task.catch(() => {})
    return task
  }

  close(): void {
    this.closed = true
  }
}
