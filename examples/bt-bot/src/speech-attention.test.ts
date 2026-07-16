import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Vec3 } from './engine/types.js'
import { SpeechAttentionCoordinator } from './speech-attention.js'

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

function deferred(): { promise: Promise<void>; resolve(): void; reject(error: Error): void } {
  let resolvePromise: (() => void) | undefined
  let rejectPromise: ((error: Error) => void) | undefined
  return {
    promise: new Promise<void>((resolve, reject) => {
      resolvePromise = resolve
      rejectPromise = reject
    }),
    resolve: () => resolvePromise?.(),
    reject: (error) => rejectPromise?.(error),
  }
}

test('前の発話が終わるまで次の相手へ向かず、発話ごとに位置保持を解放する', async () => {
  const events: string[] = []
  const positions = new Map<string, Vec3>([
    ['person-a', { x: 1, y: 0, z: 0 }],
    ['person-b', { x: 2, y: 0, z: 0 }],
  ])
  const firstPlayback = deferred()
  const secondPlayback = deferred()
  const coordinator = new SpeechAttentionCoordinator({
    getTargetPosition(sessionId) {
      events.push(`target:${sessionId}`)
      return positions.get(sessionId)
    },
    async holdPositionAndLookAt(target) {
      events.push(`hold:${target?.x ?? 'none'}`)
      return () => events.push(`release:${target?.x ?? 'none'}`)
    },
  })

  const first = coordinator.run({ targetSessionId: 'person-a' }, async () => {
    events.push('speak:a')
    await firstPlayback.promise
  })
  const second = coordinator.run({ targetSessionId: 'person-b' }, async () => {
    events.push('speak:b')
    await secondPlayback.promise
  })
  await flush()

  assert.deepEqual(events, ['target:person-a', 'hold:1', 'speak:a'])

  firstPlayback.resolve()
  await first
  await flush()
  assert.deepEqual(events, [
    'target:person-a',
    'hold:1',
    'speak:a',
    'release:1',
    'target:person-b',
    'hold:2',
    'speak:b',
  ])

  secondPlayback.resolve()
  await second
  assert.equal(events.at(-1), 'release:2')
})

test('発話が失敗しても位置保持を解放し、後続の発話を続ける', async () => {
  const events: string[] = []
  const coordinator = new SpeechAttentionCoordinator({
    getTargetPosition: () => undefined,
    async holdPositionAndLookAt() {
      events.push('hold')
      return () => events.push('release')
    },
  })

  const failed = coordinator.run(undefined, async () => {
    events.push('failed-speech')
    throw new Error('tts failed')
  })
  const succeeded = coordinator.run(undefined, async () => {
    events.push('next-speech')
  })

  await assert.rejects(failed, /tts failed/)
  await succeeded
  assert.deepEqual(events, ['hold', 'failed-speech', 'release', 'hold', 'next-speech', 'release'])
})
