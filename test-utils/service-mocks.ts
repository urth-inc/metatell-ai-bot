import type { vi } from 'vitest'

// ServiceFactory type definition
export type ServiceFactory<T = unknown> = (container?: unknown) => T

// RegisterOptions type definition
export interface RegisterOptions {
  singleton?: boolean
}

// ServiceContainer mock type
export interface MockServiceContainer {
  register: ReturnType<typeof vi.fn>
  get: ReturnType<typeof vi.fn>
  has: ReturnType<typeof vi.fn>
  bind: ReturnType<typeof vi.fn>
  bindWithDependencies: ReturnType<typeof vi.fn>
}

// Mock call types
export type RegisterCall = [string, ServiceFactory, RegisterOptions?]
export type GetCall = [string]

// Helper to find type-safe register method mock calls
export function findRegisterCall(
  container: MockServiceContainer,
  serviceName: string,
): RegisterCall | undefined {
  const calls = container.register.mock.calls as RegisterCall[]
  return calls.find((call) => call[0] === serviceName)
}

// Helper to find get method calls
export function findGetCall(
  container: MockServiceContainer,
  serviceName: string,
): GetCall | undefined {
  const calls = container.get.mock.calls as GetCall[]
  return calls.find((call) => call[0] === serviceName)
}
