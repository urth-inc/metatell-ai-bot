import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAgentClient } from './AgentClient.js'
import { ServiceFactory } from '../core/ServiceFactory.js'
import type { BotConfiguration } from '../core/interfaces/IConfigurationProvider.js'

describe('AgentClient', () => {
  let factory: ServiceFactory
  let botConfig: BotConfiguration

  beforeEach(() => {
    botConfig = {
      authUrl: 'wss://example.com',
      hubUrl: 'https://example.com/test',
      hubId: 'test-hub',
      profile: {
        displayName: 'TestBot',
        avatarId: 'test-avatar',
      },
      context: {
        mobile: false,
        embed: false,
        hmd: false,
      },
      debug: false,
    }
    
    factory = new ServiceFactory(botConfig)
  })

  describe('event handling', () => {
    it('should proxy on/off methods to internal event bus', () => {
      const client = createAgentClient(factory)
      // Access internal eventBus through type assertion for testing
      const mockEventBus = (client as { eventBus: unknown }).eventBus as { on: unknown; off: unknown }
      
      // Mock the eventBus methods
      const onSpy = vi.spyOn(mockEventBus, 'on')
      const offSpy = vi.spyOn(mockEventBus, 'off')
      
      const testHandler = vi.fn()
      
      // Test on method
      client.on('test-event', testHandler)
      expect(onSpy).toHaveBeenCalledWith('test-event', testHandler)
      
      // Test off method
      client.off('test-event', testHandler)
      expect(offSpy).toHaveBeenCalledWith('test-event', testHandler)
    })

    it('should allow event subscription through ServiceFactory event bus', () => {
      const client = createAgentClient(factory)
      const testHandler = vi.fn()
      
      // Subscribe to event through client
      client.on('user-joined', testHandler)
      
      // Get the event bus directly from factory to trigger events
      const eventBus = factory.getService('IEventBus') as { emit: (event: string, data?: unknown) => void }
      eventBus.emit('user-joined', { userId: 'test-user' })
      
      expect(testHandler).toHaveBeenCalledWith({ userId: 'test-user' })
    })

    it('should allow event unsubscription through ServiceFactory event bus', () => {
      const client = createAgentClient(factory)
      const testHandler = vi.fn()
      
      // Subscribe and then unsubscribe
      client.on('user-left', testHandler)
      client.off('user-left', testHandler)
      
      // Get the event bus directly from factory to trigger events
      const eventBus = factory.getService('IEventBus') as { emit: (event: string, data?: unknown) => void }
      eventBus.emit('user-left', { userId: 'test-user' })
      
      // Handler should not be called since it was removed
      expect(testHandler).not.toHaveBeenCalled()
    })
  })

  describe('integration', () => {
    it('should create client with default configuration', () => {
      const client = createAgentClient(factory)
      
      expect(client).toBeDefined()
      expect(typeof client.connect).toBe('function')
      expect(typeof client.disconnect).toBe('function')
      expect(typeof client.on).toBe('function')
      expect(typeof client.off).toBe('function')
    })

    it('should create client with custom configuration', () => {
      const client = createAgentClient(factory, {
        profile: {
          displayName: 'CustomBot',
          avatarId: 'custom-avatar',
        },
        rateLimit: {
          messages: 5,
          moves: 2,
          looks: 3,
        },
      })
      
      expect(client).toBeDefined()
      expect(client.getRateLimit('messages')).toBe(5)
      expect(client.getRateLimit('moves')).toBe(2)
      expect(client.getRateLimit('looks')).toBe(3)
    })
  })
})