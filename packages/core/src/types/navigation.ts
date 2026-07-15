import type { Vec3 } from './client.js'

export interface RoomSceneInfo {
  roomId: string
  sceneId?: string
  modelUrl: string
  identity: string
}

export interface RoomJoinInfo {
  sessionId: string | null
  scene: RoomSceneInfo | null
}

export interface ConnectOptions {
  mode?: 'enter' | 'join-only'
  initialPosition?: Vec3
  expectedSceneIdentity?: string
}

export interface RoomSceneChangedEvent {
  previousIdentity: string | null
  current: RoomSceneInfo | null
}

export interface NavigationSpawnPoint {
  id: string
  name?: string
  position: Vec3
  occupiable: boolean
  restricted: boolean
}

export interface NavigationSnapshot {
  schemaVersion: 1
  sceneIdentity: string
  sceneRevision: string
  zone: 'character'
  positions: Float32Array
  indices: Uint32Array
  spawnPoints: readonly NavigationSpawnPoint[]
  triangleCount: number
}

export interface NavigationValidator {
  resourceIdentity: string
  etag?: string
  lastModified?: string
}

export interface PreviousNavigation {
  sceneIdentity: string
  sceneRevision: string
  validator: NavigationValidator
}

export interface PrepareNavigationOptions {
  signal?: AbortSignal
  fetch?: typeof globalThis.fetch
  additionalAllowedOrigins?: readonly string[]
  previous?: PreviousNavigation
  maxBytes?: number
  maxDecodedBytes?: number
  maxTriangles?: number
  timeoutMs?: number
}

export type PrepareNavigationResult =
  | {
      status: 'prepared'
      snapshot: NavigationSnapshot
      validator: NavigationValidator
    }
  | {
      status: 'not-modified'
      validator: NavigationValidator
    }

export interface NavigationCursor {
  readonly position: Vec3
  readonly groupId: number
}

export interface NavigationStepResult {
  kind: 'moved' | 'clamped' | 'blocked'
  position: Vec3
  cursor: NavigationCursor
}

export interface NavigationRuntime {
  getSpawnPoints(): readonly NavigationSpawnPoint[]
  samplePoint(random: () => number, groupId?: number): NavigationCursor
  projectPoint(position: Vec3, maxProjectionDistance?: number): NavigationCursor | null
  findPath(from: NavigationCursor, target: NavigationCursor): readonly Vec3[] | null
  clampStep(from: NavigationCursor, desired: Vec3): NavigationStepResult
}
