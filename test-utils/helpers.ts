// Common helper functions for tests

// No-op function to avoid empty blocks
export const noop = (): void => undefined

// Console mock creation helper
export const mockConsole = {
  log: () => noop,
  error: () => noop,
  warn: () => noop,
  info: () => noop,
  debug: () => noop,
}
