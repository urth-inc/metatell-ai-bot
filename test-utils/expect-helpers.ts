// Vitest expect helper functions

// Matcher to verify something is a function
export function toBeFunction(received: unknown): boolean {
  return typeof received === 'function'
}

// Custom matcher error messages
export function toBeFunctionMessage(received: unknown, pass: boolean): string {
  return pass
    ? `expected ${received} not to be a function`
    : `expected ${received} to be a function`
}
