import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { SceneAccessCookieStore } from './signedCookie.js'

const SCENE_PATH = '/organizations/urth/scenes/scene-1/'
const SCENE_URL = new URL(`https://cdn.metatell-dev.app${SCENE_PATH}scene.glb`)

function policy(resource: string, expiresAt = Math.floor(Date.now() / 1_000) + 3_600): string {
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

function cookieTriplet(
  path: string,
  suffix: string,
  options: {
    domain?: string
    resource?: string
    expiresAt?: number
    secure?: boolean
    httpOnly?: boolean
  } = {},
): string[] {
  const resourcePath = path.endsWith('/') ? path : `${path}/`
  const attributes = [
    `Domain=${options.domain ?? '.metatell-dev.app'}`,
    `Path=${path}`,
    options.secure === false ? '' : 'Secure',
    options.httpOnly === false ? '' : 'HttpOnly',
  ]
    .filter(Boolean)
    .join('; ')
  const resource = options.resource ?? `https://cdn.metatell-dev.app${resourcePath}*`

  return [
    `CloudFront-Policy=${policy(resource, options.expiresAt)}; ${attributes}`,
    `CloudFront-Signature=signature-${suffix}; ${attributes}`,
    `CloudFront-Key-Pair-Id=key-${suffix}; ${attributes}`,
  ]
}

function responseWithCookies(values: readonly string[]): Response {
  const headers = new Headers()
  for (const value of values) headers.append('set-cookie', value)
  return new Response('{}', { status: 200, headers })
}

function createStore(values: readonly string[]): SceneAccessCookieStore {
  return new SceneAccessCookieStore({
    fetch: vi.fn(async () => responseWithCookies(values)),
  })
}

describe('SceneAccessCookieStore', () => {
  it('derives the room endpoint without inheriting server URL path, query, or hash', async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      expect(input.toString()).toBe(
        'https://tenant.metatell-dev.app:8443/api/v3/rooms/room%20%2F%3F%23/signed-cookie',
      )
      expect(init?.method).toBe('POST')
      expect(init?.body).toBeUndefined()
      expect(init?.redirect).toBe('manual')
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer access-token')
      return responseWithCookies(cookieTriplet(SCENE_PATH, 'scene'))
    })
    const store = new SceneAccessCookieStore({ authToken: 'access-token', fetch: fetchMock })

    await expect(
      store.get(
        'wss://tenant.metatell-dev.app:8443/socket?ignored=yes#ignored',
        'room /?#',
        SCENE_URL,
        new AbortController().signal,
      ),
    ).resolves.toHaveLength(1)
  })

  it('does not send an Authorization header for anonymous clients', async () => {
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
      expect(new Headers(init?.headers).has('authorization')).toBe(false)
      return responseWithCookies(cookieTriplet(SCENE_PATH, 'scene'))
    })
    const store = new SceneAccessCookieStore({ fetch: fetchMock })

    await store.get(
      'https://metatell-dev.app/ignored',
      'room-1',
      SCENE_URL,
      new AbortController().signal,
    )
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('keeps complete path-scoped triplets together and selects only the scene set', async () => {
    const store = createStore([
      ...cookieTriplet('/organizations/urth/avatars/', 'avatar'),
      ...cookieTriplet(SCENE_PATH, 'scene'),
      ...cookieTriplet('/scoped-tmp/organizations/urth/rooms/room-1', 'tmp'),
    ])

    const cookieSets = await store.get(
      'wss://metatell-dev.app',
      'room-1',
      SCENE_URL,
      new AbortController().signal,
    )

    expect(cookieSets).toHaveLength(3)
    const header = store.header(cookieSets, SCENE_URL)
    expect(header).toContain('CloudFront-Policy=')
    expect(header).toContain('CloudFront-Signature=signature-scene')
    expect(header).toContain('CloudFront-Key-Pair-Id=key-scene')
    expect(header).not.toContain('signature-avatar')
    expect(header).not.toContain('signature-tmp')
  })

  it.each([
    {
      name: 'an incomplete triplet',
      values: cookieTriplet(SCENE_PATH, 'scene').slice(0, 2),
    },
    {
      name: 'triplet members split across paths',
      values: [
        cookieTriplet(SCENE_PATH, 'scene')[0],
        ...cookieTriplet('/organizations/urth/scenes/other/', 'other').slice(1),
      ],
    },
    {
      name: 'a duplicate cookie name in one path',
      values: [...cookieTriplet(SCENE_PATH, 'scene'), cookieTriplet(SCENE_PATH, 'duplicate')[0]],
    },
    {
      name: 'a cookie without Secure',
      values: cookieTriplet(SCENE_PATH, 'scene', { secure: false }),
    },
    {
      name: 'a cookie without HttpOnly',
      values: cookieTriplet(SCENE_PATH, 'scene', { httpOnly: false }),
    },
    {
      name: 'an unrelated cookie',
      values: [...cookieTriplet(SCENE_PATH, 'scene'), 'session=value; Secure; HttpOnly'],
    },
    {
      name: 'an expired policy',
      values: cookieTriplet(SCENE_PATH, 'scene', {
        expiresAt: Math.floor(Date.now() / 1_000) - 1,
      }),
    },
    {
      name: 'a policy for another origin',
      values: cookieTriplet(SCENE_PATH, 'scene', {
        resource: `https://storage.metatell-dev.app${SCENE_PATH}*`,
      }),
    },
    {
      name: 'a broader cookie path than the policy resource',
      values: cookieTriplet('/organizations/', 'scene', {
        resource: `https://cdn.metatell-dev.app${SCENE_PATH}*`,
      }),
    },
    {
      name: 'a cookie domain unrelated to the policy origin',
      values: cookieTriplet(SCENE_PATH, 'scene', { domain: '.example.com' }),
    },
  ])('rejects $name atomically', async ({ values }) => {
    const store = createStore(values)

    await expect(
      store.get('wss://metatell-dev.app', 'room-1', SCENE_URL, new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'SCENE_FETCH_FAILED',
      message: 'The scene access cookie response did not include applicable CloudFront cookies.',
    })
  })

  it('binds a valid triplet to the exact policy origin and resource path', async () => {
    const store = createStore(cookieTriplet(SCENE_PATH, 'scene'))
    const cookieSets = await store.get(
      'wss://metatell-dev.app',
      'room-1',
      SCENE_URL,
      new AbortController().signal,
    )

    expect(store.header(cookieSets, SCENE_URL)).toContain('signature-scene')
    expect(
      store.header(cookieSets, new URL(`https://storage.metatell-dev.app${SCENE_PATH}scene.glb`)),
    ).toBeUndefined()
    expect(
      store.header(
        cookieSets,
        new URL('https://cdn.metatell-dev.app/organizations/urth/avatars/avatar.glb'),
      ),
    ).toBeUndefined()
  })

  it('single-flights concurrent requests and reuses the result briefly', async () => {
    let resolveResponse: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(
      async () =>
        await new Promise<Response>((resolve) => {
          resolveResponse = resolve
        }),
    )
    const store = new SceneAccessCookieStore({ fetch: fetchMock })

    const requests = Array.from({ length: 50 }, () =>
      store.get('wss://metatell-dev.app', 'room-1', SCENE_URL, new AbortController().signal),
    )
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    resolveResponse?.(responseWithCookies(cookieTriplet(SCENE_PATH, 'scene')))
    await expect(Promise.all(requests)).resolves.toHaveLength(50)

    await store.get('wss://metatell-dev.app', 'room-1', SCENE_URL, new AbortController().signal)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('does not let one caller abort a refresh that still has another waiter', async () => {
    let resolveResponse: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(
      async () =>
        await new Promise<Response>((resolve) => {
          resolveResponse = resolve
        }),
    )
    const store = new SceneAccessCookieStore({ fetch: fetchMock })
    const firstController = new AbortController()
    const secondController = new AbortController()

    const first = store.get('wss://metatell-dev.app', 'room-1', SCENE_URL, firstController.signal)
    const second = store.get('wss://metatell-dev.app', 'room-1', SCENE_URL, secondController.signal)
    firstController.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })

    resolveResponse?.(responseWithCookies(cookieTriplet(SCENE_PATH, 'scene')))
    await expect(second).resolves.toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('retries after a failed refresh and does not expose a thrown secret', async () => {
    const secret = 'super-secret-token'
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error(secret))
      .mockResolvedValueOnce(responseWithCookies(cookieTriplet(SCENE_PATH, 'scene')))
    const store = new SceneAccessCookieStore({ authToken: secret, fetch: fetchMock })

    const first = store.get(
      'wss://metatell-dev.app',
      'room-1',
      SCENE_URL,
      new AbortController().signal,
    )
    await expect(first).rejects.toMatchObject({
      message: 'The scene access cookie request failed.',
      cause: undefined,
    })
    await expect(first).rejects.not.toThrow(secret)

    await expect(
      store.get('wss://metatell-dev.app', 'room-1', SCENE_URL, new AbortController().signal),
    ).resolves.toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to an unexpired cookie set when a later refresh fails', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(responseWithCookies(cookieTriplet(SCENE_PATH, 'scene')))
        .mockRejectedValueOnce(new Error('temporary failure'))
      const store = new SceneAccessCookieStore({ fetch: fetchMock })

      const initial = await store.get(
        'wss://metatell-dev.app',
        'room-1',
        SCENE_URL,
        new AbortController().signal,
      )
      vi.advanceTimersByTime(3_001)
      const fallback = await store.get(
        'wss://metatell-dev.app',
        'room-1',
        SCENE_URL,
        new AbortController().signal,
      )

      expect(fallback).toBe(initial)
      expect(store.header(fallback, SCENE_URL)).toContain('signature-scene')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps stores for separate clients isolated', async () => {
    const fetchMock = vi.fn(async () => responseWithCookies(cookieTriplet(SCENE_PATH, 'scene')))
    const firstStore = new SceneAccessCookieStore({ fetch: fetchMock })
    const secondStore = new SceneAccessCookieStore({ fetch: fetchMock })

    await firstStore.get(
      'wss://metatell-dev.app',
      'room-1',
      SCENE_URL,
      new AbortController().signal,
    )
    await secondStore.get(
      'wss://metatell-dev.app',
      'room-1',
      SCENE_URL,
      new AbortController().signal,
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('drops recent cookies when the client store is cleared', async () => {
    const fetchMock = vi.fn(async () => responseWithCookies(cookieTriplet(SCENE_PATH, 'scene')))
    const store = new SceneAccessCookieStore({ fetch: fetchMock })

    await store.get('wss://metatell-dev.app', 'room-1', SCENE_URL, new AbortController().signal)
    store.clear()
    await store.get('wss://metatell-dev.app', 'room-1', SCENE_URL, new AbortController().signal)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('prunes expired entries for scene paths that are no longer requested', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(
          responseWithCookies(
            cookieTriplet(SCENE_PATH, 'scene', {
              expiresAt: Math.floor(Date.now() / 1_000) + 2,
            }),
          ),
        )
        .mockResolvedValueOnce(responseWithCookies(cookieTriplet(SCENE_PATH, 'replacement')))
      const store = new SceneAccessCookieStore({ fetch: fetchMock })
      const recent = (store as unknown as { recent: Map<string, unknown> }).recent

      await store.get('wss://metatell-dev.app', 'room-1', SCENE_URL, new AbortController().signal)
      expect(recent.size).toBe(1)

      vi.advanceTimersByTime(2_001)
      await store.get(
        'wss://metatell-dev.app',
        'room-1',
        new URL(`https://cdn.metatell-dev.app${SCENE_PATH}replacement.glb`),
        new AbortController().signal,
      )
      expect(recent.size).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
