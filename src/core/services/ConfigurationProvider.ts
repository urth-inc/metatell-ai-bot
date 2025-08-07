import {
  IConfigurationProvider,
  BotConfiguration,
  BotProfile,
  BotContext
} from '../interfaces/IConfigurationProvider'

export class ConfigurationProvider implements IConfigurationProvider {
  private config: BotConfiguration
  private customSettings = new Map<string, any>()

  constructor(initialConfig: BotConfiguration) {
    this.config = {
      ...initialConfig,
      context: initialConfig.context || {
        mobile: false,
        embed: false,
        hmd: false
      }
    }
  }

  get<T = any>(key: string): T | undefined {
    // Check custom settings first
    if (this.customSettings.has(key)) {
      return this.customSettings.get(key) as T
    }

    // Check nested config properties
    const keys = key.split('.')
    let value: any = this.config
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k]
      } else {
        return undefined
      }
    }
    
    return value as T
  }

  set<T = any>(key: string, value: T): void {
    this.customSettings.set(key, value)
  }

  getConfiguration(): BotConfiguration {
    return { ...this.config }
  }

  updateProfile(profile: Partial<BotProfile>): void {
    this.config.profile = {
      ...this.config.profile,
      ...profile
    }
  }

  updateContext(context: Partial<BotContext>): void {
    this.config.context = {
      ...this.config.context!,
      ...context
    }
  }
}