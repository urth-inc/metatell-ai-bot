/**
 * Bot Service Factory - Application Layer Service Factory
 * Extends CoreServiceFactory and adds application-specific services like MetatellBot
 */
import { MetatellBot } from './MetatellBot.js'
import { CoreServiceFactory } from '../core/CoreServiceFactory.js'
import type { ServiceContainer } from '../core/ServiceContainer.js'
import type {
  BotConfiguration,
  IConfigurationProvider,
} from '../core/interfaces/IConfigurationProvider.js'
import type { IConnectionManager } from '../core/interfaces/IConnectionManager.js'
import type { IAvatarController } from '../core/interfaces/IAvatarController.js'
import type { IPresenceManager } from '../core/interfaces/IPresenceManager.js'
import type { IMessageService } from '../core/interfaces/IMessageService.js'
import type { IUserAvatarManager } from '../core/interfaces/IUserAvatarManager.js'
import type { IAppSettings } from '../core/interfaces/IAppSettings.js'

/**
 * Application layer service factory that extends CoreServiceFactory
 * This includes all core services plus application-specific services like MetatellBot
 */
export class BotServiceFactory extends CoreServiceFactory {
  constructor(config?: BotConfiguration) {
    super(config)
    this.registerBotServices()
  }

  private registerBotServices(): void {
    // Register MetatellBot (application-specific service)
    this.container.register<MetatellBot>(
      'MetatellBot',
      (container) =>
        new MetatellBot(
          container.get<IConnectionManager>('IConnectionManager'),
          container.get<IMessageService>('IMessageService'),
          container.get<IAvatarController>('IAvatarController'),
          container.get<IPresenceManager>('IPresenceManager'),
          container.get<IConfigurationProvider>('IConfigurationProvider'),
          container.get<IUserAvatarManager>('IUserAvatarManager'),
          container.get<IAppSettings>('IAppSettings'),
        ),
      { singleton: true },
    )
  }

  public createBot(): MetatellBot {
    // Simply return the bot instance, configuration is already set during construction
    return this.container.get<MetatellBot>('MetatellBot')
  }

  public getContainer(): ServiceContainer {
    return this.container
  }

  public getService<T>(name: string): T {
    return this.container.get<T>(name)
  }
}