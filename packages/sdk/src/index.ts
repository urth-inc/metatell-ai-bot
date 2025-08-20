// Core Service Factory (SDKの基盤)
export { CoreServiceFactory } from './core/CoreServiceFactory.js';
// Backward compatibility alias
export { CoreServiceFactory as ServiceFactory } from './core/CoreServiceFactory.js';

// Agent Client (SDKのメインインターフェース)
export { createAgentClient } from './sdk/AgentClient.js';
export type { 
  AgentClient, 
  AgentClientEvents, 
  ConnectionOptions, 
  AgentClientConfig, 
  ConnectionStatus 
} from './sdk/AgentClient.js';

// Logging (拡張ポイント)
export * from './sdk/logging/index.js';

// Errors (公開API)
export * from './sdk/errors.js';

// Rate Limiting
export { RateLimitedQueue, TokenBucketRateLimiter } from './sdk/rate.js';

// Core Interfaces (公開する型定義)
export type { IEventBus, SystemEvents } from './core/interfaces/IEventBus.js';
export type { UserAvatar, UserAvatarEvent, IUserAvatarManager } from './core/interfaces/IUserAvatarManager.js';
export type { BotConfiguration, BotProfile, BotContext, IConfigurationProvider } from './core/interfaces/IConfigurationProvider.js';
export type { IPresenceManager, PresenceUser } from './core/interfaces/IPresenceManager.js';
export type { IMessageService } from './core/interfaces/IMessageService.js';
export type { IAvatarController, AvatarState } from './core/interfaces/IAvatarController.js';
export type { IAuthenticationService } from './core/interfaces/IAuthenticationService.js';
export type { IWebSocketConnectionManager, WebSocketState } from './core/interfaces/IWebSocketConnectionManager.js';
export type { IConnectionManager } from './core/interfaces/IConnectionManager.js';
export type { IRateLimiter } from './core/interfaces/IRateLimiter.js';
export type { IAppSettings } from './core/interfaces/IAppSettings.js';

// Service Container (DIコンテナ)
export { ServiceContainer } from './core/ServiceContainer.js';

// NAF Message Builder (ユーティリティ)
export { NafMessageBuilder, NafComponentId } from './core/builders/NafMessageBuilder.js';
export type { 
  NafAvatarConfig,
  NafDataType,
  NafMessage
} from './core/builders/NafMessageBuilder.js';