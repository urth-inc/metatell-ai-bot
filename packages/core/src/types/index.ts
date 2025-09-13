/**
 * Core types used across the SDK
 */

export type {
  Animation,
  AvatarAsset,
  BotInfo,
  Euler,
  MetatellClient,
  MetatellClientEvents,
  PcmInputOptions,
  PlaybackControls,
  User,
  Vec3,
} from './client.js'
export type { VoiceCapableClient } from './voice.js'

/**
 * NAF (Networked A-Frame) component data
 */
export interface NAFComponent {
  networkId: string
  owner: string
  creator: string
  template: string
  components: Record<string, unknown>
}
