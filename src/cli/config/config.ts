/**
 * Configuration management with priority:
 * 1. Command line flags (highest)
 * 2. Environment variables
 * 3. Config file (~/.metatell/config.json)
 * 4. .env file (lowest)
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface Config {
  url?: string
  token?: string
  profile?: {
    displayName?: string
    avatarId?: string
  }
  rate?: {
    messagesPerSec?: number
    movesPerSec?: number
    looksPerSec?: number
  }
  debug?: boolean
}

export interface ConfigProfile extends Config {
  name: string
}

export class ConfigManager {
  private config: Config = {}
  private profiles: Map<string, ConfigProfile> = new Map()

  constructor() {
    this.loadConfig()
  }

  private loadConfig(): void {
    // 1. Load .env file
    this.loadEnvFile()

    // 2. Load config file
    this.loadConfigFile()

    // 3. Load environment variables
    this.loadEnvironmentVariables()
  }

  private loadEnvFile(): void {
    const envPath = join(process.cwd(), '.env')
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8')
      content.split('\n').forEach((line) => {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=')
          const value = valueParts.join('=').trim()
          process.env[key.trim()] = value
        }
      })
    }
  }

  private loadConfigFile(): void {
    const configPath = join(homedir(), '.metatell', 'config.json')
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8')
        const data = JSON.parse(content)

        // メイン設定
        if (data.url) this.config.url = data.url
        if (data.token) this.config.token = data.token
        if (data.profile) this.config.profile = data.profile
        if (data.rate) this.config.rate = data.rate
        if (data.debug !== undefined) this.config.debug = data.debug

        // プロファイル
        if (data.profiles) {
          Object.entries(data.profiles).forEach(([name, profile]) => {
            this.profiles.set(name, { name, ...(profile as Config) })
          })
        }
      } catch (error) {
        console.error('Failed to load config file:', error)
      }
    }
  }

  private loadEnvironmentVariables(): void {
    if (process.env.METATELL_URL) {
      this.config.url = process.env.METATELL_URL
    }
    if (process.env.METATELL_TOKEN || process.env.METATELL_AUTH_TOKEN) {
      this.config.token = process.env.METATELL_TOKEN || process.env.METATELL_AUTH_TOKEN
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
  getConfig(flags: Record<string, string | boolean> = {}): Config {
    const result: Config = { ...this.config }

    // プロファイルの適用
    if (flags['--profile'] && typeof flags['--profile'] === 'string') {
      const profile = this.profiles.get(flags['--profile'])
      if (profile) {
        Object.assign(result, profile)
      }
    }

    // フラグによる上書き
    if (flags['--url'] && typeof flags['--url'] === 'string') {
      result.url = flags['--url']
    }
    if (flags['--token'] && typeof flags['--token'] === 'string') {
      result.token = this.resolveToken(flags['--token'])
    }
    if (flags['--debug'] === true) {
      result.debug = true
    }

    return result
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
