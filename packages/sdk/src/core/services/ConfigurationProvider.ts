import type {
  BotConfiguration,
  IConfigurationProvider,
} from '../interfaces/IConfigurationProvider.js'

export class ConfigurationProvider implements IConfigurationProvider {
  private readonly config: BotConfiguration

  constructor(initialConfig: BotConfiguration) {
    // Create a deep copy of the configuration to ensure complete isolation
    this.config = JSON.parse(JSON.stringify({
      ...initialConfig,
      context: initialConfig.context || {
        mobile: false,
        embed: false,
        hmd: false,
      },
    }))
    
    // Deep freeze the configuration to prevent any modifications
    this.deepFreeze(this.config)
  }

  /**
   * Recursively freeze an object and all its nested properties
   * This ensures complete immutability of the configuration
   */
  private deepFreeze(obj: unknown): void {
    if (obj && typeof obj === 'object') {
      Object.freeze(obj)
      Object.values(obj).forEach(value => {
        this.deepFreeze(value)
      })
    }
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
    // Return a deep copy to ensure true immutability
    // JSON.parse/stringify is the simplest way to create a deep copy
    // This ensures that even nested objects are completely independent
    return JSON.parse(JSON.stringify(this.config))
  }
}
