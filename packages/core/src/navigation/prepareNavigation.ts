import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import {
  type Document,
  type JSONDocument,
  Logger,
  NodeIO,
  Primitive,
  type Node as TransformNode,
  Verbosity,
} from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco from 'draco3dgltf'
import { MeshoptDecoder } from 'meshoptimizer'
import { NavigationError } from '../errors.js'
import type {
  NavigationSnapshot,
  NavigationSpawnPoint,
  NavigationValidator,
  PrepareNavigationOptions,
  PrepareNavigationResult,
  RoomSceneInfo,
} from '../types/navigation.js'

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024
const DEFAULT_MAX_DECODED_BYTES = 256 * 1024 * 1024
const DEFAULT_MAX_TRIANGLES = 500_000
const DEFAULT_TIMEOUT_MS = 30_000
const MAX_REDIRECTS = 5
const GLB_MAGIC = 0x46546c67
const SUPPORTED_GEOMETRY_EXTENSIONS = new Set([
  'EXT_meshopt_compression',
  'KHR_draco_mesh_compression',
  'KHR_mesh_quantization',
])

interface RawNode {
  name?: unknown
  mesh?: unknown
  extras?: Record<string, unknown>
  extensions?: Record<string, unknown>
}

interface RawPrimitive {
  attributes?: Record<string, unknown>
  indices?: unknown
  mode?: unknown
  extensions?: Record<string, unknown>
}

interface RawMesh {
  primitives?: RawPrimitive[]
}

interface RawAccessor {
  count?: unknown
  componentType?: unknown
  type?: unknown
}

interface RawBuffer {
  uri?: unknown
}

interface RawGltf {
  nodes?: RawNode[]
  meshes?: RawMesh[]
  accessors?: RawAccessor[]
  buffers?: RawBuffer[]
  extensionsRequired?: unknown
  extensionsUsed?: unknown
}

interface ComponentMarker {
  nodeIndex: number
  name?: string
  components: Record<string, unknown>
}

interface NavigationLimits {
  maxDecodedBytes: number
  maxTriangles: number
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex')
}

function positiveLimit(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new NavigationError('NAV_MESH_INVALID', `${name} must be a positive integer.`, false)
  }
  return resolved
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function callerAbortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error && signal.reason.name === 'AbortError'
    ? signal.reason
    : new DOMException('The operation was aborted.', 'AbortError')
}

function exactAdditionalOrigins(origins: readonly string[] | undefined): Set<string> {
  const result = new Set<string>()
  for (const origin of origins ?? []) {
    let url: URL
    try {
      url = new URL(origin)
    } catch (error) {
      throw new NavigationError(
        'SCENE_FETCH_FAILED',
        'additionalAllowedOrigins contains an invalid origin.',
        false,
        error,
      )
    }

    if (
      url.protocol !== 'https:' ||
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      isIP(url.hostname.replace(/^\[|\]$/g, '')) !== 0
    ) {
      throw new NavigationError(
        'SCENE_FETCH_FAILED',
        'additionalAllowedOrigins must contain exact HTTPS origins without paths, wildcards, userinfo, queries, or IP literals.',
        false,
      )
    }
    result.add(url.origin)
  }
  return result
}

function allowedOrigins(serverUrl: string, additional: readonly string[] | undefined): Set<string> {
  let server: URL
  try {
    server = new URL(serverUrl)
  } catch (error) {
    throw new NavigationError('SCENE_FETCH_FAILED', 'The server URL is invalid.', false, error)
  }
  if (server.protocol === 'ws:') server.protocol = 'http:'
  if (server.protocol === 'wss:') server.protocol = 'https:'

  const allowed = exactAdditionalOrigins(additional)
  allowed.add(server.origin)

  if (server.hostname.endsWith('metatell-dev.app')) {
    allowed.add('https://cdn.metatell-dev.app')
    allowed.add('https://storage.metatell-dev.app')
  } else if (server.hostname.endsWith('metatell-stg.app')) {
    allowed.add('https://cdn.metatell-stg.app')
    allowed.add('https://storage.metatell-stg.app')
  } else if (server.hostname.endsWith('metatell.app')) {
    allowed.add('https://cdn.metatell.app')
    allowed.add('https://storage.metatell.app')
  }

  return allowed
}

function validateFetchUrl(url: URL, allowed: ReadonlySet<string>): void {
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username ||
    url.password ||
    isIP(hostname) !== 0 ||
    !allowed.has(url.origin)
  ) {
    throw new NavigationError(
      'SCENE_FETCH_FAILED',
      'The scene asset URL is not in the allowed origin list.',
      false,
    )
  }

  if (
    (url.hostname.endsWith('metatell.app') || url.hostname.endsWith('metatell-stg.app')) &&
    url.protocol !== 'https:'
  ) {
    throw new NavigationError(
      'SCENE_FETCH_FAILED',
      'Staging and production scene assets require HTTPS.',
      false,
    )
  }
}

function responseValidator(response: Response, resourceIdentity: string): NavigationValidator {
  const etag = response.headers.get('etag') ?? undefined
  const lastModified = response.headers.get('last-modified') ?? undefined
  return { resourceIdentity, etag, lastModified }
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const lengthHeader = response.headers.get('content-length')
  if (lengthHeader) {
    const contentLength = Number(lengthHeader)
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new NavigationError('SCENE_TOO_LARGE', 'The scene asset exceeds maxBytes.', false)
    }
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > maxBytes) {
      throw new NavigationError('SCENE_TOO_LARGE', 'The scene asset exceeds maxBytes.', false)
    }
    return bytes
  }

  const chunks: Uint8Array[] = []
  const reader = response.body.getReader()
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new NavigationError('SCENE_TOO_LARGE', 'The scene asset exceeds maxBytes.', false)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function fetchScene(
  scene: RoomSceneInfo,
  serverUrl: string,
  options: PrepareNavigationOptions,
  maxBytes: number,
): Promise<
  | { status: 'not-modified'; validator: NavigationValidator }
  | { status: 'fetched'; bytes: Uint8Array; validator: NavigationValidator }
> {
  const allowed = allowedOrigins(serverUrl, options.additionalAllowedOrigins)
  let url: URL
  try {
    url = new URL(scene.modelUrl)
  } catch (error) {
    throw new NavigationError('SCENE_FETCH_FAILED', 'The scene model URL is invalid.', false, error)
  }
  url.hash = ''
  validateFetchUrl(url, allowed)

  const resourceIdentity = sha256(url.toString())
  const previous = options.previous
  const canRevalidate =
    previous?.sceneIdentity === scene.identity &&
    previous.validator.resourceIdentity === resourceIdentity
  const headers = new Headers()
  if (canRevalidate && previous?.validator.etag) {
    headers.set('if-none-match', previous.validator.etag)
  }
  if (canRevalidate && previous?.validator.lastModified) {
    headers.set('if-modified-since', previous.validator.lastModified)
  }

  const fetchImpl = options.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new NavigationError('SCENE_FETCH_FAILED', 'No fetch implementation is available.', false)
  }

  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) abortFromCaller()
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true })
  const timeoutMs = positiveLimit(options.timeoutMs, DEFAULT_TIMEOUT_MS, 'timeoutMs')
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      validateFetchUrl(url, allowed)
      let response: Response
      try {
        response = await fetchImpl(url, {
          method: 'GET',
          headers,
          redirect: 'manual',
          signal: controller.signal,
        })
      } catch (error) {
        if (options.signal?.aborted) {
          throw callerAbortError(options.signal)
        }
        if (timedOut) {
          throw new NavigationError(
            'SCENE_FETCH_FAILED',
            'The scene asset request timed out.',
            true,
            error,
          )
        }
        if (isAbortError(error)) throw error
        throw new NavigationError(
          'SCENE_FETCH_FAILED',
          'The scene asset request failed.',
          true,
          error,
        )
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirects === MAX_REDIRECTS) {
          throw new NavigationError(
            'SCENE_FETCH_FAILED',
            'The scene asset exceeded the redirect limit.',
            false,
          )
        }
        const location = response.headers.get('location')
        if (!location) {
          throw new NavigationError(
            'SCENE_FETCH_FAILED',
            'The scene asset redirect did not include a location.',
            false,
          )
        }
        url = new URL(location, url)
        url.hash = ''
        continue
      }

      const validator = responseValidator(response, resourceIdentity)
      if (response.status === 304 && canRevalidate) {
        return {
          status: 'not-modified',
          validator: {
            resourceIdentity,
            etag: validator.etag ?? previous?.validator.etag,
            lastModified: validator.lastModified ?? previous?.validator.lastModified,
          },
        }
      }

      if (!response.ok) {
        throw new NavigationError(
          'SCENE_FETCH_FAILED',
          `The scene asset request failed with HTTP ${response.status}.`,
          response.status === 429 || response.status >= 500,
        )
      }

      return { status: 'fetched', bytes: await readLimitedBody(response, maxBytes), validator }
    }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }

  throw new NavigationError('SCENE_FETCH_FAILED', 'The scene asset request failed.', false)
}

function getComponents(node: RawNode): Record<string, unknown> | null {
  const extensions = node.extensions
  const modern = extensions?.MOZ_hubs_components ?? extensions?.HUBS_components
  if (modern && typeof modern === 'object') return modern as Record<string, unknown>

  const legacy = node.extras?.gltfExtensions
  if (!legacy || typeof legacy !== 'object') return null
  const components = (legacy as Record<string, unknown>).MOZ_hubs_components
  return components && typeof components === 'object'
    ? (components as Record<string, unknown>)
    : null
}

function collectMarkers(nodes: RawNode[]): ComponentMarker[] {
  const markers: ComponentMarker[] = []
  nodes.forEach((node, nodeIndex) => {
    const components = getComponents(node)
    if (!components) return
    markers.push({
      nodeIndex,
      name: typeof node.name === 'string' && node.name ? node.name : undefined,
      components,
    })
  })
  return markers
}

function navMeshZone(value: unknown): string {
  if (!value || typeof value !== 'object') return 'character'
  const zone = (value as Record<string, unknown>).zone
  return typeof zone === 'string' && zone ? zone : 'character'
}

function decodedGeometrySize(
  raw: RawGltf,
  navNodeIndex: number,
): { bytes: number; triangles: number } {
  const node = raw.nodes?.[navNodeIndex]
  if (!node || !Number.isInteger(node.mesh)) {
    throw new NavigationError('NAV_MESH_INVALID', 'The nav mesh node has no mesh.', false)
  }
  const mesh = raw.meshes?.[node.mesh as number]
  const primitives = mesh?.primitives ?? []
  if (primitives.length !== 1) {
    throw new NavigationError(
      'NAV_MESH_UNSUPPORTED',
      'Exactly one primitive is supported for the character nav mesh.',
      false,
    )
  }
  const primitive = primitives[0]
  const positionIndex = primitive.attributes?.POSITION
  if (!Number.isInteger(positionIndex)) {
    throw new NavigationError('NAV_MESH_INVALID', 'The nav mesh has no POSITION accessor.', false)
  }
  const positionAccessor = raw.accessors?.[positionIndex as number]
  const positionCount = positionAccessor?.count
  if (!Number.isSafeInteger(positionCount) || (positionCount as number) <= 0) {
    throw new NavigationError(
      'NAV_MESH_INVALID',
      'The nav mesh POSITION accessor is invalid.',
      false,
    )
  }

  let indexCount = positionCount as number
  if (primitive.indices !== undefined) {
    if (!Number.isInteger(primitive.indices)) {
      throw new NavigationError(
        'NAV_MESH_INVALID',
        'The nav mesh index accessor is invalid.',
        false,
      )
    }
    const indexAccessor = raw.accessors?.[primitive.indices as number]
    if (!Number.isSafeInteger(indexAccessor?.count) || (indexAccessor?.count as number) <= 0) {
      throw new NavigationError(
        'NAV_MESH_INVALID',
        'The nav mesh index accessor is invalid.',
        false,
      )
    }
    indexCount = indexAccessor?.count as number
  }

  if (
    (primitive.mode ?? Primitive.Mode.TRIANGLES) !== Primitive.Mode.TRIANGLES ||
    indexCount % 3 !== 0
  ) {
    throw new NavigationError(
      'NAV_MESH_INVALID',
      'The nav mesh primitive must contain triangles.',
      false,
    )
  }
  return {
    bytes:
      (positionCount as number) * 3 * Float32Array.BYTES_PER_ELEMENT +
      indexCount * Uint32Array.BYTES_PER_ELEMENT,
    triangles: indexCount / 3,
  }
}

function temporaryIndexKey(nodes: RawNode[]): string {
  let suffix = 0
  while (true) {
    const key = `__metatell_navigation_node_index_${suffix}`
    if (nodes.every((node) => !Object.hasOwn(node.extras ?? {}, key))) return key
    suffix += 1
  }
}

function transformPoint(
  matrix: readonly number[],
  point: readonly number[],
): [number, number, number] {
  const [x, y, z] = point
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ]
}

function spawnPoints(
  markers: readonly ComponentMarker[],
  nodesByIndex: ReadonlyMap<number, TransformNode>,
): NavigationSpawnPoint[] {
  const result: NavigationSpawnPoint[] = []
  for (const marker of markers) {
    const spawn = marker.components['spawn-point']
    const waypoint = marker.components.waypoint
    const hasSpawnPoint = spawn !== undefined
    const waypointData =
      waypoint && typeof waypoint === 'object' ? (waypoint as Record<string, unknown>) : null
    if (!hasSpawnPoint && waypointData?.canBeSpawnPoint !== true) continue

    const node = nodesByIndex.get(marker.nodeIndex)
    if (!node) continue
    const [x, y, z] = node.getWorldTranslation()
    if (![x, y, z].every(Number.isFinite)) continue
    result.push({
      id: `node-${marker.nodeIndex}`,
      name: marker.name,
      position: { x, y, z },
      occupiable: hasSpawnPoint ? false : waypointData?.canBeOccupied === true,
      restricted: hasSpawnPoint ? false : waypointData?.isRestricted === true,
    })
  }
  return result
}

async function parseNavigationSnapshot(
  scene: RoomSceneInfo,
  sceneRevision: string,
  bytes: Uint8Array,
  limits: NavigationLimits,
): Promise<NavigationSnapshot> {
  if (
    bytes.byteLength < 12 ||
    new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true) !== GLB_MAGIC
  ) {
    throw new NavigationError(
      'SCENE_FORMAT_UNSUPPORTED',
      'Navigation preparation currently supports self-contained GLB assets only.',
      false,
    )
  }

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .setStrictResources(false)
    .setLogger(new Logger(Verbosity.SILENT))
  let jsonDocument: JSONDocument
  try {
    jsonDocument = await io.binaryToJSON(bytes)
  } catch (error) {
    throw new NavigationError(
      'SCENE_FORMAT_UNSUPPORTED',
      'The scene is not a valid GLB asset.',
      false,
      error,
    )
  }

  const raw = jsonDocument.json as unknown as RawGltf
  if ((raw.buffers ?? []).some((buffer) => typeof buffer.uri === 'string')) {
    throw new NavigationError(
      'SCENE_FORMAT_UNSUPPORTED',
      'External glTF buffers are not supported for navigation.',
      false,
    )
  }
  const geometryExtensions = Array.isArray(raw.extensionsUsed)
    ? raw.extensionsUsed.filter(
        (extension): extension is string =>
          typeof extension === 'string' &&
          /(compression|quantization|meshopt|draco)/i.test(extension),
      )
    : []
  if (geometryExtensions.some((extension) => !SUPPORTED_GEOMETRY_EXTENSIONS.has(extension))) {
    throw new NavigationError(
      'NAV_MESH_UNSUPPORTED',
      'The scene uses an unsupported geometry compression extension.',
      false,
    )
  }

  const nodes = raw.nodes ?? []
  const markers = collectMarkers(nodes)
  const navMarkers = markers.filter(
    (marker) =>
      Object.hasOwn(marker.components, 'nav-mesh') &&
      navMeshZone(marker.components['nav-mesh']) === 'character',
  )
  if (navMarkers.length === 0) {
    throw new NavigationError('NAV_MESH_NOT_FOUND', 'No character nav mesh was found.', false)
  }
  if (navMarkers.length !== 1) {
    throw new NavigationError(
      'NAV_MESH_UNSUPPORTED',
      'Exactly one character nav mesh node is supported.',
      false,
    )
  }

  const estimate = decodedGeometrySize(raw, navMarkers[0].nodeIndex)
  if (estimate.bytes > limits.maxDecodedBytes) {
    throw new NavigationError(
      'NAV_MESH_TOO_LARGE',
      'The decoded nav mesh exceeds maxDecodedBytes.',
      false,
    )
  }
  if (estimate.triangles > limits.maxTriangles) {
    throw new NavigationError('NAV_MESH_TOO_LARGE', 'The nav mesh exceeds maxTriangles.', false)
  }

  const indexKey = temporaryIndexKey(nodes)
  nodes.forEach((node, index) => {
    node.extras = { ...(node.extras ?? {}), [indexKey]: index }
  })

  await MeshoptDecoder.ready
  let document: Document
  try {
    io.registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'draco3d.decoder': await draco.createDecoderModule(),
    })
    document = await io.readJSON(jsonDocument)
  } catch (error) {
    throw new NavigationError(
      'NAV_MESH_INVALID',
      'The nav mesh geometry could not be decoded.',
      false,
      error,
    )
  }

  const nodesByIndex = new Map<number, TransformNode>()
  for (const node of document.getRoot().listNodes()) {
    const index = node.getExtras()[indexKey]
    if (typeof index === 'number') nodesByIndex.set(index, node)
  }

  const navNode = nodesByIndex.get(navMarkers[0].nodeIndex)
  const mesh = navNode?.getMesh()
  const primitives = mesh?.listPrimitives() ?? []
  if (!navNode || primitives.length !== 1) {
    throw new NavigationError('NAV_MESH_INVALID', 'The nav mesh node could not be decoded.', false)
  }
  const primitive = primitives[0]
  if (primitive.getMode() !== Primitive.Mode.TRIANGLES) {
    throw new NavigationError(
      'NAV_MESH_INVALID',
      'The nav mesh primitive must contain triangles.',
      false,
    )
  }
  const positionAccessor = primitive.getAttribute('POSITION')
  if (!positionAccessor || positionAccessor.getElementSize() !== 3) {
    throw new NavigationError(
      'NAV_MESH_INVALID',
      'The nav mesh POSITION accessor is invalid.',
      false,
    )
  }

  const positions = new Float32Array(positionAccessor.getCount() * 3)
  const matrix = navNode.getWorldMatrix()
  const element = [0, 0, 0]
  for (let index = 0; index < positionAccessor.getCount(); index += 1) {
    positionAccessor.getElement(index, element)
    const transformed = transformPoint(matrix, element)
    if (!transformed.every(Number.isFinite)) {
      throw new NavigationError(
        'NAV_MESH_INVALID',
        'The nav mesh contains non-finite coordinates.',
        false,
      )
    }
    positions.set(transformed, index * 3)
  }

  const indexAccessor = primitive.getIndices()
  const indexCount = indexAccessor?.getCount() ?? positionAccessor.getCount()
  if (indexCount % 3 !== 0) {
    throw new NavigationError(
      'NAV_MESH_INVALID',
      'The nav mesh index count is not divisible by three.',
      false,
    )
  }
  const indices = new Uint32Array(indexCount)
  for (let index = 0; index < indexCount; index += 1) {
    const value = indexAccessor?.getScalar(index) ?? index
    if (!Number.isInteger(value) || value < 0 || value >= positionAccessor.getCount()) {
      throw new NavigationError(
        'NAV_MESH_INVALID',
        'The nav mesh contains an out-of-range index.',
        false,
      )
    }
    indices[index] = value
  }

  const triangleCount = indices.length / 3
  if (triangleCount > limits.maxTriangles) {
    throw new NavigationError('NAV_MESH_TOO_LARGE', 'The nav mesh exceeds maxTriangles.', false)
  }

  return {
    schemaVersion: 1,
    sceneIdentity: scene.identity,
    sceneRevision,
    zone: 'character',
    positions,
    indices,
    spawnPoints: spawnPoints(markers, nodesByIndex),
    triangleCount,
  }
}

export async function prepareNavigation(
  scene: RoomSceneInfo | null,
  serverUrl: string,
  options: PrepareNavigationOptions = {},
): Promise<PrepareNavigationResult> {
  if (!scene) {
    throw new NavigationError(
      'SCENE_UNAVAILABLE',
      'The joined room has no supported scene asset.',
      false,
    )
  }

  const maxBytes = positiveLimit(options.maxBytes, DEFAULT_MAX_BYTES, 'maxBytes')
  const limits = {
    maxDecodedBytes: positiveLimit(
      options.maxDecodedBytes,
      DEFAULT_MAX_DECODED_BYTES,
      'maxDecodedBytes',
    ),
    maxTriangles: positiveLimit(options.maxTriangles, DEFAULT_MAX_TRIANGLES, 'maxTriangles'),
  }
  const fetched = await fetchScene(scene, serverUrl, options, maxBytes)
  if (fetched.status === 'not-modified') return fetched

  const sceneRevision = sha256(fetched.bytes)
  if (
    options.previous?.sceneIdentity === scene.identity &&
    options.previous.sceneRevision === sceneRevision
  ) {
    return { status: 'not-modified', validator: fetched.validator }
  }

  const snapshot = await parseNavigationSnapshot(scene, sceneRevision, fetched.bytes, limits)
  return { status: 'prepared', snapshot, validator: fetched.validator }
}
