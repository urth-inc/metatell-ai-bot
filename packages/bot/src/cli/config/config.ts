/**
 * Configuration management with priority:
 * 1. Command line flags (highest)
 * 2. Environment variables
 * 3. Config file (discovered by cosmiconfig)
 * 4. .env file (lowest)
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cosmiconfig } from 'cosmiconfig'
import { config as dotenvConfig } from 'dotenv'
import * as v from 'valibot'
import {
  type Config,
  ConfigFileSchema,
  type ConfigProfile,
  ConfigSchema,
  EnvVarsSchema,
  FlagsSchema,
  UrlSchema,
} from '../../schemas/index.js'

export type { Config, ConfigProfile } from '../../schemas/index.js'

export class ConfigManager {
  private config: Config = {}
  private profiles: Map<string, ConfigProfile> = new Map()
  private explorer = cosmiconfig('metatell')

  constructor() {
    // Synchronous initialization
    this.loadEnvFile()
    this.loadEnvironmentVariables()
  }

  private async loadConfig(): Promise<void> {
    // Load config file using cosmiconfig (async)
    await this.loadConfigFile()
  }

  private loadEnvFile(): void {
    // Use dotenv to properly parse .env file
    // This handles edge cases like comments, quotes, multiline values, etc.
    // Suppress dotenv's default output by temporarily redirecting console
    const originalConsoleLog = console.log
    console.log = () => {} // Temporarily disable console.log

    try {
      dotenvConfig({ path: join(process.cwd(), '.env') })
    } finally {
      console.log = originalConsoleLog // Restore console.log
    }
  }

  private async loadConfigFile(): Promise<void> {
    try {
      const result = await this.explorer.search()
      if (result?.config) {
        // Validate config file
        const validationResult = v.safeParse(ConfigFileSchema, result.config)
        if (!validationResult.success) {
          console.error('Invalid config file format:', v.flatten(validationResult.issues))
          return
        }

        const validatedData = validationResult.output

        // Main configuration
        if (validatedData.url) this.config.url = validatedData.url
        if (validatedData.token) this.config.token = validatedData.token
        if (validatedData.profile) this.config.profile = validatedData.profile
        if (validatedData.rate) this.config.rate = validatedData.rate
        if (validatedData.debug !== undefined) this.config.debug = validatedData.debug

        // Profiles
        if (validatedData.profiles) {
          Object.entries(validatedData.profiles).forEach(([name, profile]) => {
            this.profiles.set(name, { name, ...profile })
          })
        }
      }
    } catch (error) {
      console.error('Failed to load config file:', error)
    }
  }

  private loadEnvironmentVariables(): void {
    // Validate environment variables
    const envResult = v.safeParse(EnvVarsSchema, process.env)
    if (!envResult.success) {
      // Log validation issues but continue (env vars are optional)
      if (this.config.debug) {
        console.warn('Environment variable validation issues:', v.flatten(envResult.issues))
      }
    }

    if (process.env.METATELL_URL) {
      const urlResult = v.safeParse(UrlSchema, process.env.METATELL_URL)
      if (urlResult.success) {
        this.config.url = urlResult.output
      } else {
        console.warn(`Invalid METATELL_URL: ${process.env.METATELL_URL}`)
      }
    }
    if (process.env.METATELL_TOKEN || process.env.METATELL_AUTH_TOKEN) {
      this.config.token = process.env.METATELL_TOKEN || process.env.METATELL_AUTH_TOKEN
    }
    if (process.env.BOT_ACCESS_KEY) {
      this.config.botAccessKey = process.env.BOT_ACCESS_KEY
    }
    if (process.env.BOT_NAME) {
      this.config.profile = this.config.profile || {}
      this.config.profile.displayName = process.env.BOT_NAME
    }
    if (process.env.AVATAR_ID) {
      this.config.profile = this.config.profile || {}
      this.config.profile.avatarId = process.env.AVATAR_ID
    }
    if (process.env.DEBUG === 'true') {
      this.config.debug = true
    }
  }

  /**
   * Get configuration with command line overrides
   */
  async getConfig(flags: Record<string, string | boolean> = {}): Promise<Config> {
    // Ensure config file is loaded
    await this.loadConfig()
    // Validate flags
    const flagsResult = v.safeParse(FlagsSchema, flags)
    if (!flagsResult.success) {
      throw new Error(
        `Invalid command line flags: ${JSON.stringify(v.flatten(flagsResult.issues))}`,
      )
    }

    const result: Config = { ...this.config }

    // Apply profile
    if (flags['--profile'] && typeof flags['--profile'] === 'string') {
      const profile = this.profiles.get(flags['--profile'])
      if (profile) {
        Object.assign(result, profile)
      }
    }

    // Override with flags
    if (flags['--url'] && typeof flags['--url'] === 'string') {
      result.url = flags['--url']
    }
    if (flags['--token'] && typeof flags['--token'] === 'string') {
      result.token = this.resolveToken(flags['--token'])
    }
    if (flags['--debug'] === true) {
      result.debug = true
    }

    // Validate final configuration
    const configResult = v.safeParse(ConfigSchema, result)
    if (!configResult.success) {
      throw new Error(`Invalid configuration: ${JSON.stringify(v.flatten(configResult.issues))}`)
    }

    return configResult.output
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
  getProfiles(): string[] {
    return Array.from(this.profiles.keys())
  }
}
