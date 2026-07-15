import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { normalizeRoomSceneInfo } from './roomSceneInfo.js'

describe('normalizeRoomSceneInfo', () => {
  it('uses scene_id as the stable identity and keeps the full model URL', () => {
    const result = normalizeRoomSceneInfo(
      {
        session_id: 'session-1',
        hubs: [
          {
            hub_id: 'room-1',
            scene: { scene_id: 'scene-1', model_url: '/scene.glb?revision=2' },
          },
        ],
      },
      'wss://metatell.app',
      'fallback',
    )

    expect(result).toEqual({
      sessionId: 'session-1',
      scene: {
        roomId: 'room-1',
        sceneId: 'scene-1',
        modelUrl: 'https://metatell.app/scene.glb?revision=2',
        identity: 'scene-1',
      },
    })
  })

  it('derives identity from origin and pathname without query parameters', () => {
    const result = normalizeRoomSceneInfo(
      { hubs: [{ scene: { model_url: 'https://cdn.metatell.app/a.glb?token=secret' } }] },
      'wss://metatell.app',
      'room-1',
    )
    const expected = createHash('sha256').update('https://cdn.metatell.app/a.glb').digest('hex')

    expect(result.scene?.identity).toBe(expected)
    expect(result.scene?.modelUrl).toContain('?token=secret')
  })

  it('returns a typed null scene when the join response has no model URL', () => {
    expect(normalizeRoomSceneInfo({ session_id: 's' }, 'wss://metatell.app', 'room')).toEqual({
      sessionId: 's',
      scene: null,
    })
  })
})
