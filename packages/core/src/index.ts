// Core Service Factory (内部実装のメインエントリーポイント)

// NAF Message Builder (ユーティリティ)
export type {
  NafAvatarConfig,
  NafDataType,
  NafMessage,
} from './builders/NafMessageBuilder.js'
export { NafComponentId, NafMessageBuilder } from './builders/NafMessageBuilder.js'
export { CoreServiceFactory } from './CoreServiceFactory.js'
// Errors
export {
  AnimationNotFoundError,
  AnimationPlaybackError,
  AvatarNotSpawnedError,
} from './errors/animation-errors.js'

// Core Interfaces (サービスインターフェース)
export { AnimationService, type IAnimationService } from './interfaces/IAnimationService.js'
export { AppSettings, type IAppSettings } from './interfaces/IAppSettings.js'
export {
  AuthenticationService,
  type IAuthenticationService,
} from './interfaces/IAuthenticationService.js'
export type { AvatarState } from './interfaces/IAvatarController.js'
export { AvatarController, type IAvatarController } from './interfaces/IAvatarController.js'
export type {
  BotConfiguration,
  BotContext,
  BotProfile,
} from './interfaces/IConfigurationProvider.js'
export {
  ConfigurationProvider,
  type IConfigurationProvider,
} from './interfaces/IConfigurationProvider.js'
export { ConnectionManager, type IConnectionManager } from './interfaces/IConnectionManager.js'
export { EventBus, type IEventBus, SystemEvents } from './interfaces/IEventBus.js'
export { type IMessageService, MessageService } from './interfaces/IMessageService.js'
export type {
  OrganizationAvatar,
  OrganizationInfo,
} from './interfaces/IOrganizationService.js'
export {
  type IOrganizationService,
  OrganizationService,
} from './interfaces/IOrganizationService.js'
export type { PresenceUser } from './interfaces/IPresenceManager.js'
export { type IPresenceManager, PresenceManager } from './interfaces/IPresenceManager.js'
export type {
  UserAvatar,
  UserAvatarEvent,
} from './interfaces/IUserAvatarManager.js'
export { type IUserAvatarManager, UserAvatarManager } from './interfaces/IUserAvatarManager.js'
export type {
  IWebSocketConnectionManager,
  WebSocketState,
} from './interfaces/IWebSocketConnectionManager.js'
// Service Container (DIコンテナ)
export { ServiceContainer, type ServiceKey } from './ServiceContainer.js'
export type { ServiceType } from './ServiceIdentifier.js'
export { ServiceIdentifier } from './ServiceIdentifier.js'
// Channel Service
export { ChannelService } from './services/ChannelService.js'
export type { IChannelService } from './services/IChannelService.js'
// Animation Types
export type {
  AnimationConfig,
  AnimationEvent,
  AnimationNAFMessage,
  AnimationPlaybackResult,
  AnimationPlayOptions,
  VRMAnimation,
} from './types/animation.js'
export { AnimationLoopBehavior, PresetAnimationId } from './types/animation.js'
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
} from './types/naf.js'
export {
  extractAvatarData,
  extractBodyRotation,
  extractPosition,
  isNAFCreateMessage,
  isNAFMultiUpdateMessage,
  isNAFRemoveMessage,
  isTypedNAFMessage,
} from './types/naf.js'
