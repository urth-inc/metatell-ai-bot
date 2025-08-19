// Core exports

// Bots
export { MetatellBot } from '../bots/MetatellBot.js'
export * from './interfaces/IAuthenticationService.js'
export * from './interfaces/IAvatarController.js'
export * from './interfaces/IConfigurationProvider.js'
export * from './interfaces/IConnectionManager.js'
// Interfaces
export * from './interfaces/IEventBus.js'
export * from './interfaces/IMessageService.js'
export * from './interfaces/IPresenceManager.js'
export * from './interfaces/IRateLimiter.js'
export * from './interfaces/IUserAvatarManager.js'
export { ServiceContainer } from './ServiceContainer.js'
export { ServiceFactory } from './ServiceFactory.js'
export { AuthenticationService } from './services/AuthenticationService.js'
export { AvatarController } from './services/AvatarController.js'
export { ConfigurationProvider } from './services/ConfigurationProvider.js'
// Services
export { EventBus } from './services/EventBus.js'
export { MessageService } from './services/MessageService.js'
export { PresenceManager } from './services/PresenceManager.js'
export { RateLimiter } from './services/RateLimiter.js'
export { UserAvatarManager } from './services/UserAvatarManager.js'
export { WebSocketConnectionManager } from './services/WebSocketConnectionManager.js'
