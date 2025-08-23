/**
 * Implementation of channel communication service
 * Encapsulates Phoenix channel operations with proper error handling and retries
 */

import type { Channel } from 'phoenix'
import { getLogger } from '../../sdk/logging/index.js'
import type {
  BatchPushOperation,
  IChannelService,
  PushOptions,
  PushResult,
} from './IChannelService.js'

export class ChannelService implements IChannelService {
  private readonly logger = getLogger('ChannelService')
  private readonly defaultTimeoutMs = 30000
  private readonly defaultRetryDelayMs = 1000

  async push<T = unknown>(
    channel: Channel,
    event: string,
    payload: object = {},
    options: PushOptions = {},
  ): Promise<T> {
    const {
      timeoutMs = this.defaultTimeoutMs,
      retries = 0,
      retryDelayMs = this.defaultRetryDelayMs,
    } = options

    let lastError: Error | undefined
    let attempt = 0

    while (attempt <= retries) {
      try {
        return await this.pushWithTimeout<T>(channel, event, payload, timeoutMs)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt < retries) {
          this.logger.debug(`Push '${event}' failed, retrying...`, {
            attempt: attempt + 1,
            maxRetries: retries,
            error: lastError.message,
          })

          await this.delay(retryDelayMs * 2 ** attempt) // Exponential backoff
        }

        attempt++
      }
    }

    throw lastError || new Error(`Push '${event}' failed after ${retries + 1} attempts`)
  }

  async pushSequence(channel: Channel, operations: BatchPushOperation[]): Promise<PushResult[]> {
    const results: PushResult[] = []

    for (const op of operations) {
      try {
        const data = await this.push(channel, op.event, op.payload, op.options)

        if (op.onSuccess) {
          op.onSuccess(data)
        }

        results.push({ status: 'ok', data })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)

        if (op.onError) {
          op.onError(error instanceof Error ? error : new Error(errorMessage))
        }

        results.push({ status: 'error', error: errorMessage })

        // Stop sequence on error unless explicitly handled
        if (!op.onError) {
          break
        }
      }
    }

    return results
  }

  async pushParallel(channel: Channel, operations: BatchPushOperation[]): Promise<PushResult[]> {
    const promises = operations.map(async (op) => {
      try {
        const data = await this.push(channel, op.event, op.payload, op.options)

        if (op.onSuccess) {
          op.onSuccess(data)
        }

        return { status: 'ok' as const, data }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)

        if (op.onError) {
          op.onError(error instanceof Error ? error : new Error(errorMessage))
        }

        return { status: 'error' as const, error: errorMessage }
      }
    })

    return Promise.all(promises)
  }

  subscribe(channel: Channel, event: string, handler: (payload: unknown) => void): () => void {
    const ref = channel.on(event, handler)

    return () => {
      channel.off(event, ref)
    }
  }

  async waitForEvent<T = unknown>(
    channel: Channel,
    event: string,
    timeoutMs = this.defaultTimeoutMs,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        channel.off(event, ref)
        reject(new Error(`Timeout waiting for event '${event}' after ${timeoutMs}ms`))
      }, timeoutMs)

      const ref = channel.on(event, (payload: T) => {
        clearTimeout(timeoutId)
        channel.off(event, ref)
        resolve(payload)
      })
    })
  }

  private pushWithTimeout<T>(
    channel: Channel,
    event: string,
    payload: object,
    timeoutMs: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const push = channel.push(event, payload)

      push
        .receive('ok', (response: T) => resolve(response))
        .receive('error', (error: unknown) => {
          const errorMessage = typeof error === 'string' ? error : JSON.stringify(error)
          reject(new Error(`Push '${event}' failed: ${errorMessage}`))
        })
        .receive('timeout', () => {
          reject(new Error(`Push '${event}' timed out after ${timeoutMs}ms`))
        })
    })
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
