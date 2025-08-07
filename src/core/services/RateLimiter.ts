import type { IRateLimiter, RateLimitConfig } from '../interfaces/IRateLimiter'

interface RateLimitBucket {
  count: number
  resetTime: number
}

export class RateLimiter implements IRateLimiter {
  private buckets = new Map<string, RateLimitBucket>()
  private config: RateLimitConfig

  constructor(config: RateLimitConfig = { maxRequests: 1, windowMs: 15000 }) {
    this.config = config
  }

  check(key: string = 'default'): boolean {
    const now = Date.now()
    const bucket = this.buckets.get(key)

    if (!bucket || now >= bucket.resetTime) {
      // Create new bucket or reset expired one
      this.buckets.set(key, {
        count: 1,
        resetTime: now + this.config.windowMs,
      })
      return true
    }

    if (bucket.count < this.config.maxRequests) {
      bucket.count++
      return true
    }

    return false
  }

  async wait(key: string = 'default'): Promise<void> {
    const timeToWait = this.getTimeUntilReset(key)
    if (timeToWait > 0) {
      await new Promise((resolve) => setTimeout(resolve, timeToWait))
    }
  }

  reset(key: string = 'default'): void {
    this.buckets.delete(key)
  }

  getTimeUntilReset(key: string = 'default'): number {
    const bucket = this.buckets.get(key)
    if (!bucket) {
      return 0
    }

    const now = Date.now()
    const timeRemaining = bucket.resetTime - now
    return Math.max(0, timeRemaining)
  }
}
