import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createShutdownController, watchFileChanges } from './lifecycle.js'

test('shutdownは多重呼び出しでもcleanupとdisconnectとexitを一度だけ実行する', async () => {
  const events: string[] = []
  const controller = createShutdownController({
    disconnect: async () => {
      events.push('disconnect')
      throw new Error('network down')
    },
    exit: (code) => events.push(`exit:${code}`),
    log: (message) => events.push(`log:${message}`),
  })
  controller.addCleanup(() => events.push('close-watcher'))
  controller.addCleanup(() => events.push('clear-tick'))

  const first = controller.shutdown('SIGTERM')
  const second = controller.shutdown('duplicate')

  assert.equal(first, second)
  await first
  assert.deepEqual(events.slice(0, 4), [
    'log:停止します: SIGTERM',
    'clear-tick',
    'close-watcher',
    'disconnect',
  ])
  assert.equal(events.filter((event) => event.startsWith('log:切断に失敗')).length, 1)
  assert.equal(events.at(-1), 'exit:0')
})

test('cleanupの例外があっても残りのcleanupとdisconnectとexitを実行する', async () => {
  const events: string[] = []
  const controller = createShutdownController({
    disconnect: async () => events.push('disconnect'),
    exit: () => events.push('exit'),
    log: (message) => events.push(`log:${message}`),
  })
  controller.addCleanup(() => events.push('first-cleanup'))
  controller.addCleanup(() => {
    events.push('broken-cleanup')
    throw new Error('close failed')
  })

  await controller.shutdown('test')

  assert.ok(events.includes('first-cleanup'))
  assert.ok(events.includes('disconnect'))
  assert.ok(events.includes('exit'))
  assert.equal(events.filter((event) => event.startsWith('log:停止処理')).length, 1)
})

test('tree watcherは親directoryを監視しbasename一致だけをdebounceする', () => {
  type Timer = ReturnType<typeof setTimeout>
  type Listener = (eventType: string, filename: string | Buffer | null) => void
  let watchedDirectory = ''
  let listener: Listener | undefined
  let errorHandler: ((error: Error) => void) | undefined
  let watcherClosed = 0
  let nextTimerId = 0
  let scheduled: { timer: Timer; callback: () => void } | undefined
  const cleared: Timer[] = []
  const changes: string[] = []
  const errors: Error[] = []

  const handle = watchFileChanges(
    '/tmp/project/my-bot/tree.json',
    () => changes.push('changed'),
    (error) => errors.push(error),
    300,
    {
      watchDirectory(directory, nextListener) {
        watchedDirectory = directory
        listener = nextListener
        const watcher = {
          on(_event: 'error', handler: (error: Error) => void) {
            errorHandler = handler
            return watcher
          },
          close() {
            watcherClosed += 1
          },
        }
        return watcher
      },
      scheduleTimer(callback) {
        const timer = { id: (nextTimerId += 1) } as unknown as Timer
        scheduled = { timer, callback }
        return timer
      },
      clearTimer(timer) {
        cleared.push(timer)
        if (scheduled?.timer === timer) scheduled = undefined
      },
    },
  )

  assert.equal(watchedDirectory, '/tmp/project/my-bot')
  assert.ok(listener)
  listener('change', 'other.json')
  assert.equal(scheduled, undefined)

  listener('rename', 'tree.json')
  const firstTimer = scheduled?.timer
  assert.ok(firstTimer)
  listener('change', Buffer.from('tree.json'))
  assert.deepEqual(cleared, [firstTimer])
  assert.ok(scheduled)
  scheduled.callback()
  assert.deepEqual(changes, ['changed'])

  const watcherError = new Error('watch failed')
  errorHandler?.(watcherError)
  assert.deepEqual(errors, [watcherError])

  listener('change', 'tree.json')
  const pendingTimer = scheduled?.timer
  assert.ok(pendingTimer)
  handle.close()
  handle.close()
  assert.ok(cleared.includes(pendingTimer))
  assert.equal(watcherClosed, 1)
})
