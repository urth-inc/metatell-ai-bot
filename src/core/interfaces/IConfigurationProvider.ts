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
  set<T = unknown>(key: string, value: T): void
  getConfiguration(): BotConfiguration
  updateProfile(profile: Partial<BotProfile>): void
  updateContext(context: Partial<BotContext>): void
}
