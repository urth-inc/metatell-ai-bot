import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLlmApi } from './llm.js'

const options = {
  baseUrl: 'https://llm.example.test/v1/',
  apiKey: 'test-key',
  model: 'test-model',
  guarded: false,
}

test('LLM fetchを30秒でabortし、timerを必ずclearする', async () => {
  const originalFetch = globalThis.fetch
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  const timer = 1 as unknown as ReturnType<typeof setTimeout>
  let abortRequest: (() => void) | undefined
  let requestSignal: AbortSignal | undefined
  let clearedTimer: ReturnType<typeof setTimeout> | undefined

  globalThis.setTimeout = ((handler: () => void) => {
    abortRequest = handler
    return timer
  }) as typeof setTimeout
  globalThis.clearTimeout = ((value: ReturnType<typeof setTimeout>) => {
    clearedTimer = value
  }) as typeof clearTimeout
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    requestSignal = init?.signal ?? undefined
    return new Promise<Response>((_resolve, reject) => {
      requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true })
    })
  }) as typeof fetch

  try {
    const pending = createLlmApi(options).complete({ system: 'system', user: 'user' })
    assert.ok(abortRequest)

    abortRequest()

    await assert.rejects(
      pending,
      (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
    )
    assert.equal(requestSignal?.aborted, true)
    assert.equal(clearedTimer, timer)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
  }
})

test('LLM fetch成功時もtimerをclearし、従来どおり本文を返す', async () => {
  const originalFetch = globalThis.fetch
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  const timer = 2 as unknown as ReturnType<typeof setTimeout>
  let requestSignal: AbortSignal | undefined
  let clearedTimer: ReturnType<typeof setTimeout> | undefined

  globalThis.setTimeout = (() => timer) as typeof setTimeout
  globalThis.clearTimeout = ((value: ReturnType<typeof setTimeout>) => {
    clearedTimer = value
  }) as typeof clearTimeout
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    requestSignal = init?.signal ?? undefined
    return Promise.resolve(
      new Response(JSON.stringify({ choices: [{ message: { content: '  hello  ' } }] }), {
        status: 200,
      }),
    )
  }) as typeof fetch

  try {
    const result = await createLlmApi(options).complete({ system: 'system', user: 'user' })

    assert.equal(result, 'hello')
    assert.ok(requestSignal)
    assert.equal(clearedTimer, timer)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
  }
})

test('LLMのHTTPエラー詳細を従来どおり呼び出し元へ返す', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (() =>
    Promise.resolve(new Response('upstream unavailable', { status: 503 }))) as typeof fetch

  try {
    await assert.rejects(
      createLlmApi(options).complete({ system: 'system', user: 'user' }),
      /LLMリクエストが失敗しました（HTTP 503）: upstream unavailable/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
