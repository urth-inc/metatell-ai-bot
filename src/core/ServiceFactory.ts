import { ServiceContainer } from './ServiceContainer'
import { EventBus } from './services/EventBus'
import { ConfigurationProvider } from './services/ConfigurationProvider'
import { RateLimiter } from './services/RateLimiter'
import { AuthenticationService } from './services/AuthenticationService'
import { WebSocketConnectionManager } from './services/WebSocketConnectionManager'
import { MessageService } from './services/MessageService'
import { AvatarController } from './services/AvatarController'
import { PresenceManager } from './services/PresenceManager'
import { MetatellBot } from '../bots/MetatellBot'

import { IEventBus } from './interfaces/IEventBus'
import { IConfigurationProvider, BotConfiguration } from './interfaces/IConfigurationProvider'
import { IRateLimiter } from './interfaces/IRateLimiter'
import { IAuthenticationService } from './interfaces/IAuthenticationService'
import { IConnectionManager } from './interfaces/IConnectionManager'
import { IMessageService } from './interfaces/IMessageService'
import { IAvatarController } from './interfaces/IAvatarController'
import { IPresenceManager } from './interfaces/IPresenceManager'

export class ServiceFactory {
  private container: ServiceContainer

  constructor() {
    this.container = new ServiceContainer()
    this.registerServices()
  }

  private registerServices(): void {
    // Register EventBus (singleton)
    this.container.register<IEventBus>(
      'IEventBus',
      () => new EventBus(),
      { singleton: true }
    )

    // Register ConfigurationProvider (singleton)
    this.container.register<IConfigurationProvider>(
      'IConfigurationProvider',
      (container) => {
        // This will be initialized with actual config
        return container.get<IConfigurationProvider>('IConfigurationProvider')
      },
      { singleton: true }
    )

    // Register RateLimiter
    this.container.register<IRateLimiter>(
      'IRateLimiter',
      () => new RateLimiter({ maxRequests: 1, windowMs: 15000 }),
      { singleton: true }
    )

    // Register AuthenticationService
    this.container.register<IAuthenticationService>(
      'IAuthenticationService',
      (container) => new AuthenticationService(
        container.get<IConfigurationProvider>('IConfigurationProvider')
      ),
      { singleton: true }
    )

    // Register WebSocketConnectionManager
    this.container.register<IConnectionManager>(
      'IConnectionManager',
      (container) => new WebSocketConnectionManager(
        container.get<IEventBus>('IEventBus'),
        container.get<IConfigurationProvider>('IConfigurationProvider')
      ),
      { singleton: true }
    )

    // Register MessageService
    this.container.register<IMessageService>(
      'IMessageService',
      (container) => new MessageService(
        container.get<IConnectionManager>('IConnectionManager'),
        container.get<IEventBus>('IEventBus'),
        container.get<IRateLimiter>('IRateLimiter')
      ),
      { singleton: true }
    )

    // Register AvatarController
    this.container.register<IAvatarController>(
      'IAvatarController',
      (container) => new AvatarController(
        container.get<IMessageService>('IMessageService'),
        container.get<IConfigurationProvider>('IConfigurationProvider'),
        container.get<IEventBus>('IEventBus')
      ),
      { singleton: true }
    )

    // Register PresenceManager
    this.container.register<IPresenceManager>(
      'IPresenceManager',
      (container) => new PresenceManager(
        container.get<IConnectionManager>('IConnectionManager'),
        container.get<IEventBus>('IEventBus')
      ),
      { singleton: true }
    )

    // Register MetatellBot
    this.container.register<MetatellBot>(
      'MetatellBot',
      (container) => new MetatellBot(
        container.get<IConnectionManager>('IConnectionManager'),
        container.get<IMessageService>('IMessageService'),
        container.get<IAvatarController>('IAvatarController'),
        container.get<IPresenceManager>('IPresenceManager'),
        container.get<IConfigurationProvider>('IConfigurationProvider'),
        container.get<IEventBus>('IEventBus')
      ),
      { singleton: true }
    )
  }

  public createBot(config: BotConfiguration): MetatellBot {
    // Initialize configuration
    const configProvider = new ConfigurationProvider(config)
    this.container.register<IConfigurationProvider>(
      'IConfigurationProvider',
      () => configProvider,
      { singleton: true }
    )

    // Return bot instance
    return this.container.get<MetatellBot>('MetatellBot')
  }

  public getContainer(): ServiceContainer {
    return this.container
  }

  public getService<T>(name: string): T {
    return this.container.get<T>(name)
  }
}