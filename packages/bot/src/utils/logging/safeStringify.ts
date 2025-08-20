/**
 * Safe JSON stringification with circular reference and size limit support
 */

export function safeStringify(obj: unknown, maxLen = 10_000): string {
  try {
    const cache = new Set<unknown>()
    const str = JSON.stringify(
      obj,
      (_key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (cache.has(value)) {
            return '[Circular]'
          }
          cache.add(value)
        }
        return value
      },
      2 // Pretty print with 2 spaces
    )
    return str.length > maxLen ? `${str.slice(0, maxLen)}…[truncated]` : str
  } catch (error) {
    // Fallback for any stringification errors
    try {
      return `[Unserializable: ${error instanceof Error ? error.message : String(error)}]`
    } catch {
      return '[Unserializable]'
    }
  }
}