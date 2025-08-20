import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MetatellBot } from './MetatellBot.js'
import { registerLoggerProvider, DefaultLoggerProvider, type BotConfiguration } from '@metatell/sdk'
import { BotServiceFactory } from './BotServiceFactory.js'

// Register logger provider for tests
registerLoggerProvider(new DefaultLoggerProvider(), { allowOverwrite: true })

describe('BotServiceFactory', () => {
  let factory: BotServiceFactory
  let config: BotConfiguration

  beforeEach(() => {
    config = {
      authUrl: 'wss://example.com',
      hubUrl: 'https://example.com/hub',
      hubId: 'test-hub',
      profile: {
        displayName: 'TestBot',
        avatarId: 'test-avatar',
      },
    }

    factory = new BotServiceFactory(config)
  })

  describe('constructor', () => {
    it('should create factory with configuration', () => {
      expect(factory).toBeDefined()
    })

    it('should extend CoreServiceFactory', () => {
      // Check that core services are available
      const configProvider = factory.getService('IConfigurationProvider')
      expect(configProvider).toBeDefined()
      
      const eventBus = factory.getService('IEventBus')
      expect(eventBus).toBeDefined()
    })
  })

  describe('createBot', () => {
    it('should create MetatellBot instance', () => {
      const bot = factory.createBot()
      
      expect(bot).toBeDefined()
      expect(bot).toBeInstanceOf(MetatellBot)
    })

    it('should create singleton MetatellBot', () => {
      const bot1 = factory.createBot()
      const bot2 = factory.createBot()
      
      expect(bot1).toBe(bot2)
    })
  })

  describe('service registration', () => {
    it('should register MetatellBot service', () => {
      const bot = factory.getService('MetatellBot')
      
      expect(bot).toBeDefined()
      expect(bot).toBeInstanceOf(MetatellBot)
    })

    it('should provide bot with all required dependencies', () => {
      const bot = factory.createBot()
      
      // Bot should be properly initialized
      // We can't easily test internal dependencies without exposing them,
      // but we can verify the bot was created successfully
      expect(bot).toBeDefined()
      expect(bot.addMessageHandler).toBeDefined()
      expect(bot.start).toBeDefined()
      expect(bot.stop).toBeDefined()
    })
  })

  describe('configuration', () => {
    it('should pass configuration to core services', () => {
      const configProvider = factory.getService('IConfigurationProvider')
      const actualConfig = configProvider.getConfiguration()
      
      expect(actualConfig.authUrl).toBe(config.authUrl)
      expect(actualConfig.hubUrl).toBe(config.hubUrl)
      expect(actualConfig.hubId).toBe(config.hubId)
      expect(actualConfig.profile).toEqual(config.profile)
    })
  })
})