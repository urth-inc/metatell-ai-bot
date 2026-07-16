import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSafeSpeaker, MIN_SAY_INTERVAL_MS } from './safety.js'

test('送信に成功した発言だけを音声フックへ渡し、間隔内の発言は両方とも抑制する', async () => {
  let currentMs = 1_000
  const chats: string[] = []
  const voices: Array<{ text: string; priority: string; targetSessionId?: string }> = []
  const speaker = createSafeSpeaker(
    () => {},
    async (text, priority, context) => {
      voices.push({ text, priority, targetSessionId: context?.targetSessionId })
    },
    () => currentMs,
  )

  assert.equal(
    await speaker.trySend(
      async () => {
        chats.push('first')
      },
      'first',
      { targetSessionId: 'human-1' },
    ),
    true,
  )
  assert.equal(
    await speaker.trySend(
      async () => {
        chats.push('suppressed')
      },
      'suppressed',
      { targetSessionId: 'human-2' },
    ),
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
    { text: 'first', priority: 'normal', targetSessionId: 'human-1' },
    { text: 'second', priority: 'normal', targetSessionId: undefined },
  ])
})

test('音声フックの失敗は送信済みチャットを失敗扱いにしない', async () => {
  const logs: string[] = []
  const speaker = createSafeSpeaker(logs.push.bind(logs), async () => {
    throw new Error('tts failed')
  })

  assert.equal(await speaker.trySend(async () => {}, 'hello'), true)
  assert.ok(logs.some((message) => message.includes('tts failed')))
})

test('音声の再生完了まで発言を完了せず待つ', async () => {
  let finishVoice: (() => void) | undefined
  let settled = false
  const speaker = createSafeSpeaker(
    () => {},
    () =>
      new Promise<void>((resolve) => {
        finishVoice = resolve
      }),
  )

  const sending = speaker
    .trySend(async () => {}, 'hello')
    .then((result) => {
      settled = true
      return result
    })

  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(finishVoice)
  assert.equal(settled, false)
  finishVoice()
  assert.equal(await sending, true)
  assert.equal(settled, true)
})

test('メンション返信は5秒間隔内でも残り時間を待って1回送る', async () => {
  let currentMs = 1_000
  const sleeps: number[] = []
  const sent: string[] = []
  const voices: Array<{ priority: string; targetSessionId?: string }> = []
  const speaker = createSafeSpeaker(
    () => {},
    async (_text, priority, context) => {
      voices.push({ priority, targetSessionId: context?.targetSessionId })
    },
    () => currentMs,
    async (ms) => {
      sleeps.push(ms)
      currentMs += ms
    },
  )
  await speaker.trySend(async () => sent.push('greeting'), 'greeting')

  assert.equal(
    await speaker.sendWhenReady(async () => sent.push('reply'), 'reply', {
      targetSessionId: 'human-1',
    }),
    true,
  )
  assert.deepEqual(sleeps, [MIN_SAY_INTERVAL_MS])
  assert.deepEqual(sent, ['greeting', 'reply'])
  assert.deepEqual(voices, [
    { priority: 'normal', targetSessionId: undefined },
    { priority: 'reply', targetSessionId: 'human-1' },
  ])
})
