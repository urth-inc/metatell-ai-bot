import { createHash } from 'node:crypto'
import type { RoomJoinInfo, RoomSceneInfo } from '../types/navigation.js'

interface HubJoinResponse {
  session_id?: unknown
  sessionId?: unknown
  id?: unknown
  hubs?: unknown
}

interface HubRecord {
  hub_id?: unknown
  scene?: unknown
}

interface SceneRecord {
  scene_id?: unknown
  model_url?: unknown
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeModelUrl(modelUrl: string, serverUrl: string): URL | null {
  try {
    const base = new URL(serverUrl)
    if (base.protocol === 'ws:') base.protocol = 'http:'
    if (base.protocol === 'wss:') base.protocol = 'https:'
    return new URL(modelUrl, base)
  } catch {
    return null
  }
}

export function normalizeRoomSceneInfo(
  response: unknown,
  serverUrl: string,
  fallbackRoomId: string,
): RoomJoinInfo {
  const join = (response ?? {}) as HubJoinResponse
  const sessionIdValue = join.session_id ?? join.sessionId ?? join.id
  const sessionId = typeof sessionIdValue === 'string' ? sessionIdValue : null
  const hubs = Array.isArray(join.hubs) ? (join.hubs as HubRecord[]) : []
  const hub = hubs[0]
  const scene = hub?.scene as SceneRecord | null | undefined
  const modelUrlValue = scene?.model_url

  if (typeof modelUrlValue !== 'string' || modelUrlValue.length === 0) {
    return { sessionId, scene: null }
  }

  const modelUrl = normalizeModelUrl(modelUrlValue, serverUrl)
  if (!modelUrl) return { sessionId, scene: null }

  const sceneId = typeof scene?.scene_id === 'string' && scene.scene_id ? scene.scene_id : undefined
  const roomId = typeof hub?.hub_id === 'string' && hub.hub_id ? hub.hub_id : fallbackRoomId
  const identity = sceneId ?? sha256(`${modelUrl.origin}${modelUrl.pathname}`)
  const info: RoomSceneInfo = {
    roomId,
    sceneId,
    modelUrl: modelUrl.toString(),
    identity,
  }

  return { sessionId, scene: info }
}
