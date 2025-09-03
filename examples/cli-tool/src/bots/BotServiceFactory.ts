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

import {
  AppSettings,
  AvatarController,
  type BotConfiguration,
  ConfigurationProvider,
  ConnectionManager,
  CoreServiceFactory,
  type IAppSettings,
  type IAvatarController,
  type IConfigurationProvider,
  type IConnectionManager,
  type IMessageService,
  type IPresenceManager,
  type IUserAvatarManager,
  MessageService,
  PresenceManager,
  type ServiceContainer,
  UserAvatarManager,
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
    this.container.register(
      MetatellBot,
      (container) =>
        new MetatellBot(
          container.get(ConnectionManager) as IConnectionManager,
          container.get(MessageService) as IMessageService,
          container.get(AvatarController) as IAvatarController,
          container.get(PresenceManager) as IPresenceManager,
          container.get(ConfigurationProvider) as IConfigurationProvider,
          container.get(UserAvatarManager) as IUserAvatarManager,
          container.get(AppSettings) as IAppSettings,
        ),
    )
  }

  /**
   * Get the underlying service container
   * Main.ts uses this to retrieve services
   */
  public getContainer(): ServiceContainer {
    return this.container
  }
}
