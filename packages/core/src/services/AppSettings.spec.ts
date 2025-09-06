import { describe, expect, it, vi } from 'vitest'
import { AppSettings } from './AppSettings.js'

// Mock logger
const mockLogger = {
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}

vi.mock('../logging/index.js', () => ({
  getLogger: vi.fn(() => mockLogger),
  getLoggerProvider: vi.fn(() => ({
    setMinLevel: vi.fn(),
  })),
  registerLoggerProvider: vi.fn(),
  DefaultLoggerProvider: vi.fn(),
  setLogLevel: vi.fn(),
}))

describe('AppSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with default values', () => {
    const appSettings = new AppSettings()

    expect(appSettings.debugMode).toBe(false)
    expect(appSettings.logLevel).toBe('info')
  })

  it('should initialize with custom values', () => {
    const appSettings = new AppSettings(true, 'debug')

    expect(appSettings.debugMode).toBe(true)
    expect(appSettings.logLevel).toBe('debug')
  })

  it('should notify when debug mode changes', () => {
    const appSettings = new AppSettings()
    const callback = vi.fn()

    appSettings.onDebugModeChanged(callback)
    appSettings.setDebugMode(true)

    expect(callback).toHaveBeenCalledWith(true)
  })

  it('should not notify when debug mode value is the same', () => {
    const appSettings = new AppSettings(false)
    const callback = vi.fn()

    appSettings.onDebugModeChanged(callback)
    appSettings.setDebugMode(false)

    expect(callback).not.toHaveBeenCalled()
  })

  it('should handle multiple callbacks', () => {
    const appSettings = new AppSettings()
    const callback1 = vi.fn()
    const callback2 = vi.fn()

    appSettings.onDebugModeChanged(callback1)
    appSettings.onDebugModeChanged(callback2)
    appSettings.setDebugMode(true)

    expect(callback1).toHaveBeenCalledWith(true)
    expect(callback2).toHaveBeenCalledWith(true)
  })

  it('should handle callback errors gracefully', () => {
    const appSettings = new AppSettings()
    const errorCallback = vi.fn(() => {
      throw new Error('Callback error')
    })
    const goodCallback = vi.fn()

    appSettings.onDebugModeChanged(errorCallback)
    appSettings.onDebugModeChanged(goodCallback)
    appSettings.setDebugMode(true)

    expect(errorCallback).toHaveBeenCalledWith(true)
    expect(goodCallback).toHaveBeenCalledWith(true)
    expect(mockLogger.error).toHaveBeenCalledWith('Error in debug mode callback', {
      error: expect.any(Error),
    })
  })

  it('should allow manual log level changes via setLogLevel', () => {
    const appSettings = new AppSettings(false, 'warn')

    expect(appSettings.logLevel).toBe('warn')

    // Log level can now be changed independently of debug mode
    appSettings.setLogLevel('debug')
    expect(appSettings.logLevel).toBe('debug')
    expect(appSettings.debugMode).toBe(false) // Debug mode unchanged

    appSettings.setLogLevel('error')
    expect(appSettings.logLevel).toBe('error')
  })

  it('should demonstrate responsibility separation between debug mode and log level', () => {
    const appSettings = new AppSettings()
    const callback = vi.fn()

    appSettings.onDebugModeChanged(callback)

    // Changing log level does not trigger debug mode callbacks
    appSettings.setLogLevel('debug')
    expect(callback).not.toHaveBeenCalled()

    // Debug mode is independent of log level
    appSettings.setDebugMode(true)
    expect(callback).toHaveBeenCalledWith(true)
    expect(appSettings.logLevel).toBe('debug') // Still at debug level

    // Can have debug log level without debug mode
    appSettings.setDebugMode(false)
    appSettings.setLogLevel('debug')
    expect(appSettings.debugMode).toBe(false)
    expect(appSettings.logLevel).toBe('debug')
  })
})
