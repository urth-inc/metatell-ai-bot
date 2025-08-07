import type { vi } from 'vitest'
import type { ServiceFactory, RegisterOptions } from './types'

// ServiceContainer のモック型
export interface MockServiceContainer {
  register: ReturnType<typeof vi.fn>
  get: ReturnType<typeof vi.fn>
  has: ReturnType<typeof vi.fn>
  bind: ReturnType<typeof vi.fn>
  bindWithDependencies: ReturnType<typeof vi.fn>
}

// モック呼び出しの型
export type RegisterCall = [string, ServiceFactory, RegisterOptions?]
export type GetCall = [string]

// より型安全な register メソッドのモック呼び出しを見つけるヘルパー
export function findRegisterCall(
  container: MockServiceContainer,
  serviceName: string,
): RegisterCall | undefined {
  const calls = container.register.mock.calls as RegisterCall[]
  return calls.find((call) => call[0] === serviceName)
}

// get メソッドの呼び出しを見つけるヘルパー
export function findGetCall(
  container: MockServiceContainer,
  serviceName: string,
): GetCall | undefined {
  const calls = container.get.mock.calls as GetCall[]
  return calls.find((call) => call[0] === serviceName)
}
