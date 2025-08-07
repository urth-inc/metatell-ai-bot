// Core exports
export { ServiceContainer } from './ServiceContainer'
export { ServiceFactory } from './ServiceFactory'

// Interfaces
export * from './interfaces/IEventBus'
export * from './interfaces/IConnectionManager'
export * from './interfaces/IConfigurationProvider'
export * from './interfaces/IAvatarController'
export * from './interfaces/IMessageService'
export * from './interfaces/IRateLimiter'
export * from './interfaces/IPresenceManager'
export * from './interfaces/IAuthenticationService'

// Services
export { EventBus } from './services/EventBus'
export { ConfigurationProvider } from './services/ConfigurationProvider'
export { RateLimiter } from './services/RateLimiter'
export { AuthenticationService } from './services/AuthenticationService'
export { WebSocketConnectionManager } from './services/WebSocketConnectionManager'
export { MessageService } from './services/MessageService'
export { AvatarController } from './services/AvatarController'
export { PresenceManager } from './services/PresenceManager'

// Bots
export { MetatellBot } from '../bots/MetatellBot'