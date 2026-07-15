import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSafeSpeaker, MIN_SAY_INTERVAL_MS } from './safety.js'

test('送信に成功した発言だけを音声フックへ渡し、間隔内の発言は両方とも抑制する', async () => {
  let currentMs = 1_000
  const chats: string[] = []
  const voices: Array<{ text: string; priority: string }> = []
  const speaker = createSafeSpeaker(
    () => {},
    async (text, priority) => {
      voices.push({ text, priority })
    },
    () => currentMs,
  )

  assert.equal(
    await speaker.trySend(async () => {
      chats.push('first')
    }, 'first'),
    true,
  )
  assert.equal(
    await speaker.trySend(async () => {
      chats.push('suppressed')
    }, 'suppressed'),
    false,
  )

  currentMs += MIN_SAY_INTERVAL_MS
  assert.equal(
    await speaker.trySend(async () => {
      chats.push('second')
    }, 'second'),
    true,
  )
  assert.deepEqual(chats, ['first', 'second'])
  assert.deepEqual(voices, [
    { text: 'first', priority: 'normal' },
    { text: 'second', priority: 'normal' },
  ])
})

test('音声フックの失敗は送信済みチャットを失敗扱いにしない', async () => {
  const logs: string[] = []
  const speaker = createSafeSpeaker(logs.push.bind(logs), async () => {
    throw new Error('tts failed')
  })

  assert.equal(await speaker.trySend(async () => {}, 'hello'), true)
  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(logs.some((message) => message.includes('tts failed')))
})

test('音声の再生完了を待たず、チャット送信時点で発言を完了する', async () => {
  let finishVoice: (() => void) | undefined
  const speaker = createSafeSpeaker(
    () => {},
    () =>
      new Promise<void>((resolve) => {
        finishVoice = resolve
      }),
  )

  assert.equal(await speaker.trySend(async () => {}, 'hello'), true)
  assert.ok(finishVoice)
  finishVoice()
})

test('メンション返信は5秒間隔内でも残り時間を待って1回送る', async () => {
  let currentMs = 1_000
  const sleeps: number[] = []
  const sent: string[] = []
  const voicePriorities: string[] = []
  const speaker = createSafeSpeaker(
    () => {},
    async (_text, priority) => {
      voicePriorities.push(priority)
    },
    () => currentMs,
    async (ms) => {
      sleeps.push(ms)
      currentMs += ms
    },
  )
  await speaker.trySend(async () => sent.push('greeting'), 'greeting')

  assert.equal(await speaker.sendWhenReady(async () => sent.push('reply'), 'reply'), true)
  assert.deepEqual(sleeps, [MIN_SAY_INTERVAL_MS])
  assert.deepEqual(sent, ['greeting', 'reply'])
  assert.deepEqual(voicePriorities, ['normal', 'reply'])
})
