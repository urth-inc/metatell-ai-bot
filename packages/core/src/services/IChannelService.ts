/**
 * Interface for channel communication services
 * Provides proper abstraction for Phoenix channel operations
 */

import type { Channel } from 'phoenix'

/**
 * Result of a channel push operation
 */
export interface PushResult<T = unknown> {
  status: 'ok' | 'error' | 'timeout'
  data?: T
  error?: string
}

/**
 * Options for push operations
 */
export interface PushOptions {
  timeoutMs?: number
  retries?: number
  retryDelayMs?: number
}

/**
 * Batch push operation
 */
export interface BatchPushOperation {
  event: string
  payload?: object
  options?: PushOptions
  onSuccess?: (response: unknown) => void
  onError?: (error: Error) => void
}

/**
 * Interface for channel service
 */
export interface IChannelService {
  /**
   * Push a message to a channel and wait for response
   */
  push<T = unknown>(
    channel: Channel,
    event: string,
    payload?: object,
    options?: PushOptions,
  ): Promise<T>

  /**
   * Push multiple operations sequentially
   */
  pushSequence(channel: Channel, operations: BatchPushOperation[]): Promise<PushResult[]>

  /**
   * Push multiple operations in parallel
   */
  pushParallel(channel: Channel, operations: BatchPushOperation[]): Promise<PushResult[]>

  /**
   * Subscribe to channel events
   */
  subscribe(channel: Channel, event: string, handler: (payload: unknown) => void): () => void

  /**
   * Wait for a specific event on a channel
   */
  waitForEvent<T = unknown>(channel: Channel, event: string, timeoutMs?: number): Promise<T>
}
