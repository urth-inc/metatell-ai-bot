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
}

export interface IConfigurationProvider {
  get<T = any>(key: string): T | undefined
  set<T = any>(key: string, value: T): void
  getConfiguration(): BotConfiguration
  updateProfile(profile: Partial<BotProfile>): void
  updateContext(context: Partial<BotContext>): void
}