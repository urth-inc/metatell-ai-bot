import type { vi } from 'vitest'

// Phoenix Channel モック用の型定義
export interface MockChannel {
  on: ReturnType<typeof vi.fn>
  push: ReturnType<typeof vi.fn>
  leave: ReturnType<typeof vi.fn>
  join: ReturnType<typeof vi.fn>
}

// Phoenix Socket モック用の型定義
export interface MockSocket {
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  isConnected: ReturnType<typeof vi.fn>
  channel: ReturnType<typeof vi.fn>
  onOpen: ReturnType<typeof vi.fn>
  onClose: ReturnType<typeof vi.fn>
  onError: ReturnType<typeof vi.fn>
}

// Phoenix Presence モック用の型定義
export interface MockPresence {
  onSync: ReturnType<typeof vi.fn>
  list: ReturnType<typeof vi.fn>
  onJoin: ReturnType<typeof vi.fn>
  onLeave: ReturnType<typeof vi.fn>
}

// モック関数の呼び出し型
export type MockCall = [string, ...unknown[]]

// より型安全なモック関数アクセス用のヘルパー
export function getMockCalls<T extends { mock: { calls: unknown[][] } }>(fn: T): MockCall[] {
  return fn.mock.calls as MockCall[]
}

// 特定の引数でモック関数が呼び出されたか確認するヘルパー
export function findMockCall<T extends { mock: { calls: unknown[][] } }>(
  fn: T,
  predicate: (call: MockCall) => boolean,
): MockCall | undefined {
  return getMockCalls(fn).find(predicate)
}

// EventBus用のモック呼び出しヘルパー
export type EventBusCall = [string, (...args: unknown[]) => void]

export function findEventBusCall<T extends { mock: { calls: unknown[][] } }>(
  fn: T,
  event: string,
): EventBusCall | undefined {
  const calls = fn.mock.calls as EventBusCall[]
  return calls.find((call) => call[0] === event)
}

// Channel用のモック呼び出しヘルパー
export type ChannelCall = [string, unknown]

export function findChannelCall<T extends { mock: { calls: unknown[][] } }>(
  fn: T,
  event: string,
): ChannelCall | undefined {
  const calls = fn.mock.calls as ChannelCall[]
  return calls.find((call) => call[0] === event)
}

// Phoenix Socket options の型定義
export interface SocketOptions {
  params?: Record<string, unknown>
  [key: string]: unknown
}
