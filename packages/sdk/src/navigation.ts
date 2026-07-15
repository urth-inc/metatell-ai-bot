import type {
  NavigationCursor,
  NavigationRuntime,
  NavigationSnapshot,
  NavigationSpawnPoint,
  NavigationStepResult,
  Vec3,
} from '@metatell/bot-core'
import { NavigationError } from '@metatell/bot-core'
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Triangle, Vector3 } from 'three'
import { Pathfinding } from 'three-pathfinding'

const EPSILON_SQUARED = 1e-10

type PathNode = ReturnType<Pathfinding['getClosestNode']>

interface TriangleSample {
  a: Vector3
  b: Vector3
  c: Vector3
  area: number
  groupId: number
}

interface CursorState {
  node: PathNode
}

function toVector3(value: Vec3): Vector3 {
  return new Vector3(value.x, value.y, value.z)
}

function toVec3(value: Vector3): Vec3 {
  return { x: value.x, y: value.y, z: value.z }
}

function normalizedRandom(random: () => number): number {
  const value = random()
  if (!Number.isFinite(value)) return 0
  return Math.min(1 - Number.EPSILON, Math.max(0, value))
}

function validateSnapshot(snapshot: NavigationSnapshot): void {
  if (
    snapshot.schemaVersion !== 1 ||
    snapshot.zone !== 'character' ||
    !(snapshot.positions instanceof Float32Array) ||
    !(snapshot.indices instanceof Uint32Array) ||
    snapshot.positions.length === 0 ||
    snapshot.positions.length % 3 !== 0 ||
    snapshot.indices.length === 0 ||
    snapshot.indices.length % 3 !== 0 ||
    snapshot.triangleCount !== snapshot.indices.length / 3
  ) {
    throw new NavigationError('NAV_MESH_INVALID', 'The navigation snapshot is invalid.', false)
  }
}

export function createNavigationRuntime(snapshot: NavigationSnapshot): NavigationRuntime {
  validateSnapshot(snapshot)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(snapshot.positions, 3))
  geometry.setIndex(new BufferAttribute(snapshot.indices, 1))

  const pathfinding = new Pathfinding()
  let zoneData: ReturnType<typeof Pathfinding.createZone>
  try {
    zoneData = Pathfinding.createZone(geometry)
    pathfinding.setZoneData(snapshot.zone, zoneData)
  } catch (error) {
    throw new NavigationError(
      'NAV_MESH_INVALID',
      'The navigation runtime could not build the nav mesh zone.',
      false,
      error,
    )
  } finally {
    geometry.dispose()
  }

  if (zoneData.groups.length === 0) {
    throw new NavigationError('NAV_MESH_INVALID', 'The nav mesh has no connected groups.', false)
  }

  const triangles: TriangleSample[] = []
  const trianglesByGroup = new Map<number, TriangleSample[]>()
  const triangle = new Triangle()
  for (let offset = 0; offset < snapshot.indices.length; offset += 3) {
    const aIndex = snapshot.indices[offset] * 3
    const bIndex = snapshot.indices[offset + 1] * 3
    const cIndex = snapshot.indices[offset + 2] * 3
    const a = new Vector3(
      snapshot.positions[aIndex],
      snapshot.positions[aIndex + 1],
      snapshot.positions[aIndex + 2],
    )
    const b = new Vector3(
      snapshot.positions[bIndex],
      snapshot.positions[bIndex + 1],
      snapshot.positions[bIndex + 2],
    )
    const c = new Vector3(
      snapshot.positions[cIndex],
      snapshot.positions[cIndex + 1],
      snapshot.positions[cIndex + 2],
    )
    triangle.set(a, b, c)
    const area = triangle.getArea()
    if (!Number.isFinite(area) || area <= 0) {
      throw new NavigationError(
        'NAV_MESH_INVALID',
        'The nav mesh contains a degenerate triangle.',
        false,
      )
    }
    const centroid = triangle.getMidpoint(new Vector3())
    const groupId = pathfinding.getGroup(snapshot.zone, centroid)
    if (!Number.isInteger(groupId) || groupId < 0 || groupId >= zoneData.groups.length) {
      throw new NavigationError(
        'NAV_MESH_INVALID',
        'A nav mesh triangle has no connected group.',
        false,
      )
    }
    const sample = { a, b, c, area, groupId }
    triangles.push(sample)
    const group = trianglesByGroup.get(groupId) ?? []
    group.push(sample)
    trianglesByGroup.set(groupId, group)
  }

  const cursorStates = new WeakMap<NavigationCursor, CursorState>()
  const makeCursor = (position: Vector3, groupId: number, node?: PathNode): NavigationCursor => {
    const resolvedNode =
      node ??
      pathfinding.getClosestNode(position, snapshot.zone, groupId, true) ??
      pathfinding.getClosestNode(position, snapshot.zone, groupId, false)
    if (!resolvedNode) {
      throw new NavigationError(
        'NAV_MESH_INVALID',
        'A navigation cursor could not be placed.',
        false,
      )
    }
    const cursor = Object.freeze({
      position: Object.freeze(toVec3(position)),
      groupId,
    })
    cursorStates.set(cursor, { node: resolvedNode })
    return cursor
  }
  const cursorState = (cursor: NavigationCursor): CursorState => {
    const state = cursorStates.get(cursor)
    if (!state) {
      throw new NavigationError(
        'NAV_MESH_INVALID',
        'The navigation cursor belongs to a different runtime.',
        false,
      )
    }
    return state
  }

  const samplePoint = (random: () => number, groupId?: number): NavigationCursor => {
    if (groupId !== undefined && !trianglesByGroup.has(groupId)) {
      throw new NavigationError(
        'NAV_MESH_INVALID',
        'The requested nav mesh group does not exist.',
        false,
      )
    }
    const candidates = groupId === undefined ? triangles : (trianglesByGroup.get(groupId) ?? [])
    const totalArea = candidates.reduce((sum, candidate) => sum + candidate.area, 0)
    let threshold = normalizedRandom(random) * totalArea
    let selected = candidates[candidates.length - 1]
    for (const candidate of candidates) {
      threshold -= candidate.area
      if (threshold <= 0) {
        selected = candidate
        break
      }
    }

    const root = Math.sqrt(normalizedRandom(random))
    const second = normalizedRandom(random)
    const point = new Vector3()
      .addScaledVector(selected.a, 1 - root)
      .addScaledVector(selected.b, root * (1 - second))
      .addScaledVector(selected.c, root * second)
    return makeCursor(point, selected.groupId)
  }

  const projectPoint = (
    position: Vec3,
    maxProjectionDistance = Number.POSITIVE_INFINITY,
  ): NavigationCursor | null => {
    if (
      !Number.isFinite(maxProjectionDistance) &&
      maxProjectionDistance !== Number.POSITIVE_INFINITY
    ) {
      return null
    }
    if (maxProjectionDistance < 0) return null
    const source = toVector3(position)
    if (![source.x, source.y, source.z].every(Number.isFinite)) return null

    let closest: Vector3 | null = null
    let closestGroup = -1
    let closestDistance = maxProjectionDistance * maxProjectionDistance
    const candidate = new Vector3()
    for (const sample of triangles) {
      triangle.set(sample.a, sample.b, sample.c).closestPointToPoint(source, candidate)
      const distance = candidate.distanceToSquared(source)
      if (distance <= closestDistance) {
        closestDistance = distance
        closest = candidate.clone()
        closestGroup = sample.groupId
      }
    }
    return closest ? makeCursor(closest, closestGroup) : null
  }

  const runtime: NavigationRuntime = {
    getSpawnPoints: (): readonly NavigationSpawnPoint[] =>
      snapshot.spawnPoints.map((spawn) =>
        Object.freeze({ ...spawn, position: Object.freeze({ ...spawn.position }) }),
      ),

    samplePoint,
    projectPoint,

    findPath: (from, target): readonly Vec3[] | null => {
      cursorState(from)
      cursorState(target)
      if (from.groupId !== target.groupId) return null
      const path = pathfinding.findPath(
        toVector3(from.position),
        toVector3(target.position),
        snapshot.zone,
        from.groupId,
      )
      return path ? path.map(toVec3) : null
    },

    clampStep: (from, desired): NavigationStepResult => {
      const state = cursorState(from)
      const start = toVector3(from.position)
      const requested = toVector3(desired)
      if (![requested.x, requested.y, requested.z].every(Number.isFinite)) {
        return { kind: 'blocked', position: { ...from.position }, cursor: from }
      }
      const result = new Vector3()
      const node = pathfinding.clampStep(
        start,
        requested,
        state.node,
        snapshot.zone,
        from.groupId,
        result,
      )
      if (!node || result.distanceToSquared(start) <= EPSILON_SQUARED) {
        return { kind: 'blocked', position: { ...from.position }, cursor: from }
      }
      const cursor = makeCursor(result, from.groupId, node)
      const kind = result.distanceToSquared(requested) <= EPSILON_SQUARED ? 'moved' : 'clamped'
      return { kind, position: { ...cursor.position }, cursor }
    },
  }

  return Object.freeze(runtime)
}

export type {
  NavigationCursor,
  NavigationRuntime,
  NavigationSnapshot,
  NavigationSpawnPoint,
  NavigationStepResult,
} from '@metatell/bot-core'
