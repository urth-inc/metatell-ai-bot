import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Vec3 } from './engine/types.js'
import { MOVEMENT_UPDATE_INTERVAL_MS, SmoothMovementController } from './movement.js'
import { MAX_SPEED_MPS } from './safety.js'

const flushMoves = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

function createHarness(initial: Vec3 = { x: 0, y: 0, z: 0 }): {
  controller: SmoothMovementController
  moves: Vec3[]
  looks: Vec3[]
  walking: boolean[]
} {
  let position = initial
  const moves: Vec3[] = []
  const looks: Vec3[] = []
  const walking: boolean[] = []
  const controller = new SmoothMovementController({
    autoStart: false,
    avatar: {
      getPosition: () => position,
      async moveTo(target) {
        moves.push(target)
        position = target
      },
      async lookAt(target) {
        looks.push(target)
      },
    },
    setWalking: (value) => walking.push(value),
    log: () => {},
  })
  return { controller, moves, looks, walking }
}

test('移動だけを100ms刻みにし、500msで補間可能な5ステップを送る', async () => {
  const { controller, moves, looks } = createHarness()
  controller.beginBehaviorTick()
  assert.equal(controller.moveTowards({ x: 10, y: 0, z: 0 }), 'moving')
  controller.endBehaviorTick()

  for (let index = 0; index < 5; index++) {
    controller.update()
    await flushMoves()
  }

  const maxStep = (MAX_SPEED_MPS * MOVEMENT_UPDATE_INTERVAL_MS) / 1_000
  assert.equal(moves.length, 5)
  assert.ok(moves.every((move, index) => move.x <= maxStep * (index + 1)))
  assert.equal(moves.at(-1)?.x, 1)
  assert.deepEqual(looks, [{ x: 10, y: 0, z: 0 }])
  controller.close()
})

test('同じ目標の更新ではlookAtを重複送信せず、目標変更時だけ向き直る', () => {
  const { controller, looks } = createHarness()

  controller.moveTowards({ x: 10, y: 0, z: 0 })
  controller.moveTowards({ x: 10.1, y: 0, z: 0 })
  controller.moveTowards({ x: 11, y: 0, z: 0 })

  assert.deepEqual(looks, [
    { x: 10, y: 0, z: 0 },
    { x: 11, y: 0, z: 0 },
  ])
  controller.close()
})

test('lookAtが一時的に失敗したら同じ目標への向き直りを再試行する', async () => {
  let lookAttempts = 0
  const controller = new SmoothMovementController({
    autoStart: false,
    avatar: {
      getPosition: () => ({ x: 0, y: 0, z: 0 }),
      async moveTo() {},
      async lookAt() {
        lookAttempts += 1
        if (lookAttempts === 1) throw new Error('temporary failure')
      },
    },
    setWalking: () => {},
    log: () => {},
  })

  controller.moveTowards({ x: 10, y: 0, z: 0 })
  await flushMoves()
  controller.moveTowards({ x: 10, y: 0, z: 0 })
  await flushMoves()

  assert.equal(lookAttempts, 2)
  controller.close()
})

test('移動先を切り替えたら未送信の古い方向へのステップを破棄する', async () => {
  let position: Vec3 = { x: 0, y: 0, z: 0 }
  let releaseFirstMove: (() => void) | undefined
  const moves: Vec3[] = []
  const controller = new SmoothMovementController({
    autoStart: false,
    avatar: {
      getPosition: () => position,
      moveTo(target) {
        moves.push(target)
        position = target
        if (moves.length > 1) return Promise.resolve()
        return new Promise<void>((resolve) => {
          releaseFirstMove = resolve
        })
      },
      async lookAt() {},
    },
    setWalking: () => {},
    log: () => {},
  })

  controller.moveTowards({ x: 10, y: 0, z: 0 })
  controller.update()
  controller.update()
  controller.moveTowards({ x: -10, y: 0, z: 0 })
  controller.update()
  releaseFirstMove?.()
  await flushMoves()

  assert.deepEqual(
    moves.map((move) => move.x),
    [0.2, 0],
  )
  controller.close()
})

test('そのBT tickで移動要求がなければ巡回を止め、古い目標へ進まない', async () => {
  const { controller, moves, walking } = createHarness()
  controller.beginBehaviorTick()
  controller.moveTowards({ x: 10, y: 0, z: 0 })
  controller.endBehaviorTick()
  controller.update()
  await flushMoves()
  assert.equal(moves.length, 1)

  controller.beginBehaviorTick()
  controller.endBehaviorTick()
  controller.update()
  await flushMoves()

  assert.equal(moves.length, 1)
  assert.equal(walking.at(-1), false)
  controller.close()
})

test('到着範囲へ入ると更新を止めてarrivedを返す', async () => {
  const { controller, moves, walking } = createHarness({ x: 0, y: 0, z: 0 })
  controller.moveTowards({ x: 1, y: 0, z: 0 })
  controller.update()
  await flushMoves()

  assert.equal(moves.at(-1)?.x, 0.2)
  assert.equal(controller.moveTowards({ x: 1, y: 0, z: 0 }), 'arrived')
  controller.update()
  await flushMoves()
  assert.equal(moves.length, 1)
  assert.equal(walking.at(-1), false)
  controller.close()
})
