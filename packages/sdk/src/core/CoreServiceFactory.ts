/**
 * Core Service Factory - SDK Core Services Only
 * This factory only includes core services needed for the SDK, without any application-specific services
 */

import { LiveKitAdapter, MockAdapter } from '@metatell/realtime'
import { getLogger } from '../sdk/logging/index.js'
// 型安全な実装のために、インターフェースとトークンの両方をインポート
import { AnimationService as AnimationServiceToken } from './interfaces/IAnimationService.js'
import { AppSettings as AppSettingsToken } from './interfaces/IAppSettings.js'
import { AuthenticationService as AuthenticationServiceToken } from './interfaces/IAuthenticationService.js'
import { AvatarController as AvatarControllerToken } from './interfaces/IAvatarController.js'
import type { BotConfiguration } from './interfaces/IConfigurationProvider.js'
import { ConfigurationProvider as ConfigurationProviderToken } from './interfaces/IConfigurationProvider.js'
import { ConnectionManager as ConnectionManagerToken } from './interfaces/IConnectionManager.js'
import { EventBus as EventBusToken } from './interfaces/IEventBus.js'
import { MessageService as MessageServiceToken } from './interfaces/IMessageService.js'
import { OrganizationService as OrganizationServiceToken } from './interfaces/IOrganizationService.js'
import { PresenceManager as PresenceManagerToken } from './interfaces/IPresenceManager.js'
import { UserAvatarManager as UserAvatarManagerToken } from './interfaces/IUserAvatarManager.js'
import { ServiceContainer, type ServiceKey } from './ServiceContainer.js'
import type { ServiceType } from './ServiceIdentifier.js'
import { AnimationService as AnimationServiceImpl } from './services/AnimationService.js'
import { AppSettings as AppSettingsImpl } from './services/AppSettings.js'
import { AuthenticationService as AuthenticationServiceImpl } from './services/AuthenticationService.js'
import { AvatarController as AvatarControllerImpl } from './services/AvatarController.js'
import { ConfigurationProvider as ConfigurationProviderImpl } from './services/ConfigurationProvider.js'
import { EventBus as EventBusImpl } from './services/EventBus.js'
import { MessageService as MessageServiceImpl } from './services/MessageService.js'
import { OrganizationService as OrganizationServiceImpl } from './services/OrganizationService.js'
import { PresenceManager as PresenceManagerImpl } from './services/PresenceManager.js'
import { UserAvatarManager as UserAvatarManagerImpl } from './services/UserAvatarManager.js'
import { WebSocketConnectionManager } from './services/WebSocketConnectionManager.js'

/**
 * Core Service Factory - Contains only SDK core services
 * This can be used independently without any application-specific dependencies
 */
export class CoreServiceFactory {
  protected container: ServiceContainer

  constructor(config?: BotConfiguration) {
    this.container = new ServiceContainer()
    this.registerCoreServices(config)
  }

  protected registerCoreServices(config?: BotConfiguration): void {
    // Using fluent API for clean registration
    // Core services registration with type-safe API
    this.container
      .register(AppSettingsToken, () => new AppSettingsImpl(config?.debug || false, 'info'))
      .register(EventBusToken, () => new EventBusImpl())
      .register(
        ConfigurationProviderToken,
        () => new ConfigurationProviderImpl(config || ({} as BotConfiguration)),
      )

    // Services with dependencies
    this.container
      .register(
        AuthenticationServiceToken,
        (container) => new AuthenticationServiceImpl(container.get(ConfigurationProviderToken)),
      )
      .register(
        ConnectionManagerToken,
        (container) =>
          new WebSocketConnectionManager(
            container.get(EventBusToken),
            container.get(ConfigurationProviderToken),
            container.get(AppSettingsToken),
          ),
      )
      .register(
        MessageServiceToken,
        (container) =>
          new MessageServiceImpl(
            container.get(ConnectionManagerToken),
            container.get(EventBusToken),
            container.get(AppSettingsToken),
          ),
      )

    // Animation and Avatar services
    this.container
      .register(AnimationServiceToken, (container) => {
        const logger = getLogger('AnimationService')
        const configProvider = container.get(ConfigurationProviderToken)
        const config = configProvider.getConfiguration()
        const apiBaseUrl = config.storageUrl || 'https://storage.metatell.app:443'
        return new AnimationServiceImpl(logger, apiBaseUrl)
      })
      .register(
        AvatarControllerToken,
        (container) =>
          new AvatarControllerImpl(
            container.get(MessageServiceToken),
            container.get(ConfigurationProviderToken),
            container.get(EventBusToken),
            container.get(AnimationServiceToken),
          ),
      )

    // Presence and User management services
    this.container
      .register(
        PresenceManagerToken,
        (container) =>
          new PresenceManagerImpl(
            container.get(ConnectionManagerToken),
            container.get(EventBusToken),
          ),
      )
      .register(
        UserAvatarManagerToken,
        (container) =>
          new UserAvatarManagerImpl(
            container.get(MessageServiceToken),
            container.get(PresenceManagerToken),
            container.get(EventBusToken),
          ),
      )
      .register(OrganizationServiceToken, () => new OrganizationServiceImpl())

    // Conditional registration for voice features

    const voiceConfig = config?.voice
    if (voiceConfig?.enabled) {
      if (voiceConfig.useMock) {
        this.container.register(MockAdapter, () => new MockAdapter())
      } else {
        this.container.register(LiveKitAdapter, () => new LiveKitAdapter())
      }
    }
  }

  public getContainer(): ServiceContainer {
    return this.container
  }

  /**
   * Get a service from the container
   * @param key Service identifier token or class
   * @returns Service instance
   */
  public getService<T>(key: ServiceKey<T>): ServiceType<T> {
    return this.container.get(key)
  }
}
