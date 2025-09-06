/**
 * Test for interactive command
 */

import type { MetatellClient } from '@metatell/bot-sdk'
import { beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest'
import { startInteractiveMode } from './interactive.js'

// Mock modules
vi.mock('@metatell/bot-sdk', () => ({
  createMetatellClient: vi.fn(),
}))

vi.mock('../utils/url.js', () => ({
  parseUrl: vi.fn(),
}))

vi.mock('../utils/commands.js', () => ({
  CommandParser: vi.fn(() => ({
    execute: vi.fn(),
  })),
}))

// Mock readline
interface MockReadline {
  on: ReturnType<typeof vi.fn>
  prompt: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

let mockRlInstance: MockReadline

vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => mockRlInstance),
}))

// Mock console
const mockConsole = {
  log: vi.fn(),
  error: vi.fn(),
}

// Mock process
const mockExit = vi.fn()
let processListeners: Record<string, (() => void)[]> = {}

describe('startInteractiveMode', () => {
  let mockClient: Partial<MetatellClient>
  let clientEventHandlers: Record<string, ((payload?: unknown) => void)[]>

  beforeEach(() => {
    vi.clearAllMocks()
    clientEventHandlers = {}
    processListeners = {}

    // Setup mocks
    global.console = mockConsole as Console
    global.process.exit = mockExit as typeof process.exit
    global.process.on = vi.fn((event, handler) => {
      if (!processListeners[event]) {
        processListeners[event] = []
      }
      processListeners[event].push(handler)
    }) as typeof process.on

    // Setup readline mock
    mockRlInstance = {
      on: vi.fn(),
      prompt: vi.fn(),
      close: vi.fn(),
    }

    // Setup client mock
    mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getSessionId: vi.fn().mockReturnValue('interactive-session-123'),
      getInfo: vi.fn().mockResolvedValue({
        name: 'TestBot',
        version: '1.0.0',
        roomId: 'test-room',
        sessionId: 'interactive-session-123',
      }),
      on: vi.fn((event, handler) => {
        if (!clientEventHandlers[event]) {
          clientEventHandlers[event] = []
        }
        clientEventHandlers[event].push(handler)
      }),
      chat: {
        send: vi.fn().mockResolvedValue(undefined),
        onMessage: vi.fn(),
      },
    }
  })

  afterEach(() => {
    // Restore console
    global.console = console
  })

  it('should start interactive mode successfully', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    const url = 'https://metatell.app/test-room'
    const options = { token: 'test-token', name: 'TestBot', debug: true }

    await startInteractiveMode(url, options)

    // Check client creation
    expect(createMetatellClient).toHaveBeenCalledWith({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
      token: 'test-token',
      username: 'TestBot',
      debug: true,
    })

    // Check connection
    expect(mockClient.connect).toHaveBeenCalled()
    expect(mockClient.getInfo).toHaveBeenCalled()

    // Check initial output
    expect(mockConsole.log).toHaveBeenCalledWith('Starting interactive mode...')
    expect(mockConsole.log).toHaveBeenCalledWith('Connected to room:', 'test-room')
    expect(mockConsole.log).toHaveBeenCalledWith('Session ID:', 'interactive-session-123')
    expect(mockConsole.log).toHaveBeenCalledWith('Commands: /help for list of commands')

    // Check readline setup
    expect(mockRlInstance.on).toHaveBeenCalledWith('line', expect.any(Function))
    expect(mockRlInstance.on).toHaveBeenCalledWith('close', expect.any(Function))
    expect(mockRlInstance.prompt).toHaveBeenCalled()

    // Check process handler
    expect(global.process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function))
  })

  it('should handle connected event', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    await startInteractiveMode('https://metatell.app/test-room', {})

    // Trigger connected event
    clientEventHandlers.connected?.forEach((handler) => {
      handler()
    })

    expect(mockConsole.log).toHaveBeenCalledWith('[Connected]')
  })

  it('should handle disconnected event', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    await startInteractiveMode('https://metatell.app/test-room', {})

    // Trigger disconnected event
    clientEventHandlers.disconnected?.forEach((handler) => {
      handler('Network error')
    })

    expect(mockConsole.log).toHaveBeenCalledWith('[Disconnected]', 'Network error')

    // Test without reason
    clientEventHandlers.disconnected?.forEach((handler) => {
      handler()
    })
    expect(mockConsole.log).toHaveBeenCalledWith('[Disconnected]', 'Connection closed')
  })

  it('should handle chat messages', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    await startInteractiveMode('https://metatell.app/test-room', { debug: true })

    // Trigger chat-message event
    const message = {
      from: { id: 'user1', name: 'Alice', isBot: false },
      text: 'Hello everyone!',
      mention: null,
    }
    clientEventHandlers['chat-message']?.forEach((handler) => {
      handler(message)
    })

    expect(mockConsole.log).toHaveBeenCalledWith('[Chat] Alice: Hello everyone!')
    expect(mockConsole.log).toHaveBeenCalledWith('[Debug] Sender ID: user1')
  })

  it('should handle chat messages with mentions', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    await startInteractiveMode('https://metatell.app/test-room', {})

    // Trigger chat-message event with mention
    const message = {
      from: { id: 'user1', name: 'Alice', isBot: false },
      text: 'Hey bot!',
      mention: { name: 'TestBot', sessionId: 'bot-session' },
    }
    clientEventHandlers['chat-message']?.forEach((handler) => {
      handler(message)
    })

    expect(mockConsole.log).toHaveBeenCalledWith('[Chat] Alice: Hey bot! (mentions @TestBot)')
  })

  it('should respond to mentions', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    await startInteractiveMode('https://metatell.app/test-room', {})

    // Get the onMessage handler
    const onMessageHandler = (
      mockClient.chat.onMessage as MockedFunction<typeof mockClient.chat.onMessage>
    ).mock.calls[0][0]

    // Create reply mock
    const replyMock = vi.fn().mockResolvedValue(undefined)

    // Test mention handling
    const event = {
      from: { id: 'user1', name: 'Alice' },
      text: 'Hello bot!',
      mention: { sessionId: 'interactive-session-123', name: 'TestBot' },
      reply: replyMock,
    }

    await onMessageHandler(event)

    expect(mockConsole.log).toHaveBeenCalledWith('[Mentioned by Alice] Hello bot!')
    expect(replyMock).toHaveBeenCalledWith('Hello Alice! You said: "Hello bot!"')
  })

  it('should handle user join/leave events', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    await startInteractiveMode('https://metatell.app/test-room', {})

    // Test user join
    const joiningUser = { id: 'user2', name: 'Bob', isBot: false }
    clientEventHandlers['user-join']?.forEach((handler) => {
      handler(joiningUser)
    })
    expect(mockConsole.log).toHaveBeenCalledWith('[User joined]', 'Bob', '(user2)')

    // Test user leave
    const leavingUser = { id: 'user3', name: null, isBot: false }
    clientEventHandlers['user-leave']?.forEach((handler) => {
      handler(leavingUser)
    })
    expect(mockConsole.log).toHaveBeenCalledWith('[User left]', 'Anonymous', '(user3)')
  })

  it('should handle regular message input', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    await startInteractiveMode('https://metatell.app/test-room', {})

    // Get the line handler
    const lineHandler = mockRlInstance.on.mock.calls.find(
      (call: [string, unknown]) => call[0] === 'line',
    )?.[1]

    // Test sending message
    await lineHandler('Hello world!')

    expect(mockClient.chat.send).toHaveBeenCalledWith('Hello world!')
    expect(mockConsole.log).toHaveBeenCalledWith('[Sent] Hello world!')
    expect(mockRlInstance.prompt).toHaveBeenCalled()
  })

  it('should handle command input', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')
    const { CommandParser } = await import('../utils/commands.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    const mockParser = {
      execute: vi.fn().mockResolvedValue({ success: true }),
    }
    vi.mocked(CommandParser).mockReturnValue(mockParser as ReturnType<typeof CommandParser>)

    await startInteractiveMode('https://metatell.app/test-room', {})

    const lineHandler = mockRlInstance.on.mock.calls.find(
      (call: [string, unknown]) => call[0] === 'line',
    )?.[1]

    // Test command
    await lineHandler('/help')

    expect(mockParser.execute).toHaveBeenCalledWith('/help', mockClient)
    expect(mockRlInstance.prompt).toHaveBeenCalled()
  })

  it('should handle quit command', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    await startInteractiveMode('https://metatell.app/test-room', {})

    const lineHandler = mockRlInstance.on.mock.calls.find(
      (call: [string, unknown]) => call[0] === 'line',
    )?.[1]

    // Test quit
    await lineHandler('quit')

    expect(mockRlInstance.close).toHaveBeenCalled()

    // Test exit
    await lineHandler('exit')
    expect(mockRlInstance.close).toHaveBeenCalledTimes(2)
  })

  it('should handle readline close event', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    await startInteractiveMode('https://metatell.app/test-room', {})

    const closeHandler = mockRlInstance.on.mock.calls.find(
      (call: [string, unknown]) => call[0] === 'close',
    )?.[1]

    await closeHandler()

    expect(mockConsole.log).toHaveBeenCalledWith('\nShutting down...')
    expect(mockClient.disconnect).toHaveBeenCalled()
    expect(mockExit).toHaveBeenCalledWith(0)
  })

  it('should handle SIGINT', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    await startInteractiveMode('https://metatell.app/test-room', {})

    // Trigger SIGINT
    processListeners.SIGINT?.forEach((handler) => {
      handler()
    })

    expect(mockRlInstance.close).toHaveBeenCalled()
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

    await startInteractiveMode('https://metatell.app/test-room', {})

    expect(mockConsole.error).toHaveBeenCalledWith(
      'Failed to start interactive mode:',
      expect.any(Error),
    )
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('should use default values when options not provided', async () => {
    const { createMetatellClient } = await import('@metatell/bot-sdk')
    const { parseUrl } = await import('../utils/url.js')

    vi.mocked(parseUrl).mockReturnValue({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
    })

    vi.mocked(createMetatellClient).mockReturnValue(mockClient as MetatellClient)

    process.env.METATELL_TOKEN = 'env-token'

    await startInteractiveMode('https://metatell.app/test-room', {})

    expect(createMetatellClient).toHaveBeenCalledWith({
      serverUrl: 'wss://metatell.app',
      roomId: 'test-room',
      token: 'env-token',
      username: 'MetatellCLI',
      debug: undefined,
    })

    delete process.env.METATELL_TOKEN
  })
})
