import type {
  BotConfiguration,
  IConfigurationProvider,
} from '../interfaces/IConfigurationProvider.js'

export class ConfigurationProvider implements IConfigurationProvider {
  private readonly config: BotConfiguration

  constructor(initialConfig: BotConfiguration) {
    // Create an immutable copy of the configuration
    this.config = {
      ...initialConfig,
      context: initialConfig.context || {
        mobile: false,
        embed: false,
        hmd: false,
      },
    }
    // Freeze the configuration to prevent modifications
    Object.freeze(this.config)
    Object.freeze(this.config.profile)
    Object.freeze(this.config.context)
  }

  get<T = unknown>(key: string): T | undefined {
    // Check nested config properties
    const keys = key.split('.')
    let value: unknown = this.config

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k]
      } else {
        return undefined
      }
    }

    return value as T
  }

  getConfiguration(): BotConfiguration {
    // Return a copy to prevent external modifications
    return {
      ...this.config,
      profile: { ...this.config.profile },
      context: this.config.context ? { ...this.config.context } : undefined,
    }
  }
}
