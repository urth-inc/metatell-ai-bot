import type { Blackboard, JsonValue } from './types.js'

/** Creates the single blackboard instance for one bot. */
export function createBlackboard(): Blackboard {
  const store = new Map<string, JsonValue>()
  return {
    get(key) {
      return store.get(key)
    },
    set(key, value) {
      store.set(key, value)
    },
    delete(key) {
      store.delete(key)
    },
    keys() {
      return [...store.keys()]
    },
  }
}
