import fs from 'node:fs'
import path from 'node:path'

type Timer = ReturnType<typeof setTimeout>

interface WatcherLike {
  on(event: 'error', listener: (error: Error) => void): unknown
  close(): void
}

interface FileWatchDependencies {
  watchDirectory: (
    directory: string,
    listener: (eventType: string, filename: string | Buffer | null) => void,
  ) => WatcherLike
  scheduleTimer: (callback: () => void, delayMs: number) => Timer
  clearTimer: (timer: Timer) => void
}

export interface FileWatchHandle {
  close(): void
}

/**
 * Watches a file through its parent directory so atomic-save renames do not
 * detach the watcher from the replacement inode.
 */
export function watchFileChanges(
  filePath: string,
  onChange: () => void,
  onError: (error: Error) => void,
  debounceMs = 300,
  dependencies: Partial<FileWatchDependencies> = {},
): FileWatchHandle {
  const targetName = path.basename(filePath)
  const watchDirectory =
    dependencies.watchDirectory ??
    ((directory, listener) => fs.watch(directory, listener) as WatcherLike)
  const scheduleTimer =
    dependencies.scheduleTimer ?? ((callback, delay) => setTimeout(callback, delay))
  const clearTimer = dependencies.clearTimer ?? ((timer) => clearTimeout(timer))
  let reloadTimer: Timer | null = null
  let closed = false

  const watcher = watchDirectory(path.dirname(filePath), (_eventType, filename) => {
    if (closed || filename === null || path.basename(filename.toString()) !== targetName) return
    if (reloadTimer) clearTimer(reloadTimer)
    reloadTimer = scheduleTimer(() => {
      reloadTimer = null
      if (!closed) onChange()
    }, debounceMs)
  })

  watcher.on('error', (error) => {
    if (!closed) onError(error)
  })

  return {
    close() {
      if (closed) return
      closed = true
      if (reloadTimer) {
        clearTimer(reloadTimer)
        reloadTimer = null
      }
      watcher.close()
    },
  }
}

export interface ShutdownController {
  addCleanup(cleanup: () => void): void
  shutdown(reason: string): Promise<void>
}

interface ShutdownOptions {
  disconnect: () => Promise<void>
  exit: (code: number) => void
  log: (message: string) => void
  disconnectTimeoutMs?: number
  scheduleTimer?: (callback: () => void, delayMs: number) => Timer
  clearTimer?: (timer: Timer) => void
}

const DEFAULT_DISCONNECT_TIMEOUT_MS = 5_000

/** Creates a single-flight shutdown that always runs cleanup and exits. */
export function createShutdownController(options: ShutdownOptions): ShutdownController {
  const cleanups: Array<() => void> = []
  let shutdownPromise: Promise<void> | null = null
  const scheduleTimer =
    options.scheduleTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs))
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer))

  const safeLog = (message: string): void => {
    try {
      options.log(message)
    } catch {
      // Logging must never prevent shutdown.
    }
  }

  const runCleanup = (cleanup: () => void): void => {
    try {
      cleanup()
    } catch (error) {
      safeLog(`停止処理のクリーンアップに失敗しました: ${String(error)}`)
    }
  }

  const disconnectBeforeDeadline = async (): Promise<void> => {
    type DisconnectResult =
      | { status: 'completed' }
      | { status: 'failed'; error: unknown }
      | { status: 'timed-out' }

    const disconnectResult = Promise.resolve()
      .then(options.disconnect)
      .then<DisconnectResult, DisconnectResult>(
        () => ({ status: 'completed' }),
        (error: unknown) => ({ status: 'failed', error }),
      )
    let timer: Timer | null = null
    const timeoutResult = new Promise<DisconnectResult>((resolve) => {
      timer = scheduleTimer(
        () => resolve({ status: 'timed-out' }),
        options.disconnectTimeoutMs ?? DEFAULT_DISCONNECT_TIMEOUT_MS,
      )
    })
    const result = await Promise.race([disconnectResult, timeoutResult])
    if (timer !== null) clearTimer(timer)

    if (result.status === 'failed') {
      safeLog(`切断に失敗しました: ${String(result.error)}`)
    } else if (result.status === 'timed-out') {
      safeLog('切断処理がタイムアウトしたため、終了を続行します')
    }
  }

  return {
    addCleanup(cleanup) {
      if (shutdownPromise) {
        runCleanup(cleanup)
        return
      }
      cleanups.push(cleanup)
    },

    shutdown(reason) {
      if (shutdownPromise) return shutdownPromise

      // Defer execution by one microtask so shutdownPromise is assigned before
      // any cleanup can re-enter shutdown.
      shutdownPromise = Promise.resolve().then(async () => {
        try {
          safeLog(`停止します: ${reason}`)
          for (const cleanup of cleanups.splice(0).reverse()) runCleanup(cleanup)
          await disconnectBeforeDeadline()
        } finally {
          options.exit(0)
        }
      })
      return shutdownPromise
    },
  }
}
