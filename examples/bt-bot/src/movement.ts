import type { Vec3 } from './engine/types.js'
import { clampToBounds, stepTowards } from './safety.js'

/** Networked A-Frame interpolates roughly 100 ms of avatar movement. */
export const MOVEMENT_UPDATE_INTERVAL_MS = 100

const LOOK_TARGET_CHANGE_THRESHOLD_M = 0.25

interface MovementAvatar {
  getPosition(): Vec3 | null | undefined
  moveTo(target: Vec3): Promise<void>
  lookAt(target: Vec3): Promise<void>
}

interface PendingMove {
  generation: number
  target: Vec3
}

export interface SmoothMovementDependencies {
  avatar: MovementAvatar
  setWalking(walking: boolean): void
  log(message: string): void
  /** Tests can drive update() manually without creating a real timer. */
  autoStart?: boolean
}

function distanceSquared(left: Vec3, right: Vec3): number {
  const dx = left.x - right.x
  const dy = left.y - right.y
  const dz = left.z - right.z
  return dx * dx + dy * dy + dz * dz
}

function samePosition(left: Vec3, right: Vec3): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z
}

/**
 * Keeps movement updates aligned with the client's interpolation window while
 * the behavior tree remains on its slower decision-making tick.
 */
export class SmoothMovementController {
  private target: Vec3 | null = null
  private lastLookTarget: Vec3 | null = null
  private requestedThisBehaviorTick = false
  private pendingMove: PendingMove | null = null
  private sendingMove = false
  private movementSettledResolvers = new Set<() => void>()
  private generation = 0
  private positionHoldCount = 0
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly dependencies: SmoothMovementDependencies) {
    if (dependencies.autoStart !== false) {
      this.timer = setInterval(() => this.update(), MOVEMENT_UPDATE_INTERVAL_MS)
    }
  }

  /** Start a BT tick. endBehaviorTick() stops stale movement if no move node ran. */
  beginBehaviorTick(): void {
    this.requestedThisBehaviorTick = false
  }

  /**
   * Set or refresh the desired target. Actual 0.2 m steps are sent by update().
   */
  moveTowards(rawTarget: Vec3): 'moving' | 'arrived' {
    this.requestedThisBehaviorTick = true
    if (this.positionHoldCount > 0) return 'moving'

    const target = clampToBounds(rawTarget)
    const from = this.dependencies.avatar.getPosition()
    if (from) {
      const { arrived } = stepTowards(from, target, MOVEMENT_UPDATE_INTERVAL_MS)
      if (arrived) {
        this.stop()
        return 'arrived'
      }
    }

    if (this.target !== null && !samePosition(this.target, target)) {
      // Discard a coalesced step for the old destination. An already-sent
      // moveTo cannot be cancelled, so its generation is invalidated too.
      this.pendingMove = null
      this.generation += 1
    }
    this.target = target
    this.dependencies.setWalking(true)
    if (
      this.lastLookTarget === null ||
      distanceSquared(this.lastLookTarget, target) >= LOOK_TARGET_CHANGE_THRESHOLD_M ** 2
    ) {
      this.lastLookTarget = target
      this.dependencies.avatar.lookAt(target).catch((error) => {
        // Allow the next behavior tick to retry the same target. Do not erase
        // a newer target when an older lookAt request fails late.
        if (this.lastLookTarget === target) this.lastLookTarget = null
        this.dependencies.log(`lookAtに失敗: ${String(error)}`)
      })
    }
    return 'moving'
  }

  /** Called after one BT tick to stop a patrol target that was preempted. */
  endBehaviorTick(): void {
    if (!this.requestedThisBehaviorTick) this.stop()
  }

  /** Send one interpolation-sized movement update. Public for deterministic tests. */
  update(): void {
    if (this.positionHoldCount > 0) return

    const target = this.target
    if (!target) return
    const from = this.dependencies.avatar.getPosition()
    if (!from) return

    const { next, arrived } = stepTowards(from, target, MOVEMENT_UPDATE_INTERVAL_MS)
    if (arrived) {
      this.stop()
      return
    }
    this.dependencies.setWalking(true)
    this.queueMove(next)
  }

  /** Looks at a BT-selected target unless an active speech owns the avatar's attention. */
  lookAt(rawTarget: Vec3): void {
    if (this.positionHoldCount > 0) return
    this.dependencies.avatar.lookAt(clampToBounds(rawTarget)).catch((error) => {
      this.dependencies.log(`lookAtに失敗: ${String(error)}`)
    })
  }

  stop(): void {
    this.target = null
    this.lastLookTarget = null
    this.pendingMove = null
    this.generation += 1
    this.dependencies.setWalking(false)
  }

  /**
   * Stops movement and keeps it stopped until every active hold is released.
   * The returned release function is safe to call more than once.
   */
  async holdPositionAndLookAt(rawTarget?: Vec3): Promise<() => void> {
    this.positionHoldCount += 1
    this.stop()
    await this.waitForMovementToSettle()
    // An already-sent moveTo cannot be cancelled. Stop again after it settles
    // so the avatar is idle before it turns toward the conversation partner.
    this.stop()

    if (rawTarget) {
      try {
        await this.dependencies.avatar.lookAt(clampToBounds(rawTarget))
      } catch (error) {
        this.dependencies.log(`lookAtに失敗: ${String(error)}`)
      }
    }

    let released = false
    return () => {
      if (released) return
      released = true
      this.positionHoldCount = Math.max(0, this.positionHoldCount - 1)
    }
  }

  close(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.positionHoldCount = 0
    this.stop()
  }

  private queueMove(target: Vec3): void {
    this.pendingMove = { generation: this.generation, target }
    if (!this.sendingMove) void this.drainMoves()
  }

  private async drainMoves(): Promise<void> {
    this.sendingMove = true
    try {
      while (this.pendingMove) {
        const pending = this.pendingMove
        this.pendingMove = null
        try {
          await this.dependencies.avatar.moveTo(pending.target)
        } catch (error) {
          this.dependencies.log(`moveToに失敗: ${String(error)}`)
        }
        // A stop invalidates the old request, but a newer generation may
        // already have queued its own target and must be preserved.
        if (pending.generation !== this.generation) continue
      }
    } finally {
      this.sendingMove = false
      if (this.pendingMove) {
        void this.drainMoves()
      } else {
        for (const resolve of this.movementSettledResolvers) resolve()
        this.movementSettledResolvers.clear()
      }
    }
  }

  private waitForMovementToSettle(): Promise<void> {
    if (!this.sendingMove) return Promise.resolve()
    return new Promise((resolve) => this.movementSettledResolvers.add(resolve))
  }
}
