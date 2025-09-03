import type { vi } from 'vitest'

// Phoenix Channel mock type definition
export interface MockChannel {
  on: ReturnType<typeof vi.fn>
  push: ReturnType<typeof vi.fn>
  leave: ReturnType<typeof vi.fn>
  join: ReturnType<typeof vi.fn>
}

// Phoenix Socket mock type definition
export interface MockSocket {
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  isConnected: ReturnType<typeof vi.fn>
  channel: ReturnType<typeof vi.fn>
  onOpen: ReturnType<typeof vi.fn>
  onClose: ReturnType<typeof vi.fn>
  onError: ReturnType<typeof vi.fn>
}

// Phoenix Presence mock type definition
export interface MockPresence {
  onSync: ReturnType<typeof vi.fn>
  list: ReturnType<typeof vi.fn>
  onJoin: ReturnType<typeof vi.fn>
  onLeave: ReturnType<typeof vi.fn>
}

// Mock function call type
export type MockCall = [string, ...unknown[]]

// Helper for type-safe mock function access
export function getMockCalls<T extends { mock: { calls: unknown[][] } }>(fn: T): MockCall[] {
  return fn.mock.calls as MockCall[]
}

// Helper to check if mock function was called with specific arguments
export function findMockCall<T extends { mock: { calls: unknown[][] } }>(
  fn: T,
  predicate: (call: MockCall) => boolean,
): MockCall | undefined {
  return getMockCalls(fn).find(predicate)
}

// EventBus mock call helper
export type EventBusCall = [string, (...args: unknown[]) => void]

export function findEventBusCall<T extends { mock: { calls: unknown[][] } }>(
  fn: T,
  event: string,
): EventBusCall | undefined {
  const calls = fn.mock.calls as EventBusCall[]
  return calls.find((call) => call[0] === event)
}

// Channel mock call helper
export type ChannelCall = [string, unknown]

export function findChannelCall<T extends { mock: { calls: unknown[][] } }>(
  fn: T,
  event: string,
): ChannelCall | undefined {
  const calls = fn.mock.calls as ChannelCall[]
  return calls.find((call) => call[0] === event)
}

// Phoenix Socket options type definition
export interface SocketOptions {
  params?: Record<string, unknown>
  [key: string]: unknown
}
