import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MetatellBot } from '../bots/MetatellBot.js'
import type { MockServiceContainer } from '../test-utils/service-mocks.js'
import { findRegisterCall } from '../test-utils/service-mocks.js'
import type { BotConfiguration } from './interfaces/IConfigurationProvider.js'
import { ServiceContainer } from './ServiceContainer.js'
import { ServiceFactory } from './ServiceFactory.js'
import { AuthenticationService } from './services/AuthenticationService.js'
import { AvatarController } from './services/AvatarController.js'
import { ConfigurationProvider } from './services/ConfigurationProvider.js'
import { EventBus } from './services/EventBus.js'
import { MessageService } from './services/MessageService.js'
import { PresenceManager } from './services/PresenceManager.js'
import { RateLimiter } from './services/RateLimiter.js'
import { WebSocketConnectionManager } from './services/WebSocketConnectionManager.js'

// Mock all service modules
vi.mock('./ServiceContainer')
vi.mock('./services/EventBus')
vi.mock('./services/ConfigurationProvider')
vi.mock('./services/RateLimiter')
vi.mock('./services/AuthenticationService')
vi.mock('./services/WebSocketConnectionManager')
vi.mock('./services/MessageService')
vi.mock('./services/AvatarController')
vi.mock('./services/PresenceManager')
vi.mock('../bots/MetatellBot')

describe('ServiceFactory', () => {
  let serviceFactory: ServiceFactory
  let mockContainer: MockServiceContainer

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock ServiceContainer
    mockContainer = {
      register: vi.fn(),
      get: vi.fn(),
      has: vi.fn(),
      bind: vi.fn(),
      bindWithDependencies: vi.fn(),
    }

    const MockedServiceContainer = ServiceContainer as unknown as { new (): MockServiceContainer }
    vi.mocked(MockedServiceContainer).mockImplementation(() => mockContainer)

    serviceFactory = new ServiceFactory()
  })

  describe('constructor', () => {
    it('should create a ServiceContainer', () => {
      expect(ServiceContainer).toHaveBeenCalled()
    })

    it('should register all services', () => {
      const registeredServices = [
        'IEventBus',
        'IConfigurationProvider',
        'IRateLimiter',
        'IAuthenticationService',
        'IConnectionManager',
        'IMessageService',
        'IAvatarController',
        'IPresenceManager',
        'IUserAvatarManager',
        'MetatellBot',
      ]

      expect(mockContainer.register).toHaveBeenCalledTimes(registeredServices.length)

      for (const service of registeredServices) {
        const registerCall = findRegisterCall(mockContainer, service)
        expect(registerCall).toBeDefined()
      }
    })
  })

  describe('service registrations', () => {
    it('should register all services as singletons', () => {
      const singletonServices = [
        'IEventBus',
        'IConfigurationProvider',
        'IRateLimiter',
        'IAuthenticationService',
        'IConnectionManager',
        'IMessageService',
        'IAvatarController',
        'IPresenceManager',
        'IUserAvatarManager',
        'MetatellBot',
      ]

      for (const service of singletonServices) {
        const call = findRegisterCall(mockContainer, service)
        expect(call?.[2]).toEqual({ singleton: true })
      }
    })

    it('should register EventBus correctly', () => {
      const eventBusRegistration = findRegisterCall(mockContainer, 'IEventBus')

      expect(eventBusRegistration).toBeDefined()
      expect(eventBusRegistration?.[1]).toBeInstanceOf(Function)

      // Test factory function
      const factory = eventBusRegistration?.[1] as ServiceFactory<EventBus>
      factory()
      expect(EventBus).toHaveBeenCalled()
    })

    it('should register RateLimiter with correct config', () => {
      const rateLimiterRegistration = findRegisterCall(mockContainer, 'IRateLimiter')

      expect(rateLimiterRegistration).toBeDefined()
      expect(rateLimiterRegistration?.[1]).toBeInstanceOf(Function)

      // Test factory function
      const factory = rateLimiterRegistration?.[1] as ServiceFactory<RateLimiter>
      factory()
      expect(RateLimiter).toHaveBeenCalledWith({ maxRequests: 1, windowMs: 15000 })
    })

    it('should register AuthenticationService with dependencies', () => {
      const authRegistration = findRegisterCall(mockContainer, 'IAuthenticationService')

      expect(authRegistration).toBeDefined()
      expect(authRegistration?.[1]).toBeInstanceOf(Function)

      // Test factory function
      const mockConfigProvider = {}
      mockContainer.get.mockReturnValue(mockConfigProvider)

      const factory = authRegistration?.[1] as ServiceFactory<AuthenticationService>
      factory(mockContainer)

      expect(mockContainer.get).toHaveBeenCalledWith('IConfigurationProvider')
      expect(AuthenticationService).toHaveBeenCalledWith(mockConfigProvider)
    })

    it('should register WebSocketConnectionManager with dependencies', () => {
      const connRegistration = findRegisterCall(mockContainer, 'IConnectionManager')

      expect(connRegistration).toBeDefined()
      expect(connRegistration?.[1]).toBeInstanceOf(Function)

      // Test factory function
      const mockEventBus = {}
      const mockConfigProvider = {}
      mockContainer.get.mockReturnValueOnce(mockEventBus).mockReturnValueOnce(mockConfigProvider)

      const factory = connRegistration?.[1] as ServiceFactoryType<WebSocketConnectionManager>
      factory(mockContainer)

      expect(mockContainer.get).toHaveBeenCalledWith('IEventBus')
      expect(mockContainer.get).toHaveBeenCalledWith('IConfigurationProvider')
      expect(WebSocketConnectionManager).toHaveBeenCalledWith(mockEventBus, mockConfigProvider)
    })

    it('should register MessageService with dependencies', () => {
      const msgRegistration = findRegisterCall(mockContainer, 'IMessageService')

      expect(msgRegistration).toBeDefined()
      expect(msgRegistration?.[1]).toBeInstanceOf(Function)

      // Test factory function
      const mockConnManager = {}
      const mockEventBus = {}
      const mockRateLimiter = {}
      mockContainer.get
        .mockReturnValueOnce(mockConnManager)
        .mockReturnValueOnce(mockEventBus)
        .mockReturnValueOnce(mockRateLimiter)

      const factory = msgRegistration?.[1] as ServiceFactory<MessageService>
      factory(mockContainer)

      expect(mockContainer.get).toHaveBeenCalledWith('IConnectionManager')
      expect(mockContainer.get).toHaveBeenCalledWith('IEventBus')
      expect(MessageService).toHaveBeenCalledWith(mockConnManager, mockEventBus)
    })

    it('should register AvatarController with dependencies', () => {
      const avatarRegistration = findRegisterCall(mockContainer, 'IAvatarController')

      expect(avatarRegistration).toBeDefined()
      expect(avatarRegistration?.[1]).toBeInstanceOf(Function)

      // Test factory function
      const mockMessageService = {}
      const mockConfigProvider = {}
      const mockEventBus = {}
      mockContainer.get
        .mockReturnValueOnce(mockMessageService)
        .mockReturnValueOnce(mockConfigProvider)
        .mockReturnValueOnce(mockEventBus)

      const factory = avatarRegistration?.[1] as ServiceFactory<AvatarController>
      factory(mockContainer)

      expect(mockContainer.get).toHaveBeenCalledWith('IMessageService')
      expect(mockContainer.get).toHaveBeenCalledWith('IConfigurationProvider')
      expect(mockContainer.get).toHaveBeenCalledWith('IEventBus')
      expect(AvatarController).toHaveBeenCalledWith(
        mockMessageService,
        mockConfigProvider,
        mockEventBus,
      )
    })

    it('should register PresenceManager with dependencies', () => {
      const presenceRegistration = findRegisterCall(mockContainer, 'IPresenceManager')

      expect(presenceRegistration).toBeDefined()
      expect(presenceRegistration?.[1]).toBeInstanceOf(Function)

      // Test factory function
      const mockConnManager = {}
      const mockEventBus = {}
      mockContainer.get.mockReturnValueOnce(mockConnManager).mockReturnValueOnce(mockEventBus)

      const factory = presenceRegistration?.[1] as ServiceFactory<PresenceManager>
      factory(mockContainer)

      expect(mockContainer.get).toHaveBeenCalledWith('IConnectionManager')
      expect(mockContainer.get).toHaveBeenCalledWith('IEventBus')
      expect(PresenceManager).toHaveBeenCalledWith(mockConnManager, mockEventBus)
    })

    it('should register MetatellBot with all dependencies', () => {
      const botRegistration = findRegisterCall(mockContainer, 'MetatellBot')

      expect(botRegistration).toBeDefined()
      expect(botRegistration?.[1]).toBeInstanceOf(Function)

      // Test factory function
      const mockConnManager = {}
      const mockMessageService = {}
      const mockAvatarController = {}
      const mockPresenceManager = {}
      const mockConfigProvider = {}
      const mockUserAvatarManager = {}

      mockContainer.get
        .mockReturnValueOnce(mockConnManager)
        .mockReturnValueOnce(mockMessageService)
        .mockReturnValueOnce(mockAvatarController)
        .mockReturnValueOnce(mockPresenceManager)
        .mockReturnValueOnce(mockConfigProvider)
        .mockReturnValueOnce(mockUserAvatarManager)

      const factory = botRegistration?.[1] as ServiceFactory<MetatellBot>
      factory(mockContainer)

      expect(mockContainer.get).toHaveBeenCalledWith('IConnectionManager')
      expect(mockContainer.get).toHaveBeenCalledWith('IMessageService')
      expect(mockContainer.get).toHaveBeenCalledWith('IAvatarController')
      expect(mockContainer.get).toHaveBeenCalledWith('IPresenceManager')
      expect(mockContainer.get).toHaveBeenCalledWith('IConfigurationProvider')
      expect(mockContainer.get).toHaveBeenCalledWith('IUserAvatarManager')

      expect(MetatellBot).toHaveBeenCalledWith(
        mockConnManager,
        mockMessageService,
        mockAvatarController,
        mockPresenceManager,
        mockConfigProvider,
        mockUserAvatarManager,
      )
    })
  })

  describe('createBot', () => {
    it('should create bot with configuration', () => {
      const config: BotConfiguration = {
        apiUrl: 'https://test.api',
        authUrl: 'https://test.auth',
        hubId: 'test-hub',
        profile: { displayName: 'TestBot' },
        context: { mobile: false, embed: false, hmd: false },
      }

      const mockBot = {}
      mockContainer.get.mockReturnValue(mockBot)

      const bot = serviceFactory.createBot(config)

      // Verify ConfigurationProvider was created with config
      expect(ConfigurationProvider).toHaveBeenCalledWith(config)

      // Find the config provider registration that happens in createBot
      const configRegistrations = mockContainer.register.mock.calls.filter(
        (call) => call[0] === 'IConfigurationProvider',
      )

      // Should have 2 registrations: one in constructor, one in createBot
      expect(configRegistrations).toHaveLength(2)

      // Get bot from container
      expect(mockContainer.get).toHaveBeenCalledWith('MetatellBot')
      expect(bot).toBe(mockBot)
    })
  })

  describe('utility methods', () => {
    it('should return container', () => {
      const container = serviceFactory.getContainer()
      expect(container).toBe(mockContainer)
    })

    it('should get service from container', () => {
      const mockService = { test: 'service' }
      mockContainer.get.mockReturnValue(mockService)

      interface TestService {
        test: string
      }
      const service = serviceFactory.getService<TestService>('ITestService')

      expect(mockContainer.get).toHaveBeenCalledWith('ITestService')
      expect(service).toBe(mockService)
    })
  })
})
