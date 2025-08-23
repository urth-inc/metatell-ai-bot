// Core Service Factory (SDKの基盤)

export type {
  NafAvatarConfig,
  NafDataType,
  NafMessage,
} from './core/builders/NafMessageBuilder.js'
// NAF Message Builder (ユーティリティ)
export { NafComponentId, NafMessageBuilder } from './core/builders/NafMessageBuilder.js'
export {
  CoreServiceFactory,
  CoreServiceFactory as ServiceFactory,
} from './core/CoreServiceFactory.js'
export type { IAppSettings } from './core/interfaces/IAppSettings.js'
export type { IAuthenticationService } from './core/interfaces/IAuthenticationService.js'
export type { AvatarState, IAvatarController } from './core/interfaces/IAvatarController.js'
export type {
  BotConfiguration,
  BotContext,
  BotProfile,
  IConfigurationProvider,
} from './core/interfaces/IConfigurationProvider.js'
export type { IConnectionManager } from './core/interfaces/IConnectionManager.js'
// Core Interfaces (公開する型定義)
export type { IEventBus, SystemEvents } from './core/interfaces/IEventBus.js'
export type { IMessageService } from './core/interfaces/IMessageService.js'
export type { IPresenceManager, PresenceUser } from './core/interfaces/IPresenceManager.js'
export type {
  IUserAvatarManager,
  UserAvatar,
  UserAvatarEvent,
} from './core/interfaces/IUserAvatarManager.js'
export type {
  IWebSocketConnectionManager,
  WebSocketState,
} from './core/interfaces/IWebSocketConnectionManager.js'
// Service Container (DIコンテナ)
export { ServiceContainer } from './core/ServiceContainer.js'
// NAF Types (strongly-typed NAF message definitions)
export type {
  AvatarComponentData,
  EulerRotation,
  NAFComponentMap,
  NAFCreateMessage,
  NAFEntityData,
  NAFMultiUpdateMessage,
  NAFRemoveMessage,
  Position3D,
  Quaternion,
  Scale3D,
  TypedNAFMessage,
} from './core/types/naf.js'
export {
  extractAvatarData,
  extractBodyRotation,
  extractPosition,
  isNAFCreateMessage,
  isNAFMultiUpdateMessage,
  isNAFRemoveMessage,
  isTypedNAFMessage,
} from './core/types/naf.js'
export type {
  AgentClient,
  AgentClientConfig,
  AgentClientEvents,
  ConnectionOptions,
  ConnectionStatus,
} from './sdk/AgentClient.js'
// Agent Client (SDKのメインインターフェース)
export { createAgentClient } from './sdk/AgentClient.js'
// Errors (公開API)
export * from './sdk/errors.js'
// Logging (拡張ポイント)
export * from './sdk/logging/index.js'
// Rate Limiting
export { RateLimitedQueue, TokenBucketRateLimiter } from './sdk/rate.js'
