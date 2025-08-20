/**
 * Bot Service Factory - Application Layer Service Factory
 * Extends CoreServiceFactory and adds application-specific services like MetatellBot
 */
import { MetatellBot } from './MetatellBot.js'
import {
  CoreServiceFactory,
  type ServiceContainer,
  type BotConfiguration,
  type IConfigurationProvider,
  type IAvatarController,
  type IPresenceManager,
  type IMessageService,
  type IUserAvatarManager,
  type IAppSettings,
} from '@metatell/sdk'
import type { IConnectionManager } from '@metatell/sdk'

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