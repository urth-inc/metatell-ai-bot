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

    it('should prioritize custom settings over config', () => {
      provider.set('apiUrl', 'https://custom.app')
      expect(provider.get<string>('apiUrl')).toBe('https://custom.app')
    })
  })

  describe('set', () => {
    it('should store custom settings', () => {
      provider.set('customKey', 'customValue')
      expect(provider.get<string>('customKey')).toBe('customValue')
    })

    it('should override existing config values in custom settings', () => {
      expect(provider.get<string>('apiUrl')).toBe('https://metatell.app')

      provider.set('apiUrl', 'https://new.app')
      expect(provider.get<string>('apiUrl')).toBe('https://new.app')

      // Original config should remain unchanged
      const config = provider.getConfiguration()
      expect(config.apiUrl).toBe('https://metatell.app')
    })

    it('should handle different value types', () => {
      provider.set('stringValue', 'test')
      provider.set('numberValue', 42)
      provider.set('booleanValue', true)
      provider.set('objectValue', { nested: 'value' })
      provider.set('arrayValue', [1, 2, 3])

      expect(provider.get<string>('stringValue')).toBe('test')
      expect(provider.get<number>('numberValue')).toBe(42)
      expect(provider.get<boolean>('booleanValue')).toBe(true)
      expect(provider.get<{ nested: string }>('objectValue')).toEqual({ nested: 'value' })
      expect(provider.get<number[]>('arrayValue')).toEqual([1, 2, 3])
    })
  })

  describe('getConfiguration', () => {
    it('should return a copy of the configuration', () => {
      const config1 = provider.getConfiguration()
      const config2 = provider.getConfiguration()

      expect(config1).toEqual(config2)
      expect(config1).not.toBe(config2) // Different object references
    })

    it('should not include custom settings in configuration', () => {
      provider.set('customKey', 'customValue')
      const config = provider.getConfiguration()

      expect('customKey' in config).toBe(false)
    })
  })

  describe('updateProfile', () => {
    it('should update profile partially', () => {
      provider.updateProfile({ displayName: 'UpdatedBot' })

      const config = provider.getConfiguration()
      expect(config.profile?.displayName).toBe('UpdatedBot')
      expect(config.profile?.avatarColor).toBe('blue') // Original value preserved
    })

    it('should create profile if not exists', () => {
      const providerNoProfile = new ConfigurationProvider({ apiUrl: 'test' })
      providerNoProfile.updateProfile({ displayName: 'NewBot' })

      const config = providerNoProfile.getConfiguration()
      expect(config.profile?.displayName).toBe('NewBot')
    })

    it('should handle multiple profile updates', () => {
      provider.updateProfile({ displayName: 'Bot1' })
      provider.updateProfile({ avatarColor: 'red' })
      provider.updateProfile({ displayName: 'Bot2' })

      const config = provider.getConfiguration()
      expect(config.profile?.displayName).toBe('Bot2')
      expect(config.profile?.avatarColor).toBe('red')
    })
  })

  describe('updateContext', () => {
    it('should update context partially', () => {
      provider.updateContext({ mobile: true })

      const config = provider.getConfiguration()
      expect(config.context?.mobile).toBe(true)
      expect(config.context?.embed).toBe(false) // Default value preserved
      expect(config.context?.hmd).toBe(false) // Default value preserved
    })

    it('should preserve existing context values', () => {
      provider.updateContext({ mobile: true })
      provider.updateContext({ embed: true })

      const config = provider.getConfiguration()
      expect(config.context?.mobile).toBe(true)
      expect(config.context?.embed).toBe(true)
      expect(config.context?.hmd).toBe(false)
    })

    it('should handle context update when context is initially undefined', () => {
      const providerNoContext = new ConfigurationProvider({ apiUrl: 'test' })

      // First, let's verify context is created with defaults
      const initialConfig = providerNoContext.getConfiguration()
      expect(initialConfig.context).toEqual({
        mobile: false,
        embed: false,
        hmd: false,
      })

      // Now update context
      providerNoContext.updateContext({ mobile: true })

      const config = providerNoContext.getConfiguration()
      expect(config.context).toEqual({
        mobile: true,
        embed: false,
        hmd: false,
      })
    })

    it('should handle all context properties', () => {
      provider.updateContext({
        mobile: true,
        embed: true,
        hmd: true,
      })

      const config = provider.getConfiguration()
      expect(config.context).toEqual({
        mobile: true,
        embed: true,
        hmd: true,
      })
    })
  })
})
