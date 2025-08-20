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
    // setDebugMode no longer changes logLevel directly (responsibility separation)
    expect(appSettings.logLevel).toBe('info')
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
    const appSettings = new AppSettings(false, 'info')
    let callbackInvoked = false
    
    // Set up callback to simulate external log level management (like in main.ts)
    appSettings.onDebugModeChanged((enabled) => {
      callbackInvoked = true
      // External code is responsible for setting log level based on debug mode
      appSettings.setLogLevel(enabled ? 'debug' : 'info')
    })
    
    expect(appSettings.logLevel).toBe('info')
    expect(callbackInvoked).toBe(false)
    
    // Change debug mode - this should trigger callback, not directly change log level
    appSettings.setDebugMode(true)
    
    expect(callbackInvoked).toBe(true)
    expect(appSettings.debugMode).toBe(true)
    expect(appSettings.logLevel).toBe('debug') // Changed by callback, not setDebugMode
  })
})