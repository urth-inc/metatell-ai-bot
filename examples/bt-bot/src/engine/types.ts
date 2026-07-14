/**
 * Core types for the bt-bot behavior tree engine.
 * The engine is dependency-free and driven by a fixed-interval tick.
 */

/** Result of ticking a node. */
export type Status = 'SUCCESS' | 'FAILURE' | 'RUNNING'

/** JSON value types. tree.json and blackboard values are restricted to these. */
export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject
export type JsonObject = { [key: string]: JsonValue }

/** 3D position in meters. */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/** A single node definition inside tree.json. */
export interface NodeDef {
  type: string
  /** Condition and action nodes reference a registered node implementation by name. */
  name?: string
  params?: JsonObject
  /** Children of sequence / selector nodes. */
  children?: NodeDef[]
  /** Child of decorator nodes (inverter / cooldown / repeat). */
  child?: NodeDef
}

/** Root document shape of tree.json. */
export interface TreeDef {
  root: NodeDef
}

/**
 * Key-value store shared by all nodes of one bot.
 * The sensor layer writes a perception snapshot before every tick.
 */
export interface Blackboard {
  get(key: string): JsonValue | undefined
  set(key: string, value: JsonValue): void
  delete(key: string): void
  keys(): string[]
}

/** A mention addressed to the bot, waiting to be answered. */
export interface PendingMention {
  fromName: string
  text: string
  reply(text: string): Promise<boolean>
}

/** One line of perceived chat. */
export interface ChatLine {
  fromName: string
  text: string
  atMs: number
}

/** Chat perception queue. Bot-authored messages never enter here (safety guard). */
export interface ChatInbox {
  /** Look at the oldest unanswered mention without consuming it. */
  peekMention(): PendingMention | undefined
  /** Consume the oldest unanswered mention. */
  takeMention(): PendingMention | undefined
  /** Recently perceived chat lines, oldest first. */
  recentChat(): ChatLine[]
}

/** Interface used by the LLM nodes. Null when no LLM key is configured. */
export interface LlmApi {
  /** Free-form completion. Returns the assistant text. */
  complete(req: { system: string; user: string }): Promise<string>
  /** Choose one option from a list. Returns the chosen index. */
  choose(req: { system: string; user: string; choices: string[] }): Promise<number>
}

/**
 * Actions talk to the world only through this facade.
 * Safety guards (minimum say interval, bounds clamp, speed cap) live behind it
 * and cannot be bypassed from tree.json or custom nodes.
 */
export interface BotApi {
  botName: string
  /** Natural-language character sheet loaded from my-bot/persona.md. */
  persona: string
  /** Send a chat message. Returns false when suppressed by the say-interval guard. */
  say(text: string): Promise<boolean>
  /**
   * Move one capped step towards the target and report progress.
   * The target is clamped to the room bounds.
   */
  moveTowards(target: Vec3): 'moving' | 'arrived'
  lookAt(target: Vec3): void
  /**
   * Play an avatar animation. The name is resolved through the emotes
   * aliases in bot.config.json, then against the avatar's available
   * animation ids/names. Unassigned aliases are skipped, not failed.
   */
  emote(animation: string): Promise<'played' | 'skipped' | 'failed'>
  /** Next patrol point. Cycles through bot.config.json patrol entries. */
  patrolTarget(index: number): { label: string; position: Vec3 } | undefined
  patrolLength(): number
  /** Expand {greeting} {botName} {userName} template variables. */
  expand(text: string): string
  llm: LlmApi | null
  log(message: string): void
}

/** Everything a node can see during one tick. */
export interface TickContext {
  bb: Blackboard
  inbox: ChatInbox
  api: BotApi
  /** Timestamp of the current tick in ms. All nodes in one tick share it. */
  now: number
  /** Per-tick trace used by the console visualizer. */
  trace: TraceEntry[]
}

export interface TraceEntry {
  depth: number
  label: string
  status: Status
}

/** A built node instance. */
export interface BTNode {
  readonly label: string
  tick(ctx: TickContext): Status
  reset(): void
}

/**
 * Condition implementation: a synchronous predicate.
 * Exceptions are converted to FAILURE by the engine.
 */
export type ConditionFn = (ctx: TickContext, params: JsonObject) => boolean

/**
 * Action implementation.
 * - Returning a Status runs the function again on every tick (return RUNNING to continue).
 * - Returning a Promise runs the function once; the node reports RUNNING until it settles.
 */
export type ActionFn = (ctx: TickContext, params: JsonObject) => Status | Promise<Status>

/** Declares the params a node accepts, used by validation and the /design catalog. */
export interface ParamSpec {
  [key: string]: {
    /** "json" accepts any JSON value and skips the type check. */
    type: 'string' | 'number' | 'boolean' | 'json'
    required?: boolean
    description?: string
  }
}
