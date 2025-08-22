import type { Channel, Push } from 'phoenix'

/**
 * Phoenix Channel push操作をPromiseでラップするユーティリティ
 * タイムアウト処理を含む非同期処理を簡潔に書けるようにする
 */
export function pushPromise(
  channel: Channel,
  event: string,
  payload: unknown = {},
  timeoutMs = 30000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const push: Push = channel.push(event, payload)

    push
      .receive('ok', (response) => resolve(response))
      .receive('error', (error) => {
        const errorMessage = typeof error === 'string' ? error : JSON.stringify(error)
        reject(new Error(`Push '${event}' failed: ${errorMessage}`))
      })
      .receive('timeout', () => {
        reject(new Error(`Push '${event}' timed out after ${timeoutMs}ms`))
      })
  })
}

/**
 * 複数のプッシュ操作を順次実行するヘルパー
 */
export async function pushSequence(
  channel: Channel,
  operations: Array<{
    event: string
    payload?: unknown
    timeoutMs?: number
    onSuccess?: (response: unknown) => void
  }>,
): Promise<void> {
  for (const op of operations) {
    const response = await pushPromise(channel, op.event, op.payload, op.timeoutMs)

    if (op.onSuccess) {
      op.onSuccess(response)
    }
  }
}

/**
 * タイムアウト付きのPromiseラッパー
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage?: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(timeoutMessage || `Operation timed out after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    ),
  ])
}
