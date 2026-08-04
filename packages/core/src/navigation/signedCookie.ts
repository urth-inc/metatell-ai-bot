import { Buffer } from 'node:buffer'
import { NavigationError } from '../errors.js'

const CLOUDFRONT_COOKIE_NAMES = [
  'CloudFront-Policy',
  'CloudFront-Signature',
  'CloudFront-Key-Pair-Id',
] as const
const CLOUDFRONT_COOKIE_NAME_SET = new Set<string>(CLOUDFRONT_COOKIE_NAMES)
const RECENT_COOKIE_TTL_MS = 3_000
const MAX_RECENT_COOKIE_ENTRIES = 32

type CloudFrontCookieName = (typeof CLOUDFRONT_COOKIE_NAMES)[number]

interface ParsedCloudFrontCookie {
  name: CloudFrontCookieName
  value: string
  domain: string
  path: string
}

interface SceneAccessCookieSet {
  values: Readonly<Record<CloudFrontCookieName, string>>
  domain: string
  path: string
  resourceOrigin: string
  resourcePathPrefix: string
  expiresAt: number
}

interface FetchSceneAccessCookiesOptions {
  serverUrl: string
  roomId: string
  sceneUrl: URL
  authToken?: string
  fetch: typeof globalThis.fetch
  signal: AbortSignal
}

interface SceneAccessCookieStoreOptions {
  authToken?: string
  fetch?: typeof globalThis.fetch
}

interface SharedRequest {
  controller: AbortController
  promise: Promise<readonly SceneAccessCookieSet[]>
  waiters: number
}

function sceneAccessError(message: string, retryable = false): NavigationError {
  return new NavigationError('SCENE_FETCH_FAILED', message, retryable)
}

function signedCookieEndpoint(serverUrl: string, roomId: string): URL {
  let endpoint: URL
  try {
    endpoint = new URL(serverUrl)
  } catch {
    throw sceneAccessError('The server URL is invalid for the scene access cookie request.')
  }

  if (endpoint.protocol === 'ws:') endpoint.protocol = 'http:'
  else if (endpoint.protocol === 'wss:') endpoint.protocol = 'https:'
  else if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
    throw sceneAccessError('The server URL is invalid for the scene access cookie request.')
  }
  if (endpoint.username || endpoint.password) {
    throw sceneAccessError('The server URL is invalid for the scene access cookie request.')
  }

  endpoint.pathname = `/api/v3/rooms/${encodeURIComponent(roomId)}/signed-cookie`
  endpoint.search = ''
  endpoint.hash = ''
  return endpoint
}

function sceneAccessRequestHost(sceneUrl: URL): string | undefined {
  if (sceneUrl.protocol !== 'https:') return undefined
  const sceneHostname = sceneUrl.hostname.toLowerCase()
  if (!sceneHostname.startsWith('cdn.')) return undefined

  const requestHost = sceneHostname.slice('cdn.'.length)
  return requestHost || undefined
}

export function needsSceneAccessCookies(sceneUrl: URL): boolean {
  return sceneAccessRequestHost(sceneUrl) !== undefined
}

function getSetCookieValues(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
  const values = getSetCookie?.call(headers)
  if (values && values.length > 0) return values

  // Some fetch-compatible implementations do not expose getSetCookie(). This
  // delimiter only matches the start of another cookie, so an Expires comma is
  // not treated as a separator.
  const combined = headers.get('set-cookie')
  return combined ? combined.split(/,(?=\s*[!#$%&'*+.^_`|~0-9A-Za-z-]+=)/) : []
}

function hasInvalidCookieCharacter(value: string, forbidden: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 0x20 || code === 0x7f || forbidden.includes(character)) return true
  }
  return false
}

function parseCloudFrontCookie(value: string): ParsedCloudFrontCookie | null {
  const segments = value.split(';')
  const nameValue = segments.shift()?.trim()
  if (!nameValue) return null
  const separator = nameValue.indexOf('=')
  if (separator <= 0) return null

  const name = nameValue.slice(0, separator).trim()
  const cookieValue = nameValue.slice(separator + 1).trim()
  if (
    !CLOUDFRONT_COOKIE_NAME_SET.has(name) ||
    !cookieValue ||
    hasInvalidCookieCharacter(cookieValue, ',;')
  ) {
    return null
  }

  let domain: string | undefined
  let path: string | undefined
  let secure = false
  let httpOnly = false
  const seenAttributes = new Set<string>()
  for (const segment of segments) {
    const attribute = segment.trim()
    if (!attribute) continue
    const attributeSeparator = attribute.indexOf('=')
    const attributeName = (
      attributeSeparator === -1 ? attribute : attribute.slice(0, attributeSeparator)
    ).toLowerCase()
    const attributeValue =
      attributeSeparator === -1 ? '' : attribute.slice(attributeSeparator + 1).trim()

    if (['domain', 'path', 'secure', 'httponly'].includes(attributeName)) {
      if (seenAttributes.has(attributeName)) return null
      seenAttributes.add(attributeName)
    }

    if (attributeName === 'domain') {
      domain = attributeValue.toLowerCase().replace(/^\.+/, '')
    } else if (attributeName === 'path') {
      path = attributeValue
    } else if (attributeName === 'secure') {
      if (attributeSeparator !== -1) return null
      secure = true
    } else if (attributeName === 'httponly') {
      if (attributeSeparator !== -1) return null
      httpOnly = true
    }
  }

  if (
    !domain ||
    !path ||
    !secure ||
    !httpOnly ||
    hasInvalidCookieCharacter(domain, '/;') ||
    !path.startsWith('/') ||
    hasInvalidCookieCharacter(path, ';')
  ) {
    return null
  }

  return {
    name: name as CloudFrontCookieName,
    value: cookieValue,
    domain,
    path,
  }
}

function decodePolicy(value: string): { resource: string; expiresAt: number } | null {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '=').replaceAll('~', '/')
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'))
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const statements = (parsed as { Statement?: unknown }).Statement
  if (!Array.isArray(statements) || statements.length !== 1) return null
  const statement = statements[0]
  if (!statement || typeof statement !== 'object') return null

  const resource = (statement as { Resource?: unknown }).Resource
  const condition = (statement as { Condition?: unknown }).Condition
  if (typeof resource !== 'string' || !condition || typeof condition !== 'object') return null
  const dateLessThan = (condition as { DateLessThan?: unknown }).DateLessThan
  if (!dateLessThan || typeof dateLessThan !== 'object') return null
  const expiresAt = (dateLessThan as { 'AWS:EpochTime'?: unknown })['AWS:EpochTime']
  if (!Number.isSafeInteger(expiresAt) || (expiresAt as number) <= Date.now() / 1_000) return null

  return { resource, expiresAt: expiresAt as number }
}

function domainMatches(hostname: string, domain: string): boolean {
  const normalizedHostname = hostname.toLowerCase()
  return normalizedHostname === domain || normalizedHostname.endsWith(`.${domain}`)
}

function pathMatches(pathname: string, pathPrefix: string): boolean {
  return pathname.startsWith(pathPrefix)
}

function cookiePathMatchesResource(cookiePath: string, resourcePathPrefix: string): boolean {
  return cookiePath === resourcePathPrefix || `${cookiePath}/` === resourcePathPrefix
}

function buildCookieSets(
  values: readonly string[],
  sceneUrl: URL,
): readonly SceneAccessCookieSet[] | null {
  if (values.length === 0) return null
  const groups = new Map<string, Map<CloudFrontCookieName, ParsedCloudFrontCookie>>()

  for (const value of values) {
    const cookie = parseCloudFrontCookie(value)
    if (!cookie) return null
    const groupKey = `${cookie.domain}\u0000${cookie.path}`
    const group = groups.get(groupKey) ?? new Map()
    if (group.has(cookie.name)) return null
    group.set(cookie.name, cookie)
    groups.set(groupKey, group)
  }

  const cookieSets: SceneAccessCookieSet[] = []
  for (const group of groups.values()) {
    if (group.size !== CLOUDFRONT_COOKIE_NAMES.length) return null
    const policyCookie = group.get('CloudFront-Policy')
    const signatureCookie = group.get('CloudFront-Signature')
    const keyPairCookie = group.get('CloudFront-Key-Pair-Id')
    if (!policyCookie || !signatureCookie || !keyPairCookie) return null

    const policy = decodePolicy(policyCookie.value)
    if (!policy || !policy.resource.endsWith('*')) return null
    const resourcePrefix = policy.resource.slice(0, -1)
    let resourceUrl: URL
    try {
      resourceUrl = new URL(resourcePrefix)
    } catch {
      return null
    }
    if (
      resourceUrl.protocol !== 'https:' ||
      resourceUrl.username ||
      resourceUrl.password ||
      resourceUrl.search ||
      resourceUrl.hash ||
      resourcePrefix !== resourceUrl.origin + resourceUrl.pathname ||
      resourceUrl.origin !== sceneUrl.origin ||
      !domainMatches(resourceUrl.hostname, policyCookie.domain) ||
      !cookiePathMatchesResource(policyCookie.path, resourceUrl.pathname)
    ) {
      return null
    }

    cookieSets.push({
      values: {
        'CloudFront-Policy': policyCookie.value,
        'CloudFront-Signature': signatureCookie.value,
        'CloudFront-Key-Pair-Id': keyPairCookie.value,
      },
      domain: policyCookie.domain,
      path: policyCookie.path,
      resourceOrigin: resourceUrl.origin,
      resourcePathPrefix: resourceUrl.pathname,
      expiresAt: policy.expiresAt,
    })
  }

  return cookieSets
}

function cookieSetMatches(cookieSet: SceneAccessCookieSet, url: URL): boolean {
  return (
    url.protocol === 'https:' &&
    url.origin === cookieSet.resourceOrigin &&
    domainMatches(url.hostname, cookieSet.domain) &&
    pathMatches(url.pathname, cookieSet.resourcePathPrefix) &&
    cookieSet.expiresAt > Date.now() / 1_000
  )
}

function sceneAccessCookieHeader(
  cookieSets: readonly SceneAccessCookieSet[],
  url: URL,
): string | undefined {
  let selected: SceneAccessCookieSet | undefined
  for (const cookieSet of cookieSets) {
    if (!cookieSetMatches(cookieSet, url)) continue
    if (!selected || cookieSet.resourcePathPrefix.length > selected.resourcePathPrefix.length) {
      selected = cookieSet
    }
  }
  if (!selected) return undefined

  return CLOUDFRONT_COOKIE_NAMES.map((name) => `${name}=${selected.values[name]}`).join('; ')
}

async function fetchSceneAccessCookies(
  options: FetchSceneAccessCookiesOptions,
): Promise<readonly SceneAccessCookieSet[]> {
  const endpoint = signedCookieEndpoint(options.serverUrl, options.roomId)
  const headers = new Headers()
  const requestHost = sceneAccessRequestHost(options.sceneUrl)
  // Mirror the custom-domain proxy so the canonical room endpoint signs cookies
  // for cdn.<original-host> while the access token remains on serverUrl.
  if (requestHost && requestHost !== endpoint.hostname.toLowerCase()) {
    headers.set('x-original-host', requestHost)
  }
  if (options.authToken) {
    try {
      headers.set('authorization', `Bearer ${options.authToken}`)
    } catch {
      throw sceneAccessError('The scene access cookie request could not be created.')
    }
  }

  let response: Response
  try {
    response = await options.fetch(endpoint, {
      method: 'POST',
      headers,
      redirect: 'manual',
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw sceneAccessError('The scene access cookie request failed.', true)
  }
  if (!response.ok) {
    throw sceneAccessError(
      `The scene access cookie request failed with HTTP ${response.status}.`,
      response.status === 429 || response.status >= 500,
    )
  }

  const cookieSets = buildCookieSets(getSetCookieValues(response.headers), options.sceneUrl)
  if (!cookieSets || !sceneAccessCookieHeader(cookieSets, options.sceneUrl)) {
    throw sceneAccessError(
      'The scene access cookie response did not include applicable CloudFront cookies.',
    )
  }
  return cookieSets
}

function waitForSharedRequest<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)

  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

/** Internal per-client store for restricted CloudFront scene cookies. */
export class SceneAccessCookieStore {
  private readonly authToken: string | undefined
  private readonly fetchImpl: typeof globalThis.fetch | undefined
  private readonly recent = new Map<
    string,
    {
      cookieSets: readonly SceneAccessCookieSet[]
      refreshAfter: number
      expiresAt: number
    }
  >()
  private readonly inflight = new Map<string, SharedRequest>()

  constructor(options: SceneAccessCookieStoreOptions = {}) {
    this.authToken = options.authToken
    this.fetchImpl = options.fetch ?? globalThis.fetch
  }

  async get(
    serverUrl: string,
    roomId: string,
    sceneUrl: URL,
    signal: AbortSignal,
  ): Promise<readonly SceneAccessCookieSet[]> {
    if (signal.aborted) throw signal.reason
    const key = [serverUrl, roomId, sceneUrl.origin, sceneUrl.pathname].join('\u0000')
    const now = Date.now()
    for (const [cachedKey, cachedValue] of this.recent) {
      if (cachedValue.expiresAt <= now) this.recent.delete(cachedKey)
    }
    const cached = this.recent.get(key)
    if (cached && cached.refreshAfter > now) return cached.cookieSets

    if (typeof this.fetchImpl !== 'function') {
      throw sceneAccessError('No fetch implementation is available for scene access cookies.')
    }

    let shared = this.inflight.get(key)
    if (!shared) {
      const controller = new AbortController()
      shared = {
        controller,
        waiters: 0,
        promise: Promise.resolve([]),
      }
      const current = shared
      current.promise = fetchSceneAccessCookies({
        serverUrl,
        roomId,
        sceneUrl,
        authToken: this.authToken,
        fetch: this.fetchImpl,
        signal: controller.signal,
      })
        .then((cookieSets) => {
          if (this.inflight.get(key) === current) {
            const earliestExpiry = Math.min(...cookieSets.map((cookieSet) => cookieSet.expiresAt))
            const expiresAt = earliestExpiry * 1_000
            this.recent.set(key, {
              cookieSets,
              refreshAfter: Math.min(Date.now() + RECENT_COOKIE_TTL_MS, expiresAt),
              expiresAt,
            })
            while (this.recent.size > MAX_RECENT_COOKIE_ENTRIES) {
              const oldestKey = this.recent.keys().next().value
              if (oldestKey === undefined) break
              this.recent.delete(oldestKey)
            }
          }
          return cookieSets
        })
        .finally(() => {
          if (this.inflight.get(key) === current) this.inflight.delete(key)
        })
      this.inflight.set(key, current)
      shared = current
    }

    shared.waiters += 1
    try {
      try {
        return await waitForSharedRequest(shared.promise, signal)
      } catch (error) {
        if (signal.aborted) throw error
        const fallback = this.recent.get(key)
        if (fallback && fallback.expiresAt > Date.now()) return fallback.cookieSets
        throw error
      }
    } finally {
      shared.waiters -= 1
      if (shared.waiters === 0 && this.inflight.get(key) === shared) {
        this.inflight.delete(key)
        shared.controller.abort()
      }
    }
  }

  header(cookieSets: readonly SceneAccessCookieSet[], url: URL): string | undefined {
    return sceneAccessCookieHeader(cookieSets, url)
  }

  clear(): void {
    for (const request of this.inflight.values()) request.controller.abort()
    this.inflight.clear()
    this.recent.clear()
  }
}
