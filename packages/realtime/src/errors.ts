export class RealtimeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(code) // エラーコードをメッセージとして使用
    this.name = 'RealtimeError'
    this.details = message // 詳細メッセージは別プロパティに保存
  }

  public readonly details: string
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
