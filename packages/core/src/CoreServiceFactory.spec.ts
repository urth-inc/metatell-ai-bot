/**
 * Test for CoreServiceFactory
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CoreServiceFactory } from './CoreServiceFactory.js'
import type { BotConfiguration } from './index.js'
import {
  AnimationService,
  AppSettings,
  AuthenticationService,
  AvatarController,
  ConfigurationProvider,
  ConnectionManager,
  EventBus,
  MessageService,
  OrganizationService,
  PresenceManager,
  UserAvatarManager,
} from './index.js'

// Mock the logger
vi.mock('./logging/index.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Mock all service implementations
vi.mock('./services/AnimationService.js', () => ({
  AnimationService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
  })),
}))

vi.mock('./services/AppSettings.js', () => ({
  AppSettings: vi.fn().mockImplementation(() => ({
    setLogLevel: vi.fn(),
    setDebugMode: vi.fn(),
  })),
}))

vi.mock('./services/AuthenticationService.js', () => ({
  AuthenticationService: vi.fn().mockImplementation(() => ({
    authenticate: vi.fn(),
  })),
}))

vi.mock('./services/AvatarController.js', () => ({
  AvatarController: vi.fn().mockImplementation(() => ({
    spawn: vi.fn(),
    move: vi.fn(),
  })),
}))

vi.mock('./services/ConfigurationProvider.js', () => ({
  ConfigurationProvider: vi.fn().mockImplementation(() => ({
    getConfiguration: vi.fn().mockReturnValue({
      serverUrl: 'wss://test.server',
      hubUrl: 'https://test.server',
      hubId: 'test-hub',
      token: 'test-token',
      profile: {
        displayName: 'TestBot',
        avatarId: 'test-avatar',
      },
    }),
  })),
}))

vi.mock('./services/EventBus.js', () => ({
  EventBus: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    off: vi.fn(),
  })),
}))

vi.mock('./services/MessageService.js', () => ({
  MessageService: vi.fn().mockImplementation(() => ({
    sendMessage: vi.fn(),
  })),
}))

vi.mock('./services/OrganizationService.js', () => ({
  OrganizationService: vi.fn().mockImplementation(() => ({
    getOrganizationInfo: vi.fn(),
    fetchOrganizationAvatars: vi.fn(),
  })),
}))

vi.mock('./services/PresenceManager.js', () => ({
  PresenceManager: vi.fn().mockImplementation(() => ({
    getUsers: vi.fn(),
    updatePresence: vi.fn(),
  })),
}))

vi.mock('./services/UserAvatarManager.js', () => ({
  UserAvatarManager: vi.fn().mockImplementation(() => ({
    getUser: vi.fn(),
    getUsersInRange: vi.fn(),
  })),
}))

vi.mock('./services/WebSocketConnectionManager.js', () => ({
  WebSocketConnectionManager: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}))

describe('CoreServiceFactory', () => {
  let factory: CoreServiceFactory

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create factory with default configuration', () => {
    factory = new CoreServiceFactory()

    expect(factory).toBeDefined()
    expect(factory.getContainer()).toBeDefined()
  })

  it('should create factory with custom configuration', () => {
    const config: BotConfiguration = {
      serverUrl: 'wss://test.server',
      hubUrl: 'https://test.server',
      hubId: 'test-hub',
      token: 'test-token',
      profile: {
        displayName: 'TestBot',
        avatarId: 'test-avatar',
      },
    }

    factory = new CoreServiceFactory(config)

    expect(factory).toBeDefined()
    expect(factory.getContainer()).toBeDefined()
  })

  describe('service registration', () => {
    beforeEach(() => {
      factory = new CoreServiceFactory()
    })

    it('should register EventBus', () => {
      const eventBus = factory.getContainer().get(EventBus)
      expect(eventBus).toBeDefined()
    })

    it('should register AppSettings', () => {
      const appSettings = factory.getContainer().get(AppSettings)
      expect(appSettings).toBeDefined()
    })

    it('should register ConfigurationProvider', () => {
      const configProvider = factory.getContainer().get(ConfigurationProvider)
      expect(configProvider).toBeDefined()
    })

    it('should register ConnectionManager', () => {
      const connectionManager = factory.getContainer().get(ConnectionManager)
      expect(connectionManager).toBeDefined()
    })

    it('should register AuthenticationService', () => {
      const authService = factory.getContainer().get(AuthenticationService)
      expect(authService).toBeDefined()
    })

    it('should register MessageService', () => {
      const messageService = factory.getContainer().get(MessageService)
      expect(messageService).toBeDefined()
    })

    it('should register PresenceManager', () => {
      const presenceManager = factory.getContainer().get(PresenceManager)
      expect(presenceManager).toBeDefined()
    })

    it('should register OrganizationService', () => {
      const orgService = factory.getContainer().get(OrganizationService)
      expect(orgService).toBeDefined()
    })

    it('should register UserAvatarManager', () => {
      const userAvatarManager = factory.getContainer().get(UserAvatarManager)
      expect(userAvatarManager).toBeDefined()
    })

    it('should register AvatarController', () => {
      const avatarController = factory.getContainer().get(AvatarController)
      expect(avatarController).toBeDefined()
    })

    it('should register AnimationService', () => {
      const animationService = factory.getContainer().get(AnimationService)
      expect(animationService).toBeDefined()
    })
  })

  describe('service resolution', () => {
    beforeEach(() => {
      const config: BotConfiguration = {
        serverUrl: 'wss://test.server',
        hubUrl: 'https://test.server',
        hubId: 'test-hub',
        token: 'test-token',
        profile: {
          displayName: 'TestBot',
          avatarId: 'test-avatar',
        },
      }

      factory = new CoreServiceFactory(config)
    })

    it('should return the same instance for singleton services', () => {
      const eventBus1 = factory.getContainer().get(EventBus)
      const eventBus2 = factory.getContainer().get(EventBus)

      expect(eventBus1).toBe(eventBus2)
    })

    it('should resolve services with dependencies', () => {
      // MessageService depends on EventBus and ConnectionManager
      const messageService = factory.getContainer().get(MessageService)

      expect(messageService).toBeDefined()

      // AvatarController depends on multiple services
      const avatarController = factory.getContainer().get(AvatarController)

      expect(avatarController).toBeDefined()
    })

    it('should handle configuration provider correctly', async () => {
      const configProvider = factory.getContainer().get(ConfigurationProvider)

      expect(configProvider).toBeDefined()

      // Import the mocked ConfigurationProvider
      const { ConfigurationProvider: ConfigProviderMock } = vi.mocked(
        await import('./services/ConfigurationProvider.js'),
      )

      // Verify it was called with the configuration
      expect(ConfigProviderMock).toHaveBeenCalledWith(
        expect.objectContaining({
          serverUrl: 'wss://test.server',
          hubId: 'test-hub',
        }),
      )
    })
  })

  describe('getService', () => {
    beforeEach(() => {
      factory = new CoreServiceFactory()
    })

    it('should get EventBus service', () => {
      const eventBus = factory.getService(EventBus)
      expect(eventBus).toBeDefined()
      expect(eventBus).toBe(factory.getContainer().get(EventBus))
    })

    it('should get ConnectionManager service', () => {
      const connectionManager = factory.getService(ConnectionManager)
      expect(connectionManager).toBeDefined()
      expect(connectionManager).toBe(factory.getContainer().get(ConnectionManager))
    })

    it('should get MessageService service', () => {
      const messageService = factory.getService(MessageService)
      expect(messageService).toBeDefined()
      expect(messageService).toBe(factory.getContainer().get(MessageService))
    })

    it('should get PresenceManager service', () => {
      const presenceManager = factory.getService(PresenceManager)
      expect(presenceManager).toBeDefined()
      expect(presenceManager).toBe(factory.getContainer().get(PresenceManager))
    })

    it('should get AvatarController service', () => {
      const avatarController = factory.getService(AvatarController)
      expect(avatarController).toBeDefined()
      expect(avatarController).toBe(factory.getContainer().get(AvatarController))
    })

    it('should get OrganizationService service', () => {
      const orgService = factory.getService(OrganizationService)
      expect(orgService).toBeDefined()
      expect(orgService).toBe(factory.getContainer().get(OrganizationService))
    })

    it('should get UserAvatarManager service', () => {
      const userAvatarManager = factory.getService(UserAvatarManager)
      expect(userAvatarManager).toBeDefined()
      expect(userAvatarManager).toBe(factory.getContainer().get(UserAvatarManager))
    })
  })
})
