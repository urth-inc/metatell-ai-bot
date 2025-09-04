// Core Service Factory (SDKの基盤)

// NAF Types (strongly-typed NAF message definitions)
export type {
  AnimationPlaybackResult,
  AnimationPlayOptions,
  AvatarComponentData,
  AvatarState,
  BotConfiguration,
  BotContext,
  BotProfile,
  EulerRotation,
  IChannelService,
  IWebSocketConnectionManager,
  NAFComponentMap,
  NAFCreateMessage,
  NAFEntityData,
  NAFMultiUpdateMessage,
  NAFRemoveMessage,
  NafAvatarConfig,
  NafDataType,
  NafMessage,
  OrganizationAvatar,
  OrganizationInfo,
  Position3D,
  PresenceUser,
  Quaternion,
  Scale3D,
  ServiceType,
  TypedNAFMessage,
  UserAvatar,
  UserAvatarEvent,
  VRMAnimation,
  WebSocketState,
} from '@metatell/bot-core'
// NAF Message Builder (ユーティリティ)
// Core Interfaces (公開する型定義)
// Service Container (DIコンテナ)
export {
  AnimationService,
  AppSettings,
  AuthenticationService,
  AvatarController,
  ChannelService,
  ConfigurationProvider,
  ConnectionManager,
  CoreServiceFactory,
  CoreServiceFactory as ServiceFactory,
  EventBus,
  extractAvatarData,
  extractBodyRotation,
  extractPosition,
  type IAnimationService,
  type IAppSettings,
  type IAuthenticationService,
  type IAvatarController,
  type IConfigurationProvider,
  type IConnectionManager,
  type IEventBus,
  type IMessageService,
  type IOrganizationService,
  type IPresenceManager,
  type IUserAvatarManager,
  isNAFCreateMessage,
  isNAFMultiUpdateMessage,
  isNAFRemoveMessage,
  isTypedNAFMessage,
  MessageService,
  NafComponentId,
  NafMessageBuilder,
  OrganizationService,
  PresenceManager,
  ServiceContainer,
  ServiceIdentifier,
  type ServiceKey,
  SystemEvents,
  UserAvatarManager,
} from '@metatell/bot-core'
export type { MetatellClient } from './client.js'
// New Facade API
export { createMetatellClient } from './client.js'
export { pcm } from './pcm-utils.js'
export type {
  AgentClient,
  AgentClientConfig,
  AgentClientEvents,
  ConnectionOptions,
  ConnectionStatus,
} from './sdk/AgentClient.js'
// Agent Client (SDKのメインインターフェース)
export {
  createAgentClient,
  createAgentClientWithFactory,
  DefaultAgentClient,
} from './sdk/AgentClient.js'
// Errors (公開API)
export * from './sdk/errors.js'
// Logging (拡張ポイント)
export * from './sdk/logging/index.js'
// Rate Limiting
export { RateLimitedQueue, TokenBucketRateLimiter } from './sdk/rate.js'
export type {
  Animation,
  AvatarAsset,
  BotInfo,
  CreateClientOptions,
  Euler,
  MetatellClientEvents,
  PcmInput,
  PcmInputOptions,
  PlaybackControls,
  User,
  Vec3,
  // Error classes are already exported from './sdk/errors.js'
  // MetatellError, AuthError, NetworkError, NotFoundError, etc.
} from './types.js'
