import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { NavigationError } from '../errors.js'
import type { RoomSceneInfo } from '../types/navigation.js'
import { prepareNavigation } from './prepareNavigation.js'
import { SceneAccessCookieStore } from './signedCookie.js'

function pad4(value: number): number {
  return (value + 3) & ~3
}

interface MutableSceneGlb {
  scene?: number
  scenes: Array<{ nodes: number[] }>
  nodes: Array<Record<string, unknown>>
  meshes: Array<{ primitives: Array<Record<string, unknown>> }>
  accessors: Array<Record<string, unknown>>
}

interface BuildSceneGlbOptions {
  navMesh?: boolean
  secondNavMesh?: boolean
  configure?: (json: MutableSceneGlb) => void
}

function buildSceneGlb(options: BuildSceneGlbOptions = {}): Uint8Array {
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
  options.configure?.(json)
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

function translatedPositions(x: number): number[] {
  return [x, 0, 0, x + 2, 0, 0, x + 2, 1, 2, x, 1, 2]
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

function signedCookieResponse(values: readonly string[], status = 200): Response {
  const headers = new Headers()
  for (const value of values) headers.append('set-cookie', value)
  return new Response('{}', { status, headers })
}

function cloudFrontPolicy(resource: string, expiresAt = Math.floor(Date.now() / 1_000) + 3_600) {
  return Buffer.from(
    JSON.stringify({
      Statement: [
        {
          Resource: resource,
          Condition: { DateLessThan: { 'AWS:EpochTime': expiresAt } },
        },
      ],
    }),
  )
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('=', '_')
    .replaceAll('/', '~')
}

function cloudFrontCookies(path: string, suffix: string): string[] {
  const resourcePath = path.endsWith('/') ? path : `${path}/`
  return [
    `CloudFront-Policy=${cloudFrontPolicy(`https://cdn.metatell-dev.app${resourcePath}*`)}; Domain=.metatell-dev.app; Path=${path}; Secure; HttpOnly`,
    `CloudFront-Signature=signature-${suffix}; Domain=.metatell-dev.app; Path=${path}; Secure; HttpOnly`,
    `CloudFront-Key-Pair-Id=key-${suffix}; Domain=.metatell-dev.app; Path=${path}; Secure; HttpOnly`,
  ]
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

  it('obtains path-scoped CloudFront cookies before fetching a protected CDN scene', async () => {
    const scenePath = '/organizations/urth/scenes/scene-1/'
    const protectedScene = {
      ...scene,
      modelUrl: `https://cdn.metatell-dev.app${scenePath}scene.glb`,
    }
    const cookieFetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input.toString())
      const headers = new Headers(init?.headers)
      expect(url.toString()).toBe('https://metatell-dev.app/api/v3/rooms/room-1/signed-cookie')
      expect(init?.method).toBe('POST')
      expect(init?.credentials).toBeUndefined()
      expect(init?.redirect).toBe('manual')
      expect(headers.get('authorization')).toBe('Bearer access-token')
      expect(headers.has('cookie')).toBe(false)
      return signedCookieResponse([
        ...cloudFrontCookies('/organizations/urth/avatars/', 'avatar'),
        ...cloudFrontCookies(scenePath, 'scene'),
        ...cloudFrontCookies('/scoped-tmp/organizations/urth/rooms/room-1', 'tmp'),
      ])
    })
    const assetFetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      expect(input.toString()).toBe(protectedScene.modelUrl)
      const headers = new Headers(init?.headers)
      expect(init?.method).toBe('GET')
      expect(headers.has('authorization')).toBe(false)
      expect(headers.get('cookie')).toContain('CloudFront-Policy=')
      expect(headers.get('cookie')).toContain('CloudFront-Signature=signature-scene')
      expect(headers.get('cookie')).toContain('CloudFront-Key-Pair-Id=key-scene')
      return sceneResponse(buildSceneGlb())
    })
    const sceneAccessCookies = new SceneAccessCookieStore({
      authToken: 'access-token',
      fetch: cookieFetch,
    })

    await expect(
      prepareNavigation(
        protectedScene,
        'wss://metatell-dev.app',
        { fetch: assetFetch },
        { sceneAccessCookies },
      ),
    ).resolves.toMatchObject({ status: 'prepared' })
    expect(cookieFetch).toHaveBeenCalledOnce()
    expect(assetFetch).toHaveBeenCalledOnce()
  })

  it('does not send CloudFront cookies to a storage redirect on the same parent domain', async () => {
    const scenePath = '/organizations/urth/scenes/scene-1/'
    const protectedScene = {
      ...scene,
      modelUrl: `https://cdn.metatell-dev.app${scenePath}scene.glb`,
    }
    let assetRequests = 0
    const cookieFetch = vi.fn(async () =>
      signedCookieResponse(cloudFrontCookies(scenePath, 'scene')),
    )
    const assetFetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input.toString())
      assetRequests += 1
      const cookie = new Headers(init?.headers).get('cookie')
      if (assetRequests === 1) {
        expect(cookie).toContain('CloudFront-Policy=')
        expect(cookie).toContain('CloudFront-Signature=signature-scene')
        return new Response(null, {
          status: 302,
          headers: {
            location: `https://storage.metatell-dev.app${scenePath}scene.glb`,
          },
        })
      }
      expect(url.origin).toBe('https://storage.metatell-dev.app')
      expect(cookie).toBeNull()
      return sceneResponse(buildSceneGlb())
    })

    await expect(
      prepareNavigation(
        protectedScene,
        'wss://metatell-dev.app',
        { fetch: assetFetch },
        { sceneAccessCookies: new SceneAccessCookieStore({ fetch: cookieFetch }) },
      ),
    ).resolves.toMatchObject({ status: 'prepared' })
  })

  it('obtains cookies after an allowed redirect reaches the protected CDN', async () => {
    const scenePath = '/organizations/urth/scenes/scene-1/'
    const redirectedScene = {
      ...scene,
      modelUrl: 'https://metatell-dev.app/scene.glb',
    }
    const cookieFetch = vi.fn(async () =>
      signedCookieResponse(cloudFrontCookies(scenePath, 'scene')),
    )
    let assetRequests = 0
    const assetFetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      assetRequests += 1
      const url = new URL(input instanceof Request ? input.url : input.toString())
      const cookie = new Headers(init?.headers).get('cookie')
      if (assetRequests === 1) {
        expect(url.origin).toBe('https://metatell-dev.app')
        expect(cookie).toBeNull()
        return new Response(null, {
          status: 302,
          headers: { location: `https://cdn.metatell-dev.app${scenePath}scene.glb` },
        })
      }
      expect(url.origin).toBe('https://cdn.metatell-dev.app')
      expect(cookie).toContain('CloudFront-Signature=signature-scene')
      return sceneResponse(buildSceneGlb())
    })

    await expect(
      prepareNavigation(
        redirectedScene,
        'wss://metatell-dev.app',
        { fetch: assetFetch },
        { sceneAccessCookies: new SceneAccessCookieStore({ fetch: cookieFetch }) },
      ),
    ).resolves.toMatchObject({ status: 'prepared' })
    expect(cookieFetch).toHaveBeenCalledOnce()
    expect(assetFetch).toHaveBeenCalledTimes(2)
  })

  it('continues without cookies when the signed-cookie sync fails', async () => {
    const cookieFetch = vi.fn(async () => new Response('{}', { status: 403 }))
    const assetFetch = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
      expect(new Headers(init?.headers).has('cookie')).toBe(false)
      return sceneResponse(buildSceneGlb())
    })

    await expect(
      prepareNavigation(
        scene,
        'wss://metatell-dev.app',
        { fetch: assetFetch },
        { sceneAccessCookies: new SceneAccessCookieStore({ fetch: cookieFetch }) },
      ),
    ).resolves.toMatchObject({ status: 'prepared' })
    expect(cookieFetch).toHaveBeenCalledOnce()
    expect(assetFetch).toHaveBeenCalledOnce()
  })

  it('reports the asset response when cookie sync and the protected request both fail', async () => {
    const cookieFetch = vi.fn(async () => new Response('{}', { status: 500 }))
    const assetFetch = vi.fn(async () => new Response('{}', { status: 403 }))

    await expect(
      prepareNavigation(
        scene,
        'wss://metatell-dev.app',
        { fetch: assetFetch },
        { sceneAccessCookies: new SceneAccessCookieStore({ fetch: cookieFetch }) },
      ),
    ).rejects.toMatchObject({
      code: 'SCENE_FETCH_FAILED',
      retryable: false,
      message: 'The scene asset request failed with HTTP 403.',
    })
    expect(cookieFetch).toHaveBeenCalledOnce()
    expect(assetFetch).toHaveBeenCalledOnce()
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

  it('reports when the default scene has no nav mesh', async () => {
    await expect(
      prepareNavigation(scene, 'wss://metatell-dev.app', {
        fetch: vi.fn(async () => sceneResponse(buildSceneGlb({ navMesh: false }))),
      }),
    ).rejects.toMatchObject({ code: 'NAV_MESH_NOT_FOUND' })
  })

  it('selects the first nav mesh marker in default-scene preorder', async () => {
    const result = await prepareNavigation(scene, 'wss://metatell-dev.app', {
      fetch: vi.fn(async () =>
        sceneResponse(
          buildSceneGlb({
            secondNavMesh: true,
            configure: (json) => {
              const firstMarkerIndex = json.nodes.length - 1
              json.nodes[firstMarkerIndex].translation = [10, 0, 0]
              const firstBranchIndex =
                json.nodes.push({
                  name: 'First Branch',
                  translation: [1, 0, 0],
                  children: [firstMarkerIndex],
                }) - 1
              json.scenes[0].nodes = [firstBranchIndex, 0, 2, 3, 4]
            },
          }),
        ),
      ),
    })

    expect(result.status).toBe('prepared')
    if (result.status !== 'prepared') return
    expect(Array.from(result.snapshot.positions)).toEqual(translatedPositions(11))
  })

  it('uses the first mesh in the selected marker subtree', async () => {
    const result = await prepareNavigation(scene, 'wss://metatell-dev.app', {
      fetch: vi.fn(async () =>
        sceneResponse(
          buildSceneGlb({
            configure: (json) => {
              delete json.nodes[0].mesh
              json.nodes[0].translation = [2, 0, 0]
              const laterMeshIndex =
                json.nodes.push({ name: 'Later Mesh', mesh: 0, translation: [20, 0, 0] }) - 1
              const firstMeshIndex =
                json.nodes.push({ name: 'First Mesh', mesh: 0, translation: [10, 0, 0] }) - 1
              const groupIndex =
                json.nodes.push({
                  name: 'Mesh Group',
                  translation: [1, 0, 0],
                  children: [firstMeshIndex, laterMeshIndex],
                }) - 1
              json.nodes[0].children = [groupIndex]
            },
          }),
        ),
      ),
    })

    expect(result.status).toBe('prepared')
    if (result.status !== 'prepared') return
    expect(Array.from(result.snapshot.positions)).toEqual(translatedPositions(13))
  })

  it('does not fall back to a later marker when the first marker has no mesh', async () => {
    await expect(
      prepareNavigation(scene, 'wss://metatell-dev.app', {
        fetch: vi.fn(async () =>
          sceneResponse(
            buildSceneGlb({
              secondNavMesh: true,
              configure: (json) => {
                delete json.nodes[0].mesh
              },
            }),
          ),
        ),
      }),
    ).rejects.toMatchObject({ code: 'NAV_MESH_INVALID' })
  })

  it('ignores nav mesh markers outside the default scene', async () => {
    const result = await prepareNavigation(scene, 'wss://metatell-dev.app', {
      fetch: vi.fn(async () =>
        sceneResponse(
          buildSceneGlb({
            configure: (json) => {
              delete json.nodes[0].mesh
              const defaultMarkerIndex =
                json.nodes.push({
                  name: 'Default Scene Nav Mesh',
                  mesh: 0,
                  translation: [30, 0, 0],
                  extensions: { MOZ_hubs_components: { 'nav-mesh': {} } },
                }) - 1
              json.scenes.push({ nodes: [defaultMarkerIndex] })
              json.scene = 1
            },
          }),
        ),
      ),
    })

    expect(result.status).toBe('prepared')
    if (result.status !== 'prepared') return
    expect(Array.from(result.snapshot.positions)).toEqual(translatedPositions(30))
    expect(result.snapshot.spawnPoints).toEqual([])
  })

  it('skips non-mesh primitives and uses only the first mesh primitive', async () => {
    const result = await prepareNavigation(scene, 'wss://metatell-dev.app', {
      fetch: vi.fn(async () =>
        sceneResponse(
          buildSceneGlb({
            configure: (json) => {
              json.meshes[0].primitives.unshift({
                attributes: { POSITION: 0 },
                indices: 1,
                mode: 1,
              })
              const laterIndexAccessor =
                json.accessors.push({
                  bufferView: 1,
                  componentType: 5123,
                  count: 3,
                  type: 'SCALAR',
                  min: [0],
                  max: [2],
                }) - 1
              json.meshes[0].primitives.push({
                attributes: { POSITION: 0 },
                indices: laterIndexAccessor,
                mode: 4,
              })
            },
          }),
        ),
      ),
    })

    expect(result.status).toBe('prepared')
    if (result.status !== 'prepared') return
    expect(result.snapshot.triangleCount).toBe(2)
    expect(Array.from(result.snapshot.positions)).toEqual(translatedPositions(0))
  })

  it('does not skip the first nav mesh marker based on its zone', async () => {
    await expect(
      prepareNavigation(scene, 'wss://metatell-dev.app', {
        fetch: vi.fn(async () =>
          sceneResponse(
            buildSceneGlb({
              secondNavMesh: true,
              configure: (json) => {
                json.nodes[0].extensions = {
                  MOZ_hubs_components: { 'nav-mesh': { zone: 'secondary' } },
                }
              },
            }),
          ),
        ),
      }),
    ).rejects.toMatchObject({ code: 'NAV_MESH_NOT_FOUND' })
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
