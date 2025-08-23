/**
 * Bot Service Factory - Application Layer Service Registration
 * Extends CoreServiceFactory to register application-specific services
 *
 * RESPONSIBILITIES:
 * - Pure service registration and dependency injection setup
 * - NO application instance creation or startup logic
 *
 * DESIGN PRINCIPLES:
 * - Single Responsibility: Only handles DI container configuration
 * - Open/Closed: Can be extended for different bot types without modification
 * - Dependency Injection: main.ts retrieves services and orchestrates application startup
 */

import type { IConnectionManager } from '@metatell/sdk'
import {
  type BotConfiguration,
  CoreServiceFactory,
  type IAppSettings,
  type IAvatarController,
  type IConfigurationProvider,
  type IMessageService,
  type IPresenceManager,
  type IUserAvatarManager,
  type ServiceContainer,
} from '@metatell/sdk'
import { MetatellBot } from './MetatellBot.js'

/**
 * Application layer service factory that extends CoreServiceFactory
 * Responsible only for registering services, not creating instances
 */
export class BotServiceFactory extends CoreServiceFactory {
  constructor(config?: BotConfiguration) {
    super(config)
    this.registerBotServices()
  }

  /**
   * Register application-specific services
   * This method can be extended to register different types of bots
   */
  private registerBotServices(): void {
    // Register MetatellBot as an application service
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

  /**
   * Get the underlying service container
   * Main.ts uses this to retrieve services
   */
  public getContainer(): ServiceContainer {
    return this.container
  }

  /**
   * Get a service by name
   * Convenience method for accessing services
   */
  public getService<T>(name: string): T {
    return this.container.get<T>(name)
  }
}
