/**
 * Rate limiting utilities
 */

export interface RateLimiter {
  tryAcquire(): boolean
  getRate(): number
  setRate(perSecond: number): void
}

/**
 * Token bucket rate limiter
 */
export class TokenBucketRateLimiter implements RateLimiter {
  private tokens: number
  private lastRefill: number
  private readonly maxTokens: number

  constructor(private tokensPerSecond: number) {
    this.maxTokens = tokensPerSecond
    this.tokens = tokensPerSecond
    this.lastRefill = Date.now()
  }

  tryAcquire(): boolean {
    this.refill()
    if (this.tokens >= 1) {
      this.tokens -= 1
      return true
    }
    return false
  }

  getRate(): number {
    return this.tokensPerSecond
  }

  setRate(perSecond: number): void {
    this.tokensPerSecond = perSecond
    this.tokens = Math.min(this.tokens, perSecond)
  }

  private refill(): void {
    const now = Date.now()
    const timePassed = (now - this.lastRefill) / 1000
    const tokensToAdd = timePassed * this.tokensPerSecond
    this.tokens = Math.min(this.tokens + tokensToAdd, this.maxTokens)
    this.lastRefill = now
  }
}

/**
 * Rate limited queue for different operation types
 */
export class RateLimitedQueue {
  private limiters = new Map<string, RateLimiter>()

  setRate(key: string, perSecond: number): void {
    const limiter = this.limiters.get(key)
    if (limiter) {
      limiter.setRate(perSecond)
    } else {
      this.limiters.set(key, new TokenBucketRateLimiter(perSecond))
    }
  }

  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const limiter = this.limiters.get(key)
    if (!limiter) {
      return fn()
    }

    // レート制限のチェックとリトライ
    let attempts = 0
    while (!limiter.tryAcquire()) {
      attempts++
      if (attempts > 10) {
        throw new Error(`Rate limit exceeded for ${key}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    return fn()
  }

  getRate(key: string): number | undefined {
    return this.limiters.get(key)?.getRate()
  }
}

/**
 * Wrapper function for rate-limited operations
 */
export async function withRate<T>(
  queue: RateLimitedQueue,
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  return queue.execute(key, fn)
}
