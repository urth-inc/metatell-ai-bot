// テスト用の型定義

// メッセージハンドラーの型
export type MessageHandler = (payload: { body: string; session_id: string }) => void

// Presenceハンドラーの型
export type PresenceHandler = (user: unknown) => void

// 汎用的なイベントハンドラーの型
export type EventHandler = (...args: unknown[]) => void

// ServiceContainerのファクトリ関数の型
export type ServiceFactory<T = unknown> = (container?: unknown) => T

// 登録オプションの型
export interface RegisterOptions {
  singleton?: boolean
}

// Vitest expect.any() の代替型
export type ExpectAnyFunction = () => unknown
