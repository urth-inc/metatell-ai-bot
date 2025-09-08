/**
 * Test for inspect command
 */

import type { MetatellClient } from '@metatell/bot-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inspectCommand } from './inspect.js'

// Mock modules
vi.mock('@metatell/bot-sdk', () => ({
  createMetatellClient: vi.fn(),
}))

vi.mock('../utils/url.js', () => ({
  parseUrl: vi.fn(),
}))

// Mock console
const mockConsole = {
  log: vi.fn(),
  error: vi.fn(),
}

// Mock process.exit
const mockExit = vi.fn()

describe('inspectCommand', () => {
  let mockClient: Partial<MetatellClient>
  let eventHandlers: Record<string, ((payload?: unknown) => void)[]>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    eventHandlers = {}

    // Setup mocks
    global.console = mockConsole as Console
    global.process.exit = mockExit as typeof process.exit

    // Setup client mock
    mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getSessionId: vi.fn().mockReturnValue('inspect-session-123'),
      getUsers: vi.fn().mockReturnValue([
        { id: 'user1', name: 'Alice', isBot: false },
        { id: 'user2', name: 'Bob', isBot: false },
        { id: 'bot1', name: 'BotUser', isBot: true },
        { id: 'user3', name: null, isBot: false },
      ]),
      on: vi.fn((event, handler) => {
        if (!eventHandlers[event]) {
          eventHandlers[event] = []
        }
        eventHandlers[event].push(handler)
      }),
    }
  })

  afterEach(() => {
    // Restore console
    global.console = console
    vi.useRealTimers()
  })

  it('should inspect room and display detailed information', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    const url = 'https://metatell.app/test-room'
    const options = { token: 'test-token' }

    const inspectPromise = inspectCommand(url, options)

    // Wait for the promise to be set up, then advance timers
    await vi.waitFor(() => {
      expect(mockClient.connect).toHaveBeenCalled()
    })

    // Fast-forward timers and wait for all promises
    await vi.advanceTimersByTimeAsync(5000)

    await inspectPromise

    // Check parseUrl was called
    expect(parseUrl).toHaveBeenCalledWith(url)

    // Check client creation
    expect(createMetatellClient).toHaveBeenCalledWith({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
      token: 'test-token',
      username: 'MetatellInspector',
      debug: false,
    })

    // Check connection flow
    expect(mockClient.connect).toHaveBeenCalled()
    expect(mockClient.getSessionId).toHaveBeenCalled()
    expect(mockClient.getUsers).toHaveBeenCalled()
    expect(mockClient.disconnect).toHaveBeenCalled()

    // Check console output
    expect(mockConsole.log).toHaveBeenCalledWith('Inspecting room:', url)
    expect(mockConsole.log).toHaveBeenCalledWith('\n=== Room Information ===')
    expect(mockConsole.log).toHaveBeenCalledWith('Room ID:', 'test-room')
    expect(mockConsole.log).toHaveBeenCalledWith('Server:', 'wss://metatell.app')
    expect(mockConsole.log).toHaveBeenCalledWith('Session:', 'inspect-session-123')
    expect(mockConsole.log).toHaveBeenCalledWith('\n=== User Presence ===')
    expect(mockConsole.log).toHaveBeenCalledWith('Total users: 4')
    expect(mockConsole.log).toHaveBeenCalledWith('Humans: 3')
    expect(mockConsole.log).toHaveBeenCalledWith('Bots: 1')
    expect(mockConsole.log).toHaveBeenCalledWith('\nDetailed list:')
    expect(mockConsole.log).toHaveBeenCalledWith('  [Human] Alice (user1)')
    expect(mockConsole.log).toHaveBeenCalledWith('  [Human] Bob (user2)')
    expect(mockConsole.log).toHaveBeenCalledWith('  [Bot] BotUser (bot1)')
    expect(mockConsole.log).toHaveBeenCalledWith('  [Human] Anonymous (user3)')

    // Check activity monitoring
    expect(mockConsole.log).toHaveBeenCalledWith('\n=== Monitoring Activity (5 seconds) ===')
    expect(mockConsole.log).toHaveBeenCalledWith('Messages: 0')
    expect(mockConsole.log).toHaveBeenCalledWith('Users joined: 0')
    expect(mockConsole.log).toHaveBeenCalledWith('Users left: 0')

    // Check completion
    expect(mockConsole.log).toHaveBeenCalledWith('\n✓ Inspection complete')
    expect(mockExit).toHaveBeenCalledWith(0)
  })

  it('should count activity events during monitoring', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    const url = 'https://metatell.app/test-room'
    const options = {}

    const inspectPromise = inspectCommand(url, options)

    // Wait for connection
    await vi.waitFor(() => {
      expect(mockClient.connect).toHaveBeenCalled()
    })

    // Simulate events during monitoring
    setTimeout(() => {
      eventHandlers.message?.forEach((handler) => {
        handler()
      })
      eventHandlers.message?.forEach((handler) => {
        handler()
      })
      eventHandlers.message?.forEach((handler) => {
        handler()
      })
      eventHandlers['user-join']?.forEach((handler) => {
        handler()
      })
      eventHandlers['user-leave']?.forEach((handler) => {
        handler()
      })
      eventHandlers['user-leave']?.forEach((handler) => {
        handler()
      })
    }, 1000)

    // Fast-forward timers
    await vi.advanceTimersByTimeAsync(5000)

    await inspectPromise

    // Check activity counts
    expect(mockConsole.log).toHaveBeenCalledWith('Messages: 3')
    expect(mockConsole.log).toHaveBeenCalledWith('Users joined: 1')
    expect(mockConsole.log).toHaveBeenCalledWith('Users left: 2')
  })

  it('should handle empty room', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'empty-room',
    })

    mockClient.getUsers = vi.fn().mockReturnValue([])

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    const url = 'https://metatell.app/empty-room'
    const options = {}

    const inspectPromise = inspectCommand(url, options)

    await vi.waitFor(() => {
      expect(mockClient.connect).toHaveBeenCalled()
    })

    await vi.advanceTimersByTimeAsync(5000)

    await inspectPromise

    expect(mockConsole.log).toHaveBeenCalledWith('Total users: 0')
    expect(mockConsole.log).toHaveBeenCalledWith('Humans: 0')
    expect(mockConsole.log).toHaveBeenCalledWith('Bots: 0')
    expect(mockConsole.log).not.toHaveBeenCalledWith('\nDetailed list:')
  })

  it('should use environment token when not provided', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    process.env.METATELL_TOKEN = 'env-token'

    const url = 'https://metatell.app/test-room'
    const options = {}

    const inspectPromise = inspectCommand(url, options)

    await vi.waitFor(() => {
      expect(mockClient.connect).toHaveBeenCalled()
    })

    await vi.advanceTimersByTimeAsync(5000)
    await inspectPromise

    expect(createMetatellClient).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'env-token',
      }),
    )

    delete process.env.METATELL_TOKEN
  })

  it('should handle connection errors', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    const errorClient = {
      ...mockClient,
      connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
    }

    vi.mocked(createMetatellClient).mockReturnValue(errorClient as MetatellClient)

    const url = 'https://metatell.app/test-room'
    const options = {}

    await inspectCommand(url, options)

    expect(mockConsole.error).toHaveBeenCalledWith('Inspection failed:', expect.any(Error))
    expect(mockExit).toHaveBeenCalledWith(1)
  })
})
