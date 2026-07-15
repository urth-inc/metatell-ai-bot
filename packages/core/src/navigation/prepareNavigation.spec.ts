import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { NavigationError } from '../errors.js'
import type { RoomSceneInfo } from '../types/navigation.js'
import { prepareNavigation } from './prepareNavigation.js'

function pad4(value: number): number {
  return (value + 3) & ~3
}

function buildSceneGlb(options: { navMesh?: boolean; secondNavMesh?: boolean } = {}): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 2, 0, 0, 2, 1, 2, 0, 1, 2])
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3])
  const binaryLength = pad4(positions.byteLength + indices.byteLength)
  const binary = new Uint8Array(binaryLength)
  binary.set(new Uint8Array(positions.buffer), 0)
  binary.set(new Uint8Array(indices.buffer), positions.byteLength)

  const navExtension = options.navMesh === false ? {} : { 'nav-mesh': { zone: 'character' } }
  const nodes: Array<Record<string, unknown>> = [
    {
      name: 'Walkable',
      mesh: 0,
      extensions: { MOZ_hubs_components: navExtension },
    },
    {
      name: 'Spawn Modern',
      translation: [1, 2, 3],
      extensions: { MOZ_hubs_components: { 'spawn-point': {} } },
    },
    {
      name: 'Spawn Parent',
      translation: [5, 1, 2],
      children: [1],
    },
    {
      name: 'Spawn HUBS',
      translation: [0.5, 0, 0.5],
      extensions: {
        HUBS_components: {
          waypoint: { canBeSpawnPoint: true, canBeOccupied: true, isRestricted: false },
        },
      },
    },
    {
      name: 'Spawn Legacy',
      translation: [1, 0, 1],
      extras: {
        gltfExtensions: {
          MOZ_hubs_components: {
            waypoint: { canBeSpawnPoint: true, canBeOccupied: false, isRestricted: true },
          },
        },
      },
    },
  ]
  const sceneNodes = [0, 2, 3, 4]
  if (options.secondNavMesh) {
    nodes.push({
      name: 'Second Nav Mesh',
      mesh: 0,
      extensions: { MOZ_hubs_components: { 'nav-mesh': {} } },
    })
    sceneNodes.push(nodes.length - 1)
  }

  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: sceneNodes }],
    nodes,
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            mode: 4,
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 4,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [2, 1, 2],
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: 6,
        type: 'SCALAR',
        min: [0],
        max: [3],
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
    ],
    buffers: [{ byteLength: binaryLength }],
    extensionsUsed: ['MOZ_hubs_components', 'HUBS_components'],
  }
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonLength = pad4(jsonBytes.byteLength)
  const totalLength = 12 + 8 + jsonLength + 8 + binaryLength
  const glb = new Uint8Array(totalLength)
  const view = new DataView(glb.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, totalLength, true)
  view.setUint32(12, jsonLength, true)
  view.setUint32(16, 0x4e4f534a, true)
  glb.fill(0x20, 20, 20 + jsonLength)
  glb.set(jsonBytes, 20)
  const binaryHeader = 20 + jsonLength
  view.setUint32(binaryHeader, binaryLength, true)
  view.setUint32(binaryHeader + 4, 0x004e4942, true)
  glb.set(binary, binaryHeader + 8)
  return glb
}

const scene: RoomSceneInfo = {
  roomId: 'room-1',
  sceneId: 'scene-1',
  modelUrl: 'https://cdn.metatell-dev.app/scene.glb?signature=secret',
  identity: 'scene-1',
}

function sceneResponse(bytes: Uint8Array, headers: Record<string, string> = {}): Response {
  return new Response(bytes, { status: 200, headers })
}

describe('prepareNavigation', () => {
  it('extracts world-space navmesh geometry and all supported spawn point encodings', async () => {
    const result = await prepareNavigation(scene, 'wss://metatell-dev.app', {
      fetch: vi.fn(async () => sceneResponse(buildSceneGlb(), { etag: '"v1"' })),
    })

    expect(result.status).toBe('prepared')
    if (result.status !== 'prepared') return
    expect(result.snapshot.triangleCount).toBe(2)
    expect(Array.from(result.snapshot.positions)).toEqual([0, 0, 0, 2, 0, 0, 2, 1, 2, 0, 1, 2])
    expect(result.snapshot.spawnPoints).toEqual([
      {
        id: 'node-1',
        name: 'Spawn Modern',
        position: { x: 6, y: 3, z: 5 },
        occupiable: false,
        restricted: false,
      },
      {
        id: 'node-3',
        name: 'Spawn HUBS',
        position: { x: 0.5, y: 0, z: 0.5 },
        occupiable: true,
        restricted: false,
      },
      {
        id: 'node-4',
        name: 'Spawn Legacy',
        position: { x: 1, y: 0, z: 1 },
        occupiable: false,
        restricted: true,
      },
    ])
    expect(result.validator.etag).toBe('"v1"')
    expect(result.snapshot.sceneRevision).toMatch(/^[a-f0-9]{64}$/)
  })

  it('uses validators only for the same resource and accepts 304 responses', async () => {
    const resourceIdentity = createHash('sha256').update(scene.modelUrl).digest('hex')
    const fetchMock = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('if-none-match')).toBe('"v1"')
      return new Response(null, { status: 304 })
    })

    const result = await prepareNavigation(scene, 'wss://metatell-dev.app', {
      fetch: fetchMock,
      previous: {
        sceneIdentity: scene.identity,
        sceneRevision: 'revision-1',
        validator: { resourceIdentity, etag: '"v1"' },
      },
    })

    expect(result.status).toBe('not-modified')
  })

  it('returns not-modified for a 200 response with the same byte revision', async () => {
    const bytes = buildSceneGlb()
    const revision = createHash('sha256').update(bytes).digest('hex')
    const result = await prepareNavigation(scene, 'wss://metatell-dev.app', {
      fetch: vi.fn(async () => sceneResponse(bytes)),
      previous: {
        sceneIdentity: scene.identity,
        sceneRevision: revision,
        validator: { resourceIdentity: 'different-resource' },
      },
    })

    expect(result.status).toBe('not-modified')
  })

  it('allows an exact custom HTTPS origin without replacing the default allowlist', async () => {
    const customScene = { ...scene, modelUrl: 'https://assets.customer.example/scene.glb' }
    const fetchMock = vi.fn(async () => sceneResponse(buildSceneGlb()))
    await expect(
      prepareNavigation(customScene, 'wss://metatell-dev.app', { fetch: fetchMock }),
    ).rejects.toMatchObject({ code: 'SCENE_FETCH_FAILED', retryable: false })

    await expect(
      prepareNavigation(customScene, 'wss://metatell-dev.app', {
        fetch: fetchMock,
        additionalAllowedOrigins: ['https://assets.customer.example'],
      }),
    ).resolves.toMatchObject({ status: 'prepared' })
    await expect(
      prepareNavigation(customScene, 'wss://metatell-dev.app', {
        fetch: fetchMock,
        additionalAllowedOrigins: ['https://*.customer.example'],
      }),
    ).rejects.toBeInstanceOf(NavigationError)
  })

  it('does not fall back when navmesh data is absent or unsupported', async () => {
    await expect(
      prepareNavigation(scene, 'wss://metatell-dev.app', {
        fetch: vi.fn(async () => sceneResponse(buildSceneGlb({ navMesh: false }))),
      }),
    ).rejects.toMatchObject({ code: 'NAV_MESH_NOT_FOUND' })

    await expect(
      prepareNavigation(scene, 'wss://metatell-dev.app', {
        fetch: vi.fn(async () => sceneResponse(buildSceneGlb({ secondNavMesh: true }))),
      }),
    ).rejects.toMatchObject({ code: 'NAV_MESH_UNSUPPORTED' })
  })

  it('preserves caller cancellation as a standard AbortError', async () => {
    const controller = new AbortController()
    controller.abort('stop')

    await expect(
      prepareNavigation(scene, 'wss://metatell-dev.app', {
        signal: controller.signal,
        fetch: vi.fn(async (_url, init) => {
          if (init?.signal?.aborted) throw init.signal.reason
          await new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
              once: true,
            })
          })
          return sceneResponse(buildSceneGlb())
        }),
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('validates every redirect against the exact-origin allowlist', async () => {
    await expect(
      prepareNavigation(scene, 'wss://metatell-dev.app', {
        fetch: vi.fn(
          async () =>
            new Response(null, {
              status: 302,
              headers: { location: 'https://untrusted.example/scene.glb' },
            }),
        ),
      }),
    ).rejects.toMatchObject({ code: 'SCENE_FETCH_FAILED', retryable: false })
  })

  it('enforces encoded and decoded navigation limits', async () => {
    await expect(
      prepareNavigation(scene, 'wss://metatell-dev.app', {
        maxBytes: 16,
        fetch: vi.fn(async () => sceneResponse(buildSceneGlb())),
      }),
    ).rejects.toMatchObject({ code: 'SCENE_TOO_LARGE', retryable: false })

    await expect(
      prepareNavigation(scene, 'wss://metatell-dev.app', {
        maxTriangles: 1,
        fetch: vi.fn(async () => sceneResponse(buildSceneGlb())),
      }),
    ).rejects.toMatchObject({ code: 'NAV_MESH_TOO_LARGE', retryable: false })
  })
})
