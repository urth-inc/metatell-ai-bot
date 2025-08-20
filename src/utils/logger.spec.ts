import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConsoleLogger } from './logger.js'
import { registerLoggerProvider, resetLoggerProvider, type LoggerProvider } from '../sdk/logging/spi.js'

describe('ConsoleLogger.setDebugMode()', () => {
  let mockProvider: LoggerProvider
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Create a mock provider
    mockProvider = {
      getLogger: vi.fn().mockReturnValue({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }),
      setMinLevel: vi.fn(),
      enableConsole: vi.fn(),
    }
    
    // Register the mock provider
    registerLoggerProvider(mockProvider, { allowOverwrite: true })
    
    // Spy on console.log for debug mode messages
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    resetLoggerProvider()
  })

  it('should update provider minimum level when debug mode is enabled', () => {
    const logger = new ConsoleLogger()
    
    // Notify CLI started so it shows debug messages
    logger.notifyCliStarted()
    
    // Enable debug mode
    logger.setDebugMode(true)
    
    // Should call provider.setMinLevel with 'debug'
    expect(mockProvider.setMinLevel).toHaveBeenCalledWith('debug')
    expect(consoleSpy).toHaveBeenCalledWith('🐛 Debug logging enabled')
  })

  it('should update provider minimum level when debug mode is disabled', () => {
    const logger = new ConsoleLogger()
    
    // Notify CLI started
    logger.notifyCliStarted()
    
    // Start with debug enabled
    logger.setDebugMode(true)
    vi.clearAllMocks()
    
    // Disable debug mode
    logger.setDebugMode(false)
    
    // Should call provider.setMinLevel with 'info'
    expect(mockProvider.setMinLevel).toHaveBeenCalledWith('info')
    expect(consoleSpy).toHaveBeenCalledWith('🐛 Debug logging disabled')
  })

  it('should handle missing provider gracefully', () => {
    resetLoggerProvider() // Remove provider
    
    const logger = new ConsoleLogger()
    logger.notifyCliStarted()
    
    // Should not throw when provider is missing
    expect(() => {
      logger.setDebugMode(true)
    }).not.toThrow()
    
    // Should still show the debug message
    expect(consoleSpy).toHaveBeenCalledWith('🐛 Debug logging enabled')
  })

  it('should handle provider without setMinLevel gracefully', () => {
    // Provider without setMinLevel
    const minimalProvider: LoggerProvider = {
      getLogger: vi.fn().mockReturnValue({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }),
    }
    
    registerLoggerProvider(minimalProvider, { allowOverwrite: true })
    
    const logger = new ConsoleLogger()
    logger.notifyCliStarted()
    
    // Should not throw when setMinLevel is missing
    expect(() => {
      logger.setDebugMode(true)
    }).not.toThrow()
  })
})