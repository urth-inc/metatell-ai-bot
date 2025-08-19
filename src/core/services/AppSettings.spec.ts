import { describe, expect, it, vi } from 'vitest'
import { AppSettings } from './AppSettings.js'

describe('AppSettings', () => {
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
    const appSettings = new AppSettings(false)
    const callback = vi.fn()
    
    appSettings.onDebugModeChanged(callback)
    appSettings.setDebugMode(true)
    
    expect(callback).toHaveBeenCalledWith(true)
    expect(appSettings.debugMode).toBe(true)
    expect(appSettings.logLevel).toBe('debug')
  })

  it('should not notify when debug mode value is the same', () => {
    const appSettings = new AppSettings(true)
    const callback = vi.fn()
    
    appSettings.onDebugModeChanged(callback)
    appSettings.setDebugMode(true) // Same value
    
    expect(callback).not.toHaveBeenCalled()
  })

  it('should handle multiple callbacks', () => {
    const appSettings = new AppSettings(false)
    const callback1 = vi.fn()
    const callback2 = vi.fn()
    
    appSettings.onDebugModeChanged(callback1)
    appSettings.onDebugModeChanged(callback2)
    appSettings.setDebugMode(true)
    
    expect(callback1).toHaveBeenCalledWith(true)
    expect(callback2).toHaveBeenCalledWith(true)
  })

  it('should handle callback errors gracefully', () => {
    const appSettings = new AppSettings(false)
    const errorCallback = vi.fn(() => {
      throw new Error('Callback error')
    })
    const goodCallback = vi.fn()
    
    // Spy on console.error to verify error handling
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    appSettings.onDebugModeChanged(errorCallback)
    appSettings.onDebugModeChanged(goodCallback)
    appSettings.setDebugMode(true)
    
    expect(errorCallback).toHaveBeenCalledWith(true)
    expect(goodCallback).toHaveBeenCalledWith(true)
    expect(consoleSpy).toHaveBeenCalledWith('Error in debug mode callback:', expect.any(Error))
    
    consoleSpy.mockRestore()
  })

  it('should update log level when debug mode changes', () => {
    const appSettings = new AppSettings(false, 'warn')
    
    expect(appSettings.logLevel).toBe('warn')
    
    appSettings.setDebugMode(true)
    expect(appSettings.logLevel).toBe('debug')
    
    appSettings.setDebugMode(false)
    expect(appSettings.logLevel).toBe('info')
  })
})