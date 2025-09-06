// Type definitions for tests

// Message handler type
export type MessageHandler = (payload: { body: string; session_id: string }) => void

// Presence handler type
export type PresenceHandler = (user: unknown) => void

// Generic event handler type
export type EventHandler = (...args: unknown[]) => void

// ServiceContainer factory function type
export type ServiceFactory<T = unknown> = (container?: unknown) => T

// Registration options type
export interface RegisterOptions {
  singleton?: boolean
}

// Alternative type for Vitest expect.any()
export type ExpectAnyFunction = () => unknown
