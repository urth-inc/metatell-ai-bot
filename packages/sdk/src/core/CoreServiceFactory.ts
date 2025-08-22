/**
 * Core Service Factory - SDK Core Services Only
 * This factory only includes core services needed for the SDK, without any application-specific services
 */
import type { IAppSettings } from './interfaces/IAppSettings.js'
import type { IAuthenticationService } from './interfaces/IAuthenticationService.js'
import type { IAvatarController } from './interfaces/IAvatarController.js'
import type {
  BotConfiguration,
  IConfigurationProvider,
} from './interfaces/IConfigurationProvider.js'
import type { IConnectionManager } from './interfaces/IConnectionManager.js'
import type { IEventBus } from './interfaces/IEventBus.js'
import type { IMessageService } from './interfaces/IMessageService.js'
import type { IPresenceManager } from './interfaces/IPresenceManager.js'
import type { IRateLimiter } from './interfaces/IRateLimiter.js'
import type { IUserAvatarManager } from './interfaces/IUserAvatarManager.js'
import { ServiceContainer } from './ServiceContainer.js'
import { AppSettings } from './services/AppSettings.js'
import { AuthenticationService } from './services/AuthenticationService.js'
import { AvatarController } from './services/AvatarController.js'
import { ConfigurationProvider } from './services/ConfigurationProvider.js'
import { EventBus } from './services/EventBus.js'
import { MessageService } from './services/MessageService.js'
import { PresenceManager } from './services/PresenceManager.js'
import { RateLimiter } from './services/RateLimiter.js'
import { UserAvatarManager } from './services/UserAvatarManager.js'
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
    // Register AppSettings (singleton) - initialized with config if provided
    this.container.register<IAppSettings>(
      'IAppSettings',
      () => new AppSettings(config?.debug || false),
      { singleton: true },
    )

    // Register EventBus (singleton)
    this.container.register<IEventBus>('IEventBus', () => new EventBus(), { singleton: true })

    // Register ConfigurationProvider (singleton) - initialized with config if provided
    this.container.register<IConfigurationProvider>(
      'IConfigurationProvider',
      () => new ConfigurationProvider(config || ({} as BotConfiguration)),
      { singleton: true },
    )

    // Register RateLimiter
    this.container.register<IRateLimiter>(
      'IRateLimiter',
      () => new RateLimiter({ maxRequests: 1, windowMs: 15000 }),
      { singleton: true },
    )

    // Register AuthenticationService
    this.container.register<IAuthenticationService>(
      'IAuthenticationService',
      (container) =>
        new AuthenticationService(container.get<IConfigurationProvider>('IConfigurationProvider')),
      { singleton: true },
    )

    // Register WebSocketConnectionManager
    this.container.register<IConnectionManager>(
      'IConnectionManager',
      (container) =>
        new WebSocketConnectionManager(
          container.get<IEventBus>('IEventBus'),
          container.get<IConfigurationProvider>('IConfigurationProvider'),
          container.get<IAppSettings>('IAppSettings'),
        ),
      { singleton: true },
    )

    // Register MessageService
    this.container.register<IMessageService>(
      'IMessageService',
      (container) =>
        new MessageService(
          container.get<IConnectionManager>('IConnectionManager'),
          container.get<IEventBus>('IEventBus'),
          container.get<IAppSettings>('IAppSettings'),
        ),
      { singleton: true },
    )

    // Register AvatarController
    this.container.register<IAvatarController>(
      'IAvatarController',
      (container) =>
        new AvatarController(
          container.get<IMessageService>('IMessageService'),
          container.get<IConfigurationProvider>('IConfigurationProvider'),
          container.get<IEventBus>('IEventBus'),
        ),
      { singleton: true },
    )

    // Register PresenceManager
    this.container.register<IPresenceManager>(
      'IPresenceManager',
      (container) =>
        new PresenceManager(
          container.get<IConnectionManager>('IConnectionManager'),
          container.get<IEventBus>('IEventBus'),
        ),
      { singleton: true },
    )

    // Register UserAvatarManager
    this.container.register<IUserAvatarManager>(
      'IUserAvatarManager',
      (container) =>
        new UserAvatarManager(
          container.get<IMessageService>('IMessageService'),
          container.get<IPresenceManager>('IPresenceManager'),
          container.get<IEventBus>('IEventBus'),
        ),
      { singleton: true },
    )
  }

  public getContainer(): ServiceContainer {
    return this.container
  }

  public getService<T>(name: string): T {
    return this.container.get<T>(name)
  }
}
