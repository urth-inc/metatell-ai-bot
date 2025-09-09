/**
 * Core error definitions
 */

export abstract class MetatellError extends Error {
  abstract readonly code: string
  readonly timestamp = new Date()

  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

export class AuthenticationError extends MetatellError {
  readonly code = 'AUTH_ERROR'

  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
  }
}

export class RateLimitedError extends MetatellError {
  readonly code = 'RATE_LIMITED'

  constructor(
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message)
  }
}

export class TransportError extends MetatellError {
  readonly code = 'TRANSPORT_ERROR'

  constructor(
    message: string,
    public readonly reason?: string,
  ) {
    super(message)
  }
}

export class ProtocolError extends MetatellError {
  readonly code = 'PROTOCOL_ERROR'

  constructor(
    message: string,
    public readonly data?: unknown,
  ) {
    super(message)
  }
}

export class TimeoutError extends MetatellError {
  readonly code = 'TIMEOUT_ERROR'

  constructor(
    message: string,
    public readonly timeoutMs: number,
  ) {
    super(message)
  }
}

export function isMetatellError(error: unknown): error is MetatellError {
  return error instanceof MetatellError
}

export function isRetryableError(error: unknown): boolean {
  if (!isMetatellError(error)) return false

  return (
    error instanceof TransportError ||
    error instanceof TimeoutError ||
    (error instanceof RateLimitedError && error.retryAfterMs !== undefined)
  )
}
