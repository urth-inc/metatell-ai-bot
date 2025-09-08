/**
 * Dependency relationship tests for CoreServiceFactory
 * Tests that services are instantiated with correct dependencies
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CoreServiceFactory } from '../../CoreServiceFactory.js'
// Import service interface tokens for testing
import {
  AuthenticationService,
  ConnectionManager,
  EventBus,
  MessageService,
  PresenceManager,
  UserAvatarManager,
} from '../../index.js'
import type { BotConfiguration } from '../../interfaces/IConfigurationProvider.js'

import { AuthenticationService as AuthenticationServiceImpl } from '../AuthenticationService.js'
import { EventBus as EventBusImpl } from '../EventBus.js'
import { MessageService as MessageServiceImpl } from '../MessageService.js'
import { PresenceManager as PresenceManagerImpl } from '../PresenceManager.js'
import { UserAvatarManager as UserAvatarManagerImpl } from '../UserAvatarManager.js'
import { WebSocketConnectionManager as WebSocketConnectionManagerImpl } from '../WebSocketConnectionManager.js'

// Mock the logger
vi.mock('../../logging/index.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Mock all service implementations to capture constructor arguments
vi.mock('../AnimationService.js', () => ({
  AnimationService: vi.fn(),
}))

vi.mock('../AppSettings.js', () => ({
  AppSettings: vi.fn(),
}))

vi.mock('../AuthenticationService.js', () => ({
  AuthenticationService: vi.fn(),
}))

vi.mock('../AvatarController.js', () => ({
  AvatarController: vi.fn(),
}))

vi.mock('../ConfigurationProvider.js', () => ({
  ConfigurationProvider: vi.fn().mockImplementation((config) => ({
    getConfiguration: vi.fn().mockReturnValue(
      config || {
        serverUrl: 'wss://test.server',
        hubUrl: 'https://test.server',
        hubId: 'test-hub',
        token: 'test-token',
        profile: {
          displayName: 'TestBot',
          avatarId: 'test-avatar',
        },
      },
    ),
  })),
}))

vi.mock('../EventBus.js', () => ({
  EventBus: vi.fn(),
}))

vi.mock('../MessageService.js', () => ({
  MessageService: vi.fn(),
}))

vi.mock('../OrganizationService.js', () => ({
  OrganizationService: vi.fn(),
}))

vi.mock('../PresenceManager.js', () => ({
  PresenceManager: vi.fn(),
}))

vi.mock('../UserAvatarManager.js', () => ({
  UserAvatarManager: vi.fn(),
}))

vi.mock('../WebSocketConnectionManager.js', () => ({
  WebSocketConnectionManager: vi.fn(),
}))

describe('CoreServiceFactory - Dependency Relationships', () => {
  let factory: CoreServiceFactory
  const testConfig: BotConfiguration = {
    serverUrl: 'wss://test-server.com',
    hubUrl: 'https://test-hub.com',
    hubId: 'test-hub',
    token: 'test-token',
    profile: {
      displayName: 'TestBot',
      avatarId: 'test-avatar',
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Service Dependency Injection', () => {
    beforeEach(() => {
      factory = new CoreServiceFactory(testConfig)
    })

    it('should inject correct dependencies into MessageService', () => {
      // Trigger service resolution to capture constructor calls
      factory.getContainer().get(MessageService)

      const MessageServiceMock = vi.mocked(MessageServiceImpl)

      // Get the call arguments for MessageService constructor
      expect(MessageServiceMock).toHaveBeenCalled()
      const constructorArgs = MessageServiceMock.mock.calls[0]

      // MessageService should receive ConnectionManager, EventBus, and AppSettings
      expect(constructorArgs).toHaveLength(3)

      // Verify that arguments are actual service instances (not undefined)
      expect(constructorArgs[0]).toBeDefined() // ConnectionManager
      expect(constructorArgs[1]).toBeDefined() // EventBus
      expect(constructorArgs[2]).toBeDefined() // AppSettings
    })

    it('should inject correct dependencies into AuthenticationService', () => {
      // Trigger AuthenticationService resolution
      factory.getContainer().get(AuthenticationService)

      const AuthenticationServiceMock = vi.mocked(AuthenticationServiceImpl)

      expect(AuthenticationServiceMock).toHaveBeenCalled()
      const constructorArgs = AuthenticationServiceMock.mock.calls[0]

      // AuthenticationService should receive ConfigurationProvider
      expect(constructorArgs).toHaveLength(1)
      expect(constructorArgs[0]).toBeDefined() // ConfigurationProvider
    })

    it('should inject correct dependencies into PresenceManager', () => {
      // Trigger PresenceManager resolution
      factory.getContainer().get(PresenceManager)

      const PresenceManagerMock = vi.mocked(PresenceManagerImpl)

      expect(PresenceManagerMock).toHaveBeenCalled()
      const constructorArgs = PresenceManagerMock.mock.calls[0]

      // PresenceManager should receive ConnectionManager and EventBus
      expect(constructorArgs).toHaveLength(2)
      expect(constructorArgs[0]).toBeDefined() // ConnectionManager
      expect(constructorArgs[1]).toBeDefined() // EventBus
    })

    it('should inject correct dependencies into UserAvatarManager', () => {
      // Trigger UserAvatarManager resolution
      factory.getContainer().get(UserAvatarManager)

      const UserAvatarManagerMock = vi.mocked(UserAvatarManagerImpl)

      expect(UserAvatarManagerMock).toHaveBeenCalled()
      const constructorArgs = UserAvatarManagerMock.mock.calls[0]

      // UserAvatarManager should receive MessageService, PresenceManager, and EventBus
      expect(constructorArgs).toHaveLength(3)
      expect(constructorArgs[0]).toBeDefined() // MessageService
      expect(constructorArgs[1]).toBeDefined() // PresenceManager
      expect(constructorArgs[2]).toBeDefined() // EventBus
    })
  })

  describe('Service Instance Consistency', () => {
    beforeEach(() => {
      factory = new CoreServiceFactory(testConfig)
    })

    it('should provide same EventBus instance to all dependent services', () => {
      // Resolve multiple services that depend on EventBus
      factory.getContainer().get(MessageService)
      factory.getContainer().get(PresenceManager)

      const EventBusMock = vi.mocked(EventBusImpl)
      const MessageServiceMock = vi.mocked(MessageServiceImpl)
      const PresenceManagerMock = vi.mocked(PresenceManagerImpl)

      // EventBus should only be created once (singleton behavior)
      expect(EventBusMock).toHaveBeenCalledTimes(1)

      // Services should receive the same EventBus instance
      const messageServiceEventBus = MessageServiceMock.mock.calls[0][1] // EventBus is 2nd arg for MessageService
      const presenceManagerEventBus = PresenceManagerMock.mock.calls[0][1] // EventBus is 2nd arg for PresenceManager

      expect(messageServiceEventBus).toBe(presenceManagerEventBus)
    })

    it('should provide same ConnectionManager instance to dependent services', () => {
      // Resolve services that depend on ConnectionManager
      factory.getContainer().get(MessageService)
      factory.getContainer().get(PresenceManager)

      const WebSocketConnectionManagerMock = vi.mocked(WebSocketConnectionManagerImpl)
      const MessageServiceMock = vi.mocked(MessageServiceImpl)
      const PresenceManagerMock = vi.mocked(PresenceManagerImpl)

      // ConnectionManager should only be created once
      expect(WebSocketConnectionManagerMock).toHaveBeenCalledTimes(1)

      // Services should receive the same ConnectionManager instance
      const messageServiceConnectionManager = MessageServiceMock.mock.calls[0][0]
      const presenceManagerConnectionManager = PresenceManagerMock.mock.calls[0][0]

      expect(messageServiceConnectionManager).toBe(presenceManagerConnectionManager)
    })
  })

  describe('Core Factory Behavior', () => {
    beforeEach(() => {
      factory = new CoreServiceFactory(testConfig)
    })

    it('should successfully create factory with configuration', () => {
      expect(factory).toBeDefined()
      expect(factory.getContainer()).toBeDefined()
    })

    it('should successfully create factory without configuration', () => {
      const emptyFactory = new CoreServiceFactory()
      expect(emptyFactory).toBeDefined()
      expect(emptyFactory.getContainer()).toBeDefined()
    })
  })

  describe('Service Registration Verification', () => {
    beforeEach(() => {
      factory = new CoreServiceFactory(testConfig)
    })

    it('should provide services through interface tokens', () => {
      // All core services should be accessible through their interface tokens
      expect(factory.getContainer().get(MessageService)).toBeDefined()
      expect(factory.getContainer().get(EventBus)).toBeDefined()
      expect(factory.getContainer().get(ConnectionManager)).toBeDefined()
      expect(factory.getContainer().get(PresenceManager)).toBeDefined()
      expect(factory.getContainer().get(UserAvatarManager)).toBeDefined()
    })

    it('should maintain type safety through generic service access', () => {
      // getService should provide typed access
      const messageService = factory.getService(MessageService)
      const eventBus = factory.getService(EventBus)

      expect(messageService).toBeDefined()
      expect(eventBus).toBeDefined()

      // Services should be the same as container access
      expect(messageService).toBe(factory.getContainer().get(MessageService))
      expect(eventBus).toBe(factory.getContainer().get(EventBus))
    })
  })
})
