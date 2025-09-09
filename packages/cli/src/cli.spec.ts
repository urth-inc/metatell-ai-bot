/**
 * Test for CLI entry point
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock modules
vi.mock('./commands/connect.js', () => ({
  connectCommand: vi.fn(),
}))

vi.mock('./commands/inspect.js', () => ({
  inspectCommand: vi.fn(),
}))

vi.mock('./commands/interactive.js', () => ({
  startInteractiveMode: vi.fn(),
}))

// Mock commander
const createMockProgram = () => {
  const program = {
    name: vi.fn().mockReturnThis(),
    description: vi.fn().mockReturnThis(),
    version: vi.fn().mockReturnThis(),
    command: vi.fn().mockReturnThis(),
    alias: vi.fn().mockReturnThis(),
    option: vi.fn().mockReturnThis(),
    action: vi.fn().mockReturnThis(),
    arguments: vi.fn().mockReturnThis(),
    parse: vi.fn().mockReturnThis(),
  }
  return program
}

let mockProgram: ReturnType<typeof createMockProgram> | null

vi.mock('commander', () => ({
  Command: vi.fn(() => {
    mockProgram = createMockProgram()
    return mockProgram
  }),
}))

// Mock file system operations for version reading
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => JSON.stringify({ version: '0.0.5' })),
}))

vi.mock('node:url', () => ({
  fileURLToPath: vi.fn(() => '/path/to/cli.js'),
}))

vi.mock('node:path', () => ({
  dirname: vi.fn(() => '/path/to'),
  join: vi.fn(() => '/path/to/package.json'),
}))

describe('CLI', () => {
  let originalArgv: string[]

  beforeEach(() => {
    vi.clearAllMocks()
    originalArgv = process.argv
    mockProgram = null
    // Reset modules to ensure clean import
    vi.resetModules()
  })

  afterEach(() => {
    process.argv = originalArgv
  })

  it('should set up basic program information', async () => {
    // Import the module to trigger setup
    await import('./cli.js')

    expect(mockProgram).toBeDefined()
    expect(mockProgram.name).toHaveBeenCalledWith('metatell-bot')
    expect(mockProgram.description).toHaveBeenCalledWith(
      'CLI tool for Metatell bot development and testing',
    )
    expect(mockProgram.version).toHaveBeenCalledWith('0.0.5')
  })

  it('should register all commands and options', async () => {
    await import('./cli.js')

    // Check command registrations
    const commandCalls = mockProgram.command.mock.calls
    expect(commandCalls).toContainEqual(['connect <url>'])
    expect(commandCalls).toContainEqual(['inspect <url>'])
    expect(commandCalls).toContainEqual(['interactive <url>'])

    // Check option registrations
    const optionCalls = mockProgram.option.mock.calls
    expect(optionCalls).toContainEqual(['-t, --token <token>', 'Authentication token'])
    expect(optionCalls).toContainEqual(['-d, --debug', 'Enable debug logging'])
    expect(optionCalls).toContainEqual(['-n, --name <name>', 'Bot display name', 'MetatellCLI'])

    // Check other calls
    expect(mockProgram.alias).toHaveBeenCalledWith('i')
    expect(mockProgram.arguments).toHaveBeenCalledWith('<url>')
    expect(mockProgram.parse).toHaveBeenCalled()
  })

  it('should register action handlers', async () => {
    await import('./cli.js')

    // There should be 4 action calls (3 commands + 1 default)
    expect(mockProgram.action.mock.calls.length).toBe(4)

    // Each action should have a function handler
    mockProgram.action.mock.calls.forEach((call) => {
      expect(typeof call[0]).toBe('function')
    })
  })

  it('should handle connect command', async () => {
    const { connectCommand } = await import('./commands/connect.js')
    await import('./cli.js')

    // Get the first action handler (connect command)
    const connectHandler = mockProgram.action.mock.calls[0][0]

    const url = 'https://example.com/room'
    const options = { token: 'test-token', debug: true }

    await connectHandler(url, options)

    expect(connectCommand).toHaveBeenCalledWith(url, options)
  })

  it('should handle inspect command', async () => {
    const { inspectCommand } = await import('./commands/inspect.js')
    await import('./cli.js')

    // Get the second action handler (inspect command)
    const inspectHandler = mockProgram.action.mock.calls[1][0]

    const url = 'https://example.com/room'
    const options = { token: 'test-token' }

    await inspectHandler(url, options)

    expect(inspectCommand).toHaveBeenCalledWith(url, options)
  })

  it('should handle interactive command', async () => {
    const { startInteractiveMode } = await import('./commands/interactive.js')
    await import('./cli.js')

    // Get the third action handler (interactive command)
    const interactiveHandler = mockProgram.action.mock.calls[2][0]

    const url = 'https://example.com/room'
    const options = { token: 'test-token', name: 'TestBot', debug: false }

    await interactiveHandler(url, options)

    expect(startInteractiveMode).toHaveBeenCalledWith(url, options)
  })

  it('should handle default command', async () => {
    const { startInteractiveMode } = await import('./commands/interactive.js')
    await import('./cli.js')

    // Get the last action handler (default command)
    const defaultHandler = mockProgram.action.mock.calls[3][0]

    const url = 'https://example.com/room'
    const options = { token: 'test-token', name: 'TestBot', debug: false }

    await defaultHandler(url, options)

    expect(startInteractiveMode).toHaveBeenCalledWith(url, options)
  })

  describe('version handling', () => {
    it('should read version from package.json', async () => {
      const fs = await import('node:fs')
      await import('./cli.js')

      // readFileSyncが呼ばれたことを確認
      expect(fs.readFileSync).toHaveBeenCalled()
      expect(mockProgram.version).toHaveBeenCalledWith('0.0.5')
    })

    it('should use correct path resolution for package.json', async () => {
      const path = await import('node:path')
      const url = await import('node:url')

      await import('./cli.js')

      // パス解決が正しく行われたことを確認
      expect(url.fileURLToPath).toHaveBeenCalled()
      expect(path.dirname).toHaveBeenCalled()
      expect(path.join).toHaveBeenCalled()
    })
  })
})
