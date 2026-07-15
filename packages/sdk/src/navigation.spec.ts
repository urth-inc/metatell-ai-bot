import type { NavigationSnapshot } from '@metatell/bot-core'
import { describe, expect, it } from 'vitest'
import { createNavigationRuntime } from './navigation.js'

function snapshot(): NavigationSnapshot {
  return {
    schemaVersion: 1,
    sceneIdentity: 'scene-1',
    sceneRevision: 'revision-1',
    zone: 'character',
    positions: new Float32Array([
      // Sloped connected surface.
      0, 0, 0, 2, 0, 0, 2, 1, 2, 0, 1, 2,
      // Disconnected upper floor.
      10, 3, 0, 12, 3, 0, 12, 3, 2, 10, 3, 2,
    ]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]),
    spawnPoints: [
      {
        id: 'spawn-1',
        position: { x: 1, y: 0.5, z: 1 },
        occupiable: false,
        restricted: false,
      },
    ],
    triangleCount: 4,
  }
}

describe('createNavigationRuntime', () => {
  it('survives structured cloning and keeps projection Y on the navmesh surface', () => {
    const runtime = createNavigationRuntime(structuredClone(snapshot()))
    const projected = runtime.projectPoint({ x: 1, y: 2, z: 1 })

    expect(projected).not.toBeNull()
    expect(projected?.position.x).toBeCloseTo(1)
    expect(projected?.position.y).toBeCloseTo((projected?.position.z ?? 0) / 2)
    expect(runtime.getSpawnPoints()).toEqual(snapshot().spawnPoints)
  })

  it('samples by group and never creates a path across disconnected islands', () => {
    const runtime = createNavigationRuntime(snapshot())
    const first = runtime.projectPoint({ x: 0.5, y: 0.25, z: 0.5 })
    const upper = runtime.projectPoint({ x: 10.5, y: 3, z: 0.5 })
    expect(first).not.toBeNull()
    expect(upper).not.toBeNull()
    if (!first || !upper) return

    const sampled = runtime.samplePoint(() => 0.5, first.groupId)
    expect(sampled.groupId).toBe(first.groupId)
    expect(sampled.position.x).toBeLessThanOrEqual(2)
    expect(runtime.findPath(first, upper)).toBeNull()
  })

  it('finds paths and clamps steps without leaving the current group', () => {
    const runtime = createNavigationRuntime(snapshot())
    const from = runtime.projectPoint({ x: 0.5, y: 0.25, z: 0.5 })
    const target = runtime.projectPoint({ x: 1.5, y: 0.75, z: 1.5 })
    expect(from).not.toBeNull()
    expect(target).not.toBeNull()
    if (!from || !target) return

    expect(runtime.findPath(from, target)?.at(-1)).toEqual(target.position)
    const result = runtime.clampStep(from, { x: -5, y: 0, z: 0.5 })
    expect(result.kind).toBe('clamped')
    expect(result.position.x).toBeGreaterThanOrEqual(0)
    expect(result.cursor.groupId).toBe(from.groupId)
  })
})
