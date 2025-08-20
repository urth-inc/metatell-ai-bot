/**
 * Agent Client - facade for CLI/SDK usage
 */

import type { MetatellBot } from '../bots/MetatellBot.js'
import type { IConnectionManager } from '../core/interfaces/IConnectionManager.js'
import type { IUserAvatarManager, UserAvatar } from '../core/interfaces/IUserAvatarManager.js'
import type { ServiceFactory } from '../core/ServiceFactory.js'
import { getLogger } from './logging/index.js'
import { RateLimitedQueue } from './rate.js'

export interface ConnectionOptions {
  url: string
  token?: string
  authUrl?: string  // Allow passing authUrl directly
  hubUrl?: string   // Allow passing hubUrl directly
  hubId?: string    // Allow passing hubId directly
}

export interface AgentClientConfig {
  profile?: {
    displayName?: string
    avatarId?: string
  }
  rateLimit?: {
    messages?: number
    moves?: number
    looks?: number
  }
}

export interface ConnectionStatus {
  connected: boolean
  connecting: boolean
  room?: string
  sessionId?: string
  retries: number
  rtt?: number
}

export interface AgentClient {
  // Connection management
  connect(options: ConnectionOptions): Promise<void>
  disconnect(): Promise<void>
  join(room: string): Promise<void>
  leave(): Promise<void>
  getStatus(): ConnectionStatus

  // Messaging
  send(message: string): Promise<void>

  // Avatar control
  move(position: { x: number; y: number; z: number }): Promise<void>
  look(target: { x: number; y: number; z: number } | { userId: string }): Promise<void>
  lookAtNearest(): Promise<void>

  // User management
  getUsers(): UserAvatar[]
  getUser(id: string): UserAvatar | undefined
  getUsersNearby(radius: number): UserAvatar[]

  // Event handling
  on(event: string, handler: (...args: unknown[]) => void): void
  off(event: string, handler: (...args: unknown[]) => void): void

  // Utilities
  setRateLimit(key: 'messages' | 'moves' | 'looks', perSecond: number): void
  getRateLimit(key: 'messages' | 'moves' | 'looks'): number | undefined
}

/**
 * Default implementation using existing services
 */
export class DefaultAgentClient implements AgentClient {
  private bot: MetatellBot
  private userAvatarManager: IUserAvatarManager
  private rateLimiter = new RateLimitedQueue()
  private logger = getLogger('AgentClient')
  private status: ConnectionStatus = {
    connected: false,
    connecting: false,
    retries: 0,
  }

  constructor(
    private factory: ServiceFactory,
    config: AgentClientConfig = {},
  ) {
    // 既存のサービスを取得
    this.bot = factory.getService('MetatellBot') as MetatellBot
    this.userAvatarManager = factory.getService('IUserAvatarManager') as IUserAvatarManager

    // レート制限の設定
    if (config.rateLimit?.messages) {
      this.rateLimiter.setRate('messages', config.rateLimit.messages)
    }
    if (config.rateLimit?.moves) {
      this.rateLimiter.setRate('moves', config.rateLimit.moves)
    }
    if (config.rateLimit?.looks) {
      this.rateLimiter.setRate('looks', config.rateLimit.looks)
    }
  }

  async connect(options: ConnectionOptions): Promise<void> {
    this.logger.info('Connecting to server', options)
    this.status.connecting = true

    try {
      let authUrl: string
      let _hubUrl: string
      let hubId: string

      // Use provided values or parse from URL
      if (options.authUrl && options.hubUrl && options.hubId) {
        authUrl = options.authUrl
        _hubUrl = options.hubUrl
        hubId = options.hubId
      } else {
        // URLを解析してauthUrlとhubIdを取得
        const url = new URL(options.url)

        // HTTPSからWSSに変換
        const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
        authUrl = `${protocol}//${url.host}`
        _hubUrl = options.url

        // hubIdを取得（パスから'/'を除去）
        const pathParts = url.pathname.split('/').filter(Boolean)
        hubId = pathParts[0]

        if (!hubId) {
          throw new Error('Invalid URL: hub ID not found')
        }
      }

      // Pass connection info directly to bot.start()
      await this.bot.start({
        authUrl,
        hubId,
        authToken: options.token,
      })

      // セッションIDを取得
      const connectionManager = this.factory.getService('IConnectionManager') as IConnectionManager
      const sessionId = connectionManager.getSessionId()
      this.status.sessionId = sessionId || undefined

      this.status.connected = true
      this.status.connecting = false
      this.logger.info('Connected successfully', {
        authUrl,
        hubId,
        sessionId: this.status.sessionId,
      })
    } catch (error) {
      this.status.connecting = false
      this.status.retries++
      this.logger.error('Connection failed', { error })
      throw error
    }
  }

  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from server')
    await this.bot.stop()
    this.status.connected = false
    this.status.room = undefined
    this.status.sessionId = undefined
  }

  async join(room: string): Promise<void> {
    this.logger.info('Joining room', { room })
    this.status.room = room
    // TODO: 実装
  }

  async leave(): Promise<void> {
    this.logger.info('Leaving room')
    this.status.room = undefined
    // TODO: 実装
  }

  getStatus(): ConnectionStatus {
    return { ...this.status }
  }

  async send(message: string): Promise<void> {
    return this.rateLimiter.execute('messages', async () => {
      this.logger.debug('Sending message', { message })
      await this.bot.sendMessage(message)
    })
  }

  async move(position: { x: number; y: number; z: number }): Promise<void> {
    return this.rateLimiter.execute('moves', async () => {
      this.logger.debug('Moving avatar', position)
      await this.bot.moveAvatar(position)
    })
  }

  async look(target: { x: number; y: number; z: number } | { userId: string }): Promise<void> {
    return this.rateLimiter.execute('looks', async () => {
      if ('userId' in target) {
        this.logger.debug('Looking at user', { userId: target.userId })
        await this.bot.lookAtUser(target.userId)
      } else {
        this.logger.debug('Looking at position', target)
        await this.bot.lookAt(target)
      }
    })
  }

  async lookAtNearest(): Promise<void> {
    return this.rateLimiter.execute('looks', async () => {
      this.logger.debug('Looking at nearest user')
      await this.bot.lookAtNearestUser()
    })
  }

  getUsers(): UserAvatar[] {
    return this.userAvatarManager.getUsers()
  }

  getUser(id: string): UserAvatar | undefined {
    return this.userAvatarManager.getUser(id)
  }

  getUsersNearby(radius: number): UserAvatar[] {
    const botState = this.bot.getAvatarState()
    if (!botState) return []
    return this.userAvatarManager.getUsersInRange(botState.position, radius)
  }

  on(_event: string, _handler: (...args: unknown[]) => void): void {
    // TODO: イベントシステムの統合
  }

  off(_event: string, _handler: (...args: unknown[]) => void): void {
    // TODO: イベントシステムの統合
  }

  setRateLimit(key: 'messages' | 'moves' | 'looks', perSecond: number): void {
    this.rateLimiter.setRate(key, perSecond)
  }

  getRateLimit(key: 'messages' | 'moves' | 'looks'): number | undefined {
    return this.rateLimiter.getRate(key)
  }
}

/**
 * Factory function to create agent client
 */
export function createAgentClient(
  factory: ServiceFactory,
  config?: AgentClientConfig,
): AgentClient {
  return new DefaultAgentClient(factory, config)
}
