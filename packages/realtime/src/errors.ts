import { MetatellError } from '@metatell/sdk'

export class RealtimeError extends MetatellError {
  constructor(
    public readonly code: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'RealtimeError'
  }
}

export const ErrorCodes = {
  ALREADY_CONNECTING: 'AlreadyConnecting',
  UNKNOWN_TOPIC: 'UnknownTopic',
  AUDIO_NOT_STARTED: 'AudioNotStarted',
  NOT_CONNECTED: 'NotConnected',
  CONNECTION_FAILED: 'ConnectionFailed',
  SEND_FAILED: 'SendFailed',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]
