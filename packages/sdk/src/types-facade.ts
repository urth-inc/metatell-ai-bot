/**
 * Re-export types from core
 * SDK specific types should be defined here
 */

// Re-export from core
export type {
  Animation,
  AvatarAsset,
  BotInfo,
  ConnectOptions,
  CreateClientOptions,
  Euler,
  MetatellClient,
  MetatellClientEvents,
  NavigationCursor,
  NavigationRuntime,
  NavigationSnapshot,
  NavigationSpawnPoint,
  NavigationStepResult,
  NavigationValidator,
  PcmInputOptions,
  PlaybackControls,
  PrepareNavigationOptions,
  PrepareNavigationResult,
  PreviousNavigation,
  RoomJoinInfo,
  RoomSceneChangedEvent,
  RoomSceneInfo,
  User,
  Vec3,
} from '@metatell/bot-core'

// SDK-specific types (if any)
export type PcmInput = Int16Array | AsyncIterable<Int16Array> | NodeJS.ReadableStream

// SDK-specific error types
export { MetatellError } from './sdk/errors.js'

// MessageEventData - might be SDK specific
export interface MessageEventData {
  type: string
  body?: string
  senderId?: string
}
