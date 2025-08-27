export interface BotProfile {
  displayName: string
  avatarId: string
}

export interface BotContext {
  mobile: boolean
  embed: boolean
  hmd: boolean
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
  livekitUrl?: string // LiveKit server URL (wss://...)
  apiBaseUrl?: string // API base URL for LiveKit token endpoint
}

export interface IConfigurationProvider {
  get<T = unknown>(key: string): T | undefined
  getConfiguration(): BotConfiguration
}
