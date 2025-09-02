import {
  type BotConfiguration,
  ConfigurationProvider,
  DefaultLoggerProvider,
  EventBus,
  registerLoggerProvider,
} from '@metatell/sdk'
import { beforeEach, describe, expect, it } from 'vitest'
import { BotServiceFactory } from './BotServiceFactory.js'
import { MetatellBot } from './MetatellBot.js'

// Register logger provider for tests
registerLoggerProvider(new DefaultLoggerProvider(), { allowOverwrite: true })

describe('BotServiceFactory', () => {
  let factory: BotServiceFactory
  let config: BotConfiguration

  beforeEach(() => {
    config = {
      serverUrl: 'wss://example.com',
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
      const configProvider = factory.getService(ConfigurationProvider)
      expect(configProvider).toBeDefined()

      const eventBus = factory.getService(EventBus)
      expect(eventBus).toBeDefined()
    })
  })

  describe('service container', () => {
    it('should create MetatellBot instance from container', () => {
      const bot = factory.getService(MetatellBot)

      expect(bot).toBeDefined()
      expect(bot).toBeInstanceOf(MetatellBot)
    })

    it('should create singleton MetatellBot', () => {
      const bot1 = factory.getService(MetatellBot)
      const bot2 = factory.getService(MetatellBot)

      expect(bot1).toBe(bot2)
    })

    it('should expose container for main.ts', () => {
      const container = factory.getContainer()
      expect(container).toBeDefined()

      const bot = container.get(MetatellBot)
      expect(bot).toBeInstanceOf(MetatellBot)
    })
  })

  describe('service registration', () => {
    it('should register MetatellBot service', () => {
      const bot = factory.getService(MetatellBot)

      expect(bot).toBeDefined()
      expect(bot).toBeInstanceOf(MetatellBot)
    })

    it('should provide bot with all required dependencies', () => {
      const bot = factory.getService(MetatellBot)

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
      const configProvider = factory.getService(ConfigurationProvider)
      const actualConfig = configProvider.getConfiguration()

      expect(actualConfig.serverUrl).toBe(config.serverUrl)
      expect(actualConfig.hubUrl).toBe(config.hubUrl)
      expect(actualConfig.hubId).toBe(config.hubId)
      expect(actualConfig.profile).toEqual(config.profile)
    })
  })
})
