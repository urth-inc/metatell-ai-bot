import type { Vec3 } from './engine/types.js'

/**
 * Safety guards baked into the runtime. These are engine constants on
 * purpose: they must not be configurable from the user-editable files
 * (tree.json / bot.config.json / custom-nodes.ts).
 */

/** Minimum interval between chat messages. Structurally prevents chat floods. */
export const MIN_SAY_INTERVAL_MS = 5_000

/** Chat messages longer than this are truncated. */
export const MAX_SAY_LENGTH = 300

/** Movement speed cap in meters per second. */
export const MAX_SPEED_MPS = 2

/** Distance below which a move target counts as reached. */
export const ARRIVE_THRESHOLD_M = 0.8

/** moveTo targets are clamped into this box. */
export const ROOM_BOUNDS = {
  min: { x: -50, y: -5, z: -50 },
  max: { x: 50, y: 20, z: 50 },
}

/** Chat command that stops the bot immediately (operator kill switch). */
export const KILL_COMMAND = '/killall'

export interface SafeSpeaker {
  /** Sends unless within the minimum interval. Returns whether it was sent. */
  trySend(send: () => Promise<void>, text: string): Promise<boolean>
}

/**
 * One shared clock for every way the bot can speak (say / reply / report).
 * Suppressed messages are dropped, not queued, so a broken tree cannot
 * build up a backlog of messages.
 */
export function createSafeSpeaker(log: (message: string) => void): SafeSpeaker {
  let lastSentMs = Number.NEGATIVE_INFINITY
  return {
    async trySend(send, text) {
      const now = Date.now()
      if (now - lastSentMs < MIN_SAY_INTERVAL_MS) {
        log(
          `発言間隔ガード: 「${text.slice(0, 30)}」を抑制しました（最短${MIN_SAY_INTERVAL_MS / 1000}秒間隔）`,
        )
        return false
      }
      lastSentMs = now
      await send()
      return true
    },
  }
}

export function truncateSay(text: string): string {
  return text.length > MAX_SAY_LENGTH ? `${text.slice(0, MAX_SAY_LENGTH)}…` : text
}

export function clampToBounds(target: Vec3): Vec3 {
  const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value))
  return {
    x: clamp(target.x, ROOM_BOUNDS.min.x, ROOM_BOUNDS.max.x),
    y: clamp(target.y, ROOM_BOUNDS.min.y, ROOM_BOUNDS.max.y),
    z: clamp(target.z, ROOM_BOUNDS.min.z, ROOM_BOUNDS.max.z),
  }
}

/** Computes one speed-capped step from `from` towards `to` for a tick of dtMs. */
export function stepTowards(from: Vec3, to: Vec3, dtMs: number): { next: Vec3; arrived: boolean } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (distance <= ARRIVE_THRESHOLD_M) return { next: from, arrived: true }
  const maxStep = (MAX_SPEED_MPS * dtMs) / 1000
  const ratio = Math.min(maxStep, distance) / distance
  return {
    next: { x: from.x + dx * ratio, y: from.y + dy * ratio, z: from.z + dz * ratio },
    arrived: false,
  }
}
