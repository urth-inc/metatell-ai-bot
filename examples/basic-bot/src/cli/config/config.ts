/**
 * Configuration management with priority:
 * 1. Command line flags (highest)
 * 2. Environment variables
 * 3. Config file (discovered by cosmiconfig)
 * 4. .env file (lowest)
 */

import { existsSync, readFileSync } from 'node:fs'
import { type CosmiconfigResult, cosmiconfig } from 'cosmiconfig'
import { config as dotenvConfig } from 'dotenv'
import * as v from 'valibot'
import {
  type Config,
  ConfigFileSchema,
  ConfigSchema,
  EnvVarsSchema,
  FlagsSchema,
  UrlSchema,
} from '../../schemas/index.js'

export type { Config, ConfigProfile } from '../../schemas/index.js'

export class ConfigManager {
  private readonly explorer = cosmiconfig('metatell', {
    // Search for these files in order
    searchPlaces: [
      'package.json',
      '.metatellrc',
      '.metatellrc.json',
      '.metatellrc.yaml',
      '.metatellrc.yml',
      '.metatellrc.js',
      '.metatellrc.cjs',
      'metatell.config.js',
      'metatell.config.cjs',
    ],
    // Support loading from package.json
    packageProp: 'metatell',
  })
  private configResult: CosmiconfigResult | null = null

  constructor() {
    // Load .env file synchronously
    this.loadEnvFile()
  }

  private loadEnvFile(): void {
    // Suppress dotenv's default output
    const originalConsoleLog = console.log
    console.log = () => {} // Temporarily disable console.log

    try {
      dotenvConfig()
    } finally {
      console.log = originalConsoleLog // Restore console.log
    }
  }

  /**
   * Get configuration with priority handling
   */
  async getConfig(flags: Record<string, string | boolean> = {}): Promise<Config> {
    // Validate flags first
    const flagsResult = v.safeParse(FlagsSchema, flags)
    if (!flagsResult.success) {
      throw new Error(
        `Invalid command line flags: ${JSON.stringify(v.flatten(flagsResult.issues))}`,
      )
    }

    // Initialize base config
    const mergedConfig: Config = {}

    // 1. Load config file (lowest priority)
    if (!this.configResult) {
      this.configResult = await this.explorer.search()
    }

    if (this.configResult?.config) {
      const validationResult = v.safeParse(ConfigFileSchema, this.configResult.config)
      if (validationResult.success) {
        const fileConfig = validationResult.output

        // Apply base config
        Object.assign(mergedConfig, {
          url: fileConfig.url,
          token: fileConfig.token,
          profile: fileConfig.profile,
          rate: fileConfig.rate,
          debug: fileConfig.debug,
          botAccessKey: fileConfig.botAccessKey,
        })

        // Apply profile if specified in flags
        if (flags['--profile'] && typeof flags['--profile'] === 'string') {
          const profileName = flags['--profile']
          const profile = fileConfig.profiles?.[profileName]
          if (profile) {
            Object.assign(mergedConfig, {
              ...profile,
              profile: { ...mergedConfig.profile, ...profile.profile },
            })
          }
        }
      } else {
        console.warn('Invalid config file format:', v.flatten(validationResult.issues))
      }
    }

    // 2. Apply environment variables (medium priority)
    const envConfig = this.getEnvConfig()
    Object.assign(mergedConfig, envConfig)

    // 3. Apply command line flags (highest priority)
    if (flags['--url'] && typeof flags['--url'] === 'string') {
      mergedConfig.url = flags['--url']
    }
    if (flags['--token'] && typeof flags['--token'] === 'string') {
      mergedConfig.token = this.resolveToken(flags['--token'])
    }
    if (flags['--debug'] === true) {
      mergedConfig.debug = true
    }

    // Validate final configuration
    const configResult = v.safeParse(ConfigSchema, mergedConfig)
    if (!configResult.success) {
      throw new Error(`Invalid configuration: ${JSON.stringify(v.flatten(configResult.issues))}`)
    }

    return configResult.output
  }

  private getEnvConfig(): Partial<Config> {
    const envConfig: Partial<Config> = {}

    // Validate environment variables
    const envResult = v.safeParse(EnvVarsSchema, process.env)
    if (!envResult.success && process.env.DEBUG === 'true') {
      console.warn('Environment variable validation issues:', v.flatten(envResult.issues))
    }

    if (process.env.METATELL_URL) {
      const urlResult = v.safeParse(UrlSchema, process.env.METATELL_URL)
      if (urlResult.success) {
        envConfig.url = urlResult.output
      } else {
        console.warn(`Invalid METATELL_URL: ${process.env.METATELL_URL}`)
      }
    }

    if (process.env.METATELL_TOKEN || process.env.METATELL_AUTH_TOKEN) {
      envConfig.token = process.env.METATELL_TOKEN || process.env.METATELL_AUTH_TOKEN
    }

    if (process.env.BOT_ACCESS_KEY) {
      envConfig.botAccessKey = process.env.BOT_ACCESS_KEY
    }

    if (process.env.BOT_NAME || process.env.AVATAR_ID) {
      envConfig.profile = {}
      if (process.env.BOT_NAME) {
        envConfig.profile.displayName = process.env.BOT_NAME
      }
      if (process.env.AVATAR_ID) {
        envConfig.profile.avatarId = process.env.AVATAR_ID
      }
    }

    if (process.env.DEBUG === 'true') {
      envConfig.debug = true
    }

    return envConfig
  }

  /**
   * Resolve token value (support @file syntax)
   */
  private resolveToken(value: string): string {
    if (value.startsWith('@')) {
      const filePath = value.substring(1)
      if (existsSync(filePath)) {
        return readFileSync(filePath, 'utf-8').trim()
      }
      throw new Error(`Token file not found: ${filePath}`)
    }
    return value
  }

  /**
   * Get available profiles
   */
  async getProfiles(): Promise<string[]> {
    if (!this.configResult) {
      this.configResult = await this.explorer.search()
    }

    if (this.configResult?.config) {
      const validationResult = v.safeParse(ConfigFileSchema, this.configResult.config)
      if (validationResult.success && validationResult.output.profiles) {
        return Object.keys(validationResult.output.profiles)
      }
    }

    return []
  }

  /**
   * Clear cached configuration (useful for testing)
   */
  clearCache(): void {
    this.configResult = null
  }
}
