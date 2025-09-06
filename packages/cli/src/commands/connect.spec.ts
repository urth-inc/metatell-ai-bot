/**
 * Test for connect command
 */

import type { MetatellClient } from '@metatell/bot-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { connectCommand } from './connect.js'

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

describe('connectCommand', () => {
  let mockClient: Partial<MetatellClient>

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mocks
    global.console = mockConsole as Console
    global.process.exit = mockExit as typeof process.exit

    // Setup client mock
    mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getSessionId: vi.fn().mockReturnValue('test-session-123'),
      getStatus: vi.fn().mockReturnValue({ connected: true, connecting: false }),
      getUsers: vi.fn().mockReturnValue([
        { id: 'user1', name: 'Alice', isBot: false },
        { id: 'user2', name: 'BotUser', isBot: true },
        { id: 'user3', name: null, isBot: false },
      ]),
    }
  })

  afterEach(() => {
    // Restore console
    global.console = console
  })

  it('should connect successfully and display information', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    const url = 'https://metatell.app/test-room'
    const options = { token: 'test-token', debug: true }

    await connectCommand(url, options)

    // Check parseUrl was called
    expect(parseUrl).toHaveBeenCalledWith(url)

    // Check client creation
    expect(createMetatellClient).toHaveBeenCalledWith({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
      token: 'test-token',
      username: 'MetatellCLI',
      debug: true,
    })

    // Check connection flow
    expect(mockClient.connect).toHaveBeenCalled()
    expect(mockClient.getSessionId).toHaveBeenCalled()
    expect(mockClient.getStatus).toHaveBeenCalled()
    expect(mockClient.getUsers).toHaveBeenCalled()
    expect(mockClient.disconnect).toHaveBeenCalled()

    // Check console output
    expect(mockConsole.log).toHaveBeenCalledWith('Connecting to:', url)
    expect(mockConsole.log).toHaveBeenCalledWith('✓ Connected successfully!')
    expect(mockConsole.log).toHaveBeenCalledWith('Session ID:', 'test-session-123')
    expect(mockConsole.log).toHaveBeenCalledWith('Status:', { connected: true, connecting: false })
    expect(mockConsole.log).toHaveBeenCalledWith('\nUsers in room: 3')
    expect(mockConsole.log).toHaveBeenCalledWith('- Alice (user1)')
    expect(mockConsole.log).toHaveBeenCalledWith('- BotUser (user2) [Bot]')
    expect(mockConsole.log).toHaveBeenCalledWith('- Anonymous (user3)')
    expect(mockConsole.log).toHaveBeenCalledWith('\n✓ Disconnected successfully')

    // Check successful exit
    expect(mockExit).toHaveBeenCalledWith(0)
  })

  it('should use environment token when option not provided', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    // Set environment variable
    process.env.METATELL_TOKEN = 'env-token'

    const url = 'https://metatell.app/test-room'
    const options = { debug: false }

    await connectCommand(url, options)

    expect(createMetatellClient).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'env-token',
      }),
    )

    // Clean up
    delete process.env.METATELL_TOKEN
  })

  it('should use empty token when neither option nor env provided', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    const url = 'https://metatell.app/test-room'
    const options = {}

    await connectCommand(url, options)

    expect(createMetatellClient).toHaveBeenCalledWith(
      expect.objectContaining({
        token: '',
      }),
    )
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
    const options = { token: 'test-token' }

    await connectCommand(url, options)

    expect(mockConsole.error).toHaveBeenCalledWith('Connection failed:', expect.any(Error))
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('should handle URL parsing errors', async () => {
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockImplementation(() => {
      throw new Error('Invalid URL')
    })

    const url = 'invalid-url'
    const options = {}

    await connectCommand(url, options)

    expect(mockConsole.error).toHaveBeenCalledWith('Connection failed:', expect.any(Error))
    expect(mockExit).toHaveBeenCalledWith(1)
  })
})
