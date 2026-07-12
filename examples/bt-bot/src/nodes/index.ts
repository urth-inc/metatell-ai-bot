import { registerBuiltinActions } from './actions.js'
import { registerBuiltinConditions } from './conditions.js'
import { registerLlmActions } from './llm-nodes.js'

/** Registers every built-in node. Call once at startup, before loading tree.json. */
export function registerBuiltins(): void {
  registerBuiltinConditions()
  registerBuiltinActions()
  registerLlmActions()
}
