export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

export interface IRateLimiter {
  check(key?: string): boolean
  wait(key?: string): Promise<void>
  reset(key?: string): void
  getTimeUntilReset(key?: string): number
}
