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
  authUrl: string
  hubUrl: string
  hubId: string
  profile: BotProfile
  context?: BotContext
  debug?: boolean
}

export interface IConfigurationProvider {
  get<T = unknown>(key: string): T | undefined
  getConfiguration(): BotConfiguration
}
