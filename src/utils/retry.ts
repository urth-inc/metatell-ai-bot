/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
}

/**
 * Default retry configuration
 */
const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 10,
  initialDelayMs: 1000,
  maxDelayMs: 32000,
  backoffMultiplier: 2,
}

/**
 * Create a retry function with custom configuration
 */
export function createRetry(config: Partial<RetryConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }

  return {
    /**
     * Retry an operation until it succeeds
     */
    async retryUntilSuccess<T>(
      operation: () => Promise<T> | T,
      isSuccess: (result: T) => boolean,
    ): Promise<T> {
      let delay = finalConfig.initialDelayMs

      for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
        const result = await operation()
        
        if (isSuccess(result)) {
          return result
        }

        if (attempt === finalConfig.maxAttempts) {
          return result
        }

        await new Promise(resolve => setTimeout(resolve, delay))
        delay = Math.min(delay * finalConfig.backoffMultiplier, finalConfig.maxDelayMs)
      }

      // This should never be reached due to the loop structure
      throw new Error('Retry loop completed unexpectedly')
    },

    /**
     * Wait for a condition to become true
     */
    async waitUntil(condition: () => Promise<boolean> | boolean): Promise<void> {
      await this.retryUntilSuccess(condition, result => result === true)
    },
  }
}

/**
 * Default retry instance with standard configuration
 */
export const retry = createRetry()

/**
 * Convenience function using default configuration
 */
export const retryUntilSuccess = retry.retryUntilSuccess.bind(retry)

/**
 * Convenience function using default configuration  
 */
export const waitUntil = retry.waitUntil.bind(retry)