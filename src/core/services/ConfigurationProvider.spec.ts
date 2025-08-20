import { beforeEach, describe, expect, it } from 'vitest'
import type { BotConfiguration } from '../interfaces/IConfigurationProvider.js'
import { ConfigurationProvider } from './ConfigurationProvider.js'

describe('ConfigurationProvider', () => {
  let provider: ConfigurationProvider
  let initialConfig: BotConfiguration

  beforeEach(() => {
    initialConfig = {
      apiUrl: 'https://metatell.app',
      retryAttempts: 3,
      authToken: 'test-token',
      profile: {
        displayName: 'TestBot',
        avatarColor: 'blue',
      },
    }
    provider = new ConfigurationProvider(initialConfig)
  })

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      const config = provider.getConfiguration()
      expect(config.apiUrl).toBe('https://metatell.app')
      expect(config.retryAttempts).toBe(3)
      expect(config.authToken).toBe('test-token')
    })

    it('should set default context if not provided', () => {
      const config = provider.getConfiguration()
      expect(config.context).toEqual({
        mobile: false,
        embed: false,
        hmd: false,
      })
    })

    it('should preserve provided context', () => {
      const configWithContext: BotConfiguration = {
        ...initialConfig,
        context: {
          mobile: true,
          embed: false,
          hmd: true,
        },
      }
      const providerWithContext = new ConfigurationProvider(configWithContext)
      const config = providerWithContext.getConfiguration()

      expect(config.context).toEqual({
        mobile: true,
        embed: false,
        hmd: true,
      })
    })
  })

  describe('get', () => {
    it('should retrieve top-level config values', () => {
      expect(provider.get<string>('apiUrl')).toBe('https://metatell.app')
      expect(provider.get<number>('retryAttempts')).toBe(3)
      expect(provider.get<string>('authToken')).toBe('test-token')
    })

    it('should retrieve nested config values', () => {
      expect(provider.get<string>('profile.displayName')).toBe('TestBot')
      expect(provider.get<string>('profile.avatarColor')).toBe('blue')
      expect(provider.get<boolean>('context.mobile')).toBe(false)
    })

    it('should return undefined for non-existent keys', () => {
      expect(provider.get('nonexistent')).toBeUndefined()
      expect(provider.get('profile.nonexistent')).toBeUndefined()
      expect(provider.get('nonexistent.nested.deep')).toBeUndefined()
    })

    // Removed test - set method no longer exists
  })

  // Removed set tests - set method no longer exists

  describe('getConfiguration', () => {
    it('should return a copy of the configuration', () => {
      const config1 = provider.getConfiguration()
      const config2 = provider.getConfiguration()

      expect(config1).toEqual(config2)
      expect(config1).not.toBe(config2) // Different object references
    })

    // Removed test - custom settings no longer supported
  })

  // Removed updateProfile tests - configuration is now immutable

  // Removed updateContext tests - configuration is now immutable
})
