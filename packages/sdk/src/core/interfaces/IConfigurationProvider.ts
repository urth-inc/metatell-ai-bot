import { ServiceIdentifier } from '../ServiceIdentifier.js'

export interface BotProfile {
  displayName: string
  avatarId: string
}

export interface BotContext {
  mobile: boolean
  embed: boolean
  hmd: boolean
}

export interface BotVoiceConfig {
  enabled: boolean
  useMock?: boolean // 開発・テスト用
  livekitUrl?: string // デフォルト: wss://livekit.metatell.app
  audioConfig?: {
    sampleRate?: 48000 | 24000 | 16000
    channels?: 1 | 2
    frameDurationMs?: 10 | 20
  }
}

export interface BotConfiguration {
  serverUrl: string // WebSocket server URL (wss://...)
  hubUrl: string // Hub API URL (https://...)
  hubId: string
  profile: BotProfile
  context?: BotContext
  debug?: boolean
  storageUrl?: string // Avatar storage URL (defaults to storage.metatell.app)
  botAccessKey?: string // Bot access key for OAuth-required hubs
  voice?: BotVoiceConfig // 音声通信設定
  organizationAvatarUrl?: string // Organization avatar GLTF URL from API
}

export interface IConfigurationProvider {
  get<T = unknown>(key: string): T | undefined
  getConfiguration(): BotConfiguration
}

// Service identifier token for dependency injection
export abstract class ConfigurationProvider extends ServiceIdentifier<IConfigurationProvider> {}
