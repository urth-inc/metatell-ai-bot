/**
 * Agent Client - facade for CLI/SDK usage
 */

import { EventEmitter } from 'node:events'
import type {
  BotConfiguration,
  BotVoiceConfig,
  IUserAvatarManager,
  UserAvatar,
} from '@metatell/bot-core'
// Realtime types will be defined locally to avoid circular dependencies
import {
  AnimationNotFoundError,
  AnimationPlaybackError,
  AnimationService,
  AvatarController,
  AvatarNotSpawnedError,
  ConfigurationProvider,
  ConnectionManager,
  CoreServiceFactory,
  type IAnimationService,
  type IAvatarController,
  type IConfigurationProvider,
  type IConnectionManager,
  type IMessageService,
  MessageService,
  UserAvatarManager,
} from '@metatell/bot-core'
import { getLogger } from './logging/index.js'
import { RateLimitedQueue } from './rate.js'

/**
 * Type-safe event definitions for AgentClient
 * Maps event names to their handler signatures
 */
export interface AgentClientEvents {
  // Connection events
  'connection:established': () => void
  'connection:lost': () => void
  'connection:error': (error: Error) => void

  // Room events
  'room:joined': (data: { session_id: string }) => void
  'room:left': () => void

  // User events
  'user:joined': (user: UserAvatar) => void
  'user:left': (user: UserAvatar) => void
  'user:updated': (user: UserAvatar) => void
  'user:moved': (user: UserAvatar) => void

  // Message events
  'message:received': (data: { body: string; session_id: string }) => void
  'message:sent': (message: string) => void

  // Avatar events
  'avatar:spawned': (state: {
    networkId: string
    position: { x: number; y: number; z: number }
  }) => void
  'avatar:moved': (state: { position: { x: number; y: number; z: number } }) => void

  // Voice events
  voiceFrameReceived: (data: { participantId: string; pcmData: Int16Array }) => void
  voiceConnected: () => void
  voiceDisconnected: () => void
  voiceError: (error: Error) => void
  'avatar:updated': (state: unknown) => void

  // Error events
  error: (error: Error) => void
}

export interface ConnectionOptions {
  url: string
  token?: string
  serverUrl?: string // Allow passing serverUrl directly (WebSocket URL)
  hubUrl?: string // Allow passing hubUrl directly (HTTP API URL)
  hubId?: string // Allow passing hubId directly
  voice?: BotVoiceConfig // Allow voice configuration at connection time
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

import type {
  AnimationPlaybackResult,
  AnimationPlayOptions,
  VRMAnimation,
} from '@metatell/bot-core'

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

  // Animation control
  playAnimation(
    animationId: string,
    options?: AnimationPlayOptions,
  ): Promise<AnimationPlaybackResult>
  stopAnimation(): Promise<void>
  getAvailableAnimations(): Promise<VRMAnimation[]>
  getCurrentAnimation(): string | null

  // User management
  getUsers(): UserAvatar[]
  getUser(id: string): UserAvatar | undefined
  getUsersNearby(radius: number): UserAvatar[]

  // Voice controls
  sendVoiceFrame(pcmData: Int16Array): Promise<void>
  muteVoice(muted: boolean): Promise<void>
  isVoiceMuted(): boolean

  // Event handling (type-safe)
  on<E extends keyof AgentClientEvents>(event: E, handler: AgentClientEvents[E]): this
  off<E extends keyof AgentClientEvents>(event: E, handler: AgentClientEvents[E]): this

  // Utilities
  setRateLimit(key: 'messages' | 'moves' | 'looks', perSecond: number): void
  getRateLimit(key: 'messages' | 'moves' | 'looks'): number | undefined
}

/**
 * Default implementation using existing services
 */
export class DefaultAgentClient extends EventEmitter implements AgentClient {
  private avatarController: IAvatarController
  private messageService: IMessageService
  private userAvatarManager: IUserAvatarManager
  private connectionManager: IConnectionManager
  private animationService?: IAnimationService
  // Voice transport functionality moved to consuming packages
  private rateLimiter = new RateLimitedQueue()
  private logger = getLogger('AgentClient')
  private factory: CoreServiceFactory
  private voiceMuted = false
  private status: ConnectionStatus = {
    connected: false,
    connecting: false,
    retries: 0,
  }
  private lastConnectionOptions?: ConnectionOptions
  private configProvider: IConfigurationProvider

  constructor(factory: CoreServiceFactory, config: AgentClientConfig = {}) {
    super()
    this.factory = factory
    // コアサービスインターフェースのみに依存（型推論で取得）
    this.avatarController = factory.getService(AvatarController)
    this.messageService = factory.getService(MessageService)
    this.userAvatarManager = factory.getService(UserAvatarManager)
    this.connectionManager = factory.getService(ConnectionManager)
    this.configProvider = factory.getService(ConfigurationProvider)

    // Optional services
    try {
      this.animationService = factory.getService(AnimationService)
    } catch {
      // Animation service is optional
      this.logger.debug('Animation service not available')
    }

    // Voice transport functionality moved to consuming packages

    // Setup event handlers for user join
    this.setupEventHandlers()

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

    // 接続オプションを保存
    this.lastConnectionOptions = options

    try {
      let serverUrl: string
      let hubId: string

      // Use provided values or parse from URL
      if (options.serverUrl && options.hubId) {
        serverUrl = options.serverUrl
        hubId = options.hubId
      } else {
        // URLを解析してserverUrlとhubIdを取得
        const url = new URL(options.url)

        // HTTPSからWSSに変換
        const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
        const port = url.port ? `:${url.port}` : ''
        serverUrl = `${protocol}//${url.hostname}${port}`

        // hubIdを取得（パスから'/'を除去）
        const pathParts = url.pathname.split('/').filter(Boolean)
        hubId = pathParts[0]

        if (!hubId) {
          throw new Error('Invalid URL: hub ID not found')
        }
      }

      // Connect through connection manager directly
      await this.connectionManager.connect({
        serverUrl,
        hubId,
      })

      // セッションIDを取得
      const sessionId = this.connectionManager.getSessionId()
      this.status.sessionId = sessionId || undefined

      // ハブチャンネルが準備できるまで待機
      let channel = this.connectionManager.getHubChannel()
      let retries = 0
      while (!channel && retries < 50) {
        // 最大5秒待機
        await new Promise((resolve) => setTimeout(resolve, 100))
        channel = this.connectionManager.getHubChannel()
        retries++
      }

      if (!channel) {
        throw new Error('Failed to get hub channel after connection')
      }

      // Send room entry events
      channel.push('events:entering', {})
      channel.push('events:entered', {
        initialOccupantCount: 0,
        isNewDaily: true,
        isNewMonthly: true,
        isNewDayWindow: true,
        isNewMonthWindow: true,
        entryDisplayType: 'Bot',
        userAgent: 'MetatellBot/1.0',
      })

      // Get avatar configuration and spawn
      const configProvider = this.factory.getService(
        ConfigurationProvider,
      ) as IConfigurationProvider
      const config = configProvider.getConfiguration()

      if (config.profile.avatarId) {
        this.logger.debug('Spawning avatar', {
          avatarId: config.profile.avatarId,
          organizationAvatarUrl: config.organizationAvatarUrl,
        })
        await this.avatarController.spawn(
          config.profile.avatarId,
          undefined,
          config.organizationAvatarUrl,
        )
      }

      // Voice connection functionality moved to consuming packages

      this.status.connected = true
      this.status.connecting = false
      this.logger.info('Connected successfully', {
        serverUrl,
        hubId,
        sessionId: this.status.sessionId,
        voiceEnabled: false, // Voice functionality moved to consuming packages
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

    // Voice disconnection functionality moved to consuming packages

    await this.connectionManager.disconnect()
    this.status.connected = false
    this.status.room = undefined
    this.status.sessionId = undefined
  }

  async join(room: string): Promise<void> {
    this.logger.info('Joining room', { room })

    // 既に接続されている場合は、一旦切断してから再接続
    if (this.status.connected) {
      await this.disconnect()
    }

    // 新しいroomに接続
    const config = this.configProvider.getConfiguration()
    const newUrl = config.hubUrl.replace(/\/[^/]+\/$/, `/${room}/`) // URLのroom部分を更新

    if (this.lastConnectionOptions?.url) {
      // URL形式の接続オプションを使用
      await this.connect({
        url: newUrl,
        token: this.lastConnectionOptions.token,
        voice: this.lastConnectionOptions.voice,
      })
    } else if (this.lastConnectionOptions) {
      // 個別パラメータ形式の接続オプションを使用
      await this.connect({
        ...this.lastConnectionOptions,
        hubId: room,
        hubUrl: newUrl,
      })
    } else {
      // 新規接続
      await this.connect({
        url: newUrl,
      })
    }

    this.status.room = room
  }

  async leave(): Promise<void> {
    this.logger.info('Leaving room')

    if (this.status.connected) {
      await this.disconnect()
    }

    this.status.room = undefined
  }

  getStatus(): ConnectionStatus {
    return { ...this.status }
  }

  async send(message: string): Promise<void> {
    return this.rateLimiter.execute('messages', async () => {
      await this.messageService.sendMessage(message)
    })
  }

  // Alias for send
  async say(message: string): Promise<void> {
    return this.send(message)
  }

  async move(position: { x: number; y: number; z: number }): Promise<void> {
    return this.rateLimiter.execute('moves', async () => {
      this.logger.debug('Moving avatar', position)
      await this.avatarController.move(position)
    })
  }

  async look(target: { x: number; y: number; z: number } | { userId: string }): Promise<void> {
    return this.rateLimiter.execute('looks', async () => {
      if ('userId' in target) {
        this.logger.debug('Looking at user', { userId: target.userId })
        const user = this.userAvatarManager.getUser(target.userId)
        if (!user) {
          throw new Error(`User not found: ${target.userId}`)
        }
        await this.lookAtPosition(user.position)
      } else {
        this.logger.debug('Looking at position', target)
        await this.lookAtPosition(target)
      }
    })
  }

  async lookAtNearest(): Promise<void> {
    return this.rateLimiter.execute('looks', async () => {
      this.logger.debug('Looking at nearest user')
      const currentState = this.avatarController.getState()
      if (!currentState) {
        throw new Error('Avatar not spawned')
      }

      const nearestUser = this.userAvatarManager.getNearestUser(currentState.position)
      if (!nearestUser) {
        throw new Error('No users found')
      }

      await this.lookAtPosition(nearestUser.position)
    })
  }

  private async lookAtPosition(target: { x: number; y: number; z: number }): Promise<void> {
    const currentState = this.avatarController.getState()
    if (!currentState) {
      throw new Error('Avatar not spawned')
    }

    // 向く方向を計算（Y軸回転のみ）
    const dx = target.x - currentState.position.x
    const dz = target.z - currentState.position.z
    const angle = Math.atan2(dx, dz)

    // クォータニオンに変換（Y軸回転）
    const rotation = {
      x: 0,
      y: Math.sin(angle / 2),
      z: 0,
      w: Math.cos(angle / 2),
    }

    await this.avatarController.rotate(rotation)
  }

  getUsers(): UserAvatar[] {
    return this.userAvatarManager.getUsers()
  }

  getUser(id: string): UserAvatar | undefined {
    return this.userAvatarManager.getUser(id)
  }

  getUsersNearby(radius: number): UserAvatar[] {
    const avatarState = this.avatarController.getState()
    if (!avatarState) return []
    return this.userAvatarManager.getUsersInRange(avatarState.position, radius)
  }

  on<E extends keyof AgentClientEvents>(event: E, handler: AgentClientEvents[E]): this {
    super.on(event, handler as (...args: unknown[]) => void)
    return this
  }

  off<E extends keyof AgentClientEvents>(event: E, handler: AgentClientEvents[E]): this {
    super.off(event, handler as (...args: unknown[]) => void)
    return this
  }

  // Override EventEmitter methods to return this for chaining
  override addListener(eventName: string | symbol, listener: (...args: unknown[]) => void): this {
    super.addListener(eventName, listener)
    return this
  }

  override removeListener(
    eventName: string | symbol,
    listener: (...args: unknown[]) => void,
  ): this {
    super.removeListener(eventName, listener)
    return this
  }

  setRateLimit(key: 'messages' | 'moves' | 'looks', perSecond: number): void {
    this.rateLimiter.setRate(key, perSecond)
  }

  getRateLimit(key: 'messages' | 'moves' | 'looks'): number | undefined {
    return this.rateLimiter.getRate(key)
  }

  /**
   * Play animation on avatar
   */
  async playAnimation(
    animationId: string,
    options?: AnimationPlayOptions,
  ): Promise<AnimationPlaybackResult> {
    try {
      const result = await this.avatarController.playAnimation(animationId, options)

      this.logger.info('Animation played', {
        animationId,
        playbackId: result.playbackId,
      })

      return result
    } catch (error) {
      // Convert to specific error types
      if (error instanceof AvatarNotSpawnedError) {
        throw error
      }
      if (error instanceof AnimationNotFoundError) {
        throw error
      }
      throw new AnimationPlaybackError(
        `Failed to play animation: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      )
    }
  }

  /**
   * Stop current animation
   */
  async stopAnimation(): Promise<void> {
    await this.avatarController.stopAnimation()
    this.logger.debug('Animation stopped')
  }

  /**
   * Get available animations
   */
  async getAvailableAnimations(): Promise<VRMAnimation[]> {
    if (!this.animationService) {
      // Return empty array if animation service not available
      this.logger.warn('Animation service not available')
      return []
    }

    const config = this.factory.getService(ConfigurationProvider) as IConfigurationProvider
    const avatarId = config.getConfiguration().profile.avatarId

    if (!avatarId) {
      this.logger.warn('No avatar ID configured')
      return []
    }

    try {
      return await this.animationService.getAvailableAnimations(avatarId)
    } catch (error) {
      this.logger.error('Failed to get available animations', { error })
      return []
    }
  }

  /**
   * Get current animation
   */
  getCurrentAnimation(): string | null {
    return this.avatarController.getCurrentAnimation()
  }

  /**
   * Send voice frame (stub - implementation moved to consuming packages)
   */
  async sendVoiceFrame(_pcmData: Int16Array): Promise<void> {
    throw new Error(
      'Voice functionality not available in SDK core - use consuming package implementation',
    )
  }

  /**
   * Mute/unmute voice (stub - implementation moved to consuming packages)
   */
  async muteVoice(muted: boolean): Promise<void> {
    this.voiceMuted = muted
    this.logger.debug(
      `Voice ${muted ? 'muted' : 'unmuted'} - functionality moved to consuming packages`,
    )
  }

  /**
   * Check if voice is muted
   */
  isVoiceMuted(): boolean {
    return this.voiceMuted
  }

  // Voice connection functionality moved to consuming packages

  private setupEventHandlers(): void {
    // Listen for user join events to resync avatar
    this.userAvatarManager.on('userJoined', async (user) => {
      // Resync avatar for new users so they can see the bot
      const currentState = this.avatarController.getState()
      if (currentState) {
        try {
          await this.avatarController.resyncAvatar()
          this.logger.debug(`Resynced avatar for new user: ${user.nickname}`)
        } catch (error) {
          this.logger.error('Failed to resync avatar:', { error, user: user.nickname })
        }
      }
    })
  }

  /**
   * Get session ID
   */
  getSessionId(): string | null {
    return this.connectionManager.getSessionId()
  }
}

/**
 * Factory function to create agent client
 */
export function createAgentClient(
  config: BotConfiguration,
  clientConfig?: AgentClientConfig,
): AgentClient {
  const factory = new CoreServiceFactory(config)
  return new DefaultAgentClient(factory, clientConfig)
}

/**
 * Factory function to create agent client with existing factory
 */
export function createAgentClientWithFactory(
  factory: CoreServiceFactory,
  clientConfig?: AgentClientConfig,
): AgentClient {
  return new DefaultAgentClient(factory, clientConfig)
}
