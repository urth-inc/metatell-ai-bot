/**
 * Agent Client - facade for CLI/SDK usage
 */

import type { CoreServiceFactory } from '../core/CoreServiceFactory.js'
import {
  AnimationNotFoundError,
  AnimationPlaybackError,
  AvatarNotSpawnedError,
} from '../core/errors/animation-errors.js'
import type { IAnimationService } from '../core/interfaces/IAnimationService.js'
import type { IAvatarController } from '../core/interfaces/IAvatarController.js'
import type { IConfigurationProvider } from '../core/interfaces/IConfigurationProvider.js'
import type { IConnectionManager } from '../core/interfaces/IConnectionManager.js'
import type { IEventBus } from '../core/interfaces/IEventBus.js'
import type { IMessageService } from '../core/interfaces/IMessageService.js'
import type { IUserAvatarManager, UserAvatar } from '../core/interfaces/IUserAvatarManager.js'
import type { ILiveKitService } from '../core/services/LiveKitService.js'
import { LiveKitEvents } from '../core/services/LiveKitService.js'
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
  'avatar:updated': (state: unknown) => void

  // Error events
  error: (error: Error) => void

  // Voice events (LiveKit)
  'voice:connected': () => void
  'voice:disconnected': (reason?: string) => void
  'voice:microphone:published': () => void
  'voice:microphone:unpublished': () => void
  'voice:track:subscribed': (data: { trackSid: string }) => void
  'voice:track:unsubscribed': (data: { trackSid: string }) => void
  'voice:error': (error: Error) => void
}

export interface ConnectionOptions {
  url: string
  token?: string
  serverUrl?: string // Allow passing serverUrl directly (WebSocket URL)
  hubUrl?: string // Allow passing hubUrl directly (HTTP API URL)
  hubId?: string // Allow passing hubId directly
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
} from '../core/types/animation.js'

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

  // Event handling (type-safe)
  on<E extends keyof AgentClientEvents>(event: E, handler: AgentClientEvents[E]): void
  off<E extends keyof AgentClientEvents>(event: E, handler: AgentClientEvents[E]): void

  // Voice control (LiveKit)
  enableVoice(): Promise<void>
  disableVoice(): Promise<void>
  isVoiceEnabled(): boolean
  publishMicrophone(): Promise<void>
  unpublishMicrophone(): Promise<void>
  setMicrophoneEnabled(enabled: boolean): Promise<void>
  isMicrophonePublished(): boolean
  setSpeakerVolume(volume: number): void
  getSpeakerVolume(): number

  // Utilities
  setRateLimit(key: 'messages' | 'moves' | 'looks', perSecond: number): void
  getRateLimit(key: 'messages' | 'moves' | 'looks'): number | undefined
}

/**
 * Default implementation using existing services
 */
export class DefaultAgentClient implements AgentClient {
  private avatarController: IAvatarController
  private messageService: IMessageService
  private userAvatarManager: IUserAvatarManager
  private connectionManager: IConnectionManager
  private eventBus: IEventBus
  private animationService?: IAnimationService
  private liveKitService?: ILiveKitService
  private rateLimiter = new RateLimitedQueue()
  private logger = getLogger('AgentClient')
  private factory: CoreServiceFactory
  private speakerVolume = 1
  private status: ConnectionStatus = {
    connected: false,
    connecting: false,
    retries: 0,
  }

  constructor(factory: CoreServiceFactory, config: AgentClientConfig = {}) {
    this.factory = factory
    // コアサービスインターフェースのみに依存
    this.avatarController = factory.getService('IAvatarController') as IAvatarController
    this.messageService = factory.getService('IMessageService') as IMessageService
    this.userAvatarManager = factory.getService('IUserAvatarManager') as IUserAvatarManager
    this.connectionManager = factory.getService('IConnectionManager') as IConnectionManager
    this.eventBus = factory.getService('IEventBus') as IEventBus

    // Optional services
    try {
      this.animationService = factory.getService('IAnimationService') as IAnimationService
    } catch {
      // Animation service is optional
      this.logger.debug('Animation service not available')
    }

    try {
      this.liveKitService = factory.getService('ILiveKitService') as ILiveKitService
    } catch {
      // LiveKit service is optional
      this.logger.debug('LiveKit service not available')
    }

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

    try {
      let serverUrl: string
      let hubId: string

      // Use provided values or parse from URL
      if (options.serverUrl && options.hubUrl && options.hubId) {
        serverUrl = options.serverUrl
        hubId = options.hubId
      } else {
        // URLを解析してserverUrlとhubIdを取得
        const url = new URL(options.url)

        // HTTPSからWSSに変換
        const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
        serverUrl = `${protocol}//${url.host}`

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

      // Send room entry events
      const channel = this.connectionManager.getHubChannel()
      if (channel) {
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
      }

      // Get avatar configuration and spawn
      const configProvider = this.factory.getService(
        'IConfigurationProvider',
      ) as IConfigurationProvider
      const config = configProvider.getConfiguration()

      if (config.profile.avatarId) {
        await this.avatarController.spawn(config.profile.avatarId)
      }

      this.status.connected = true
      this.status.connecting = false
      this.logger.info('Connected successfully', {
        serverUrl,
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
    await this.connectionManager.disconnect()
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

  on<E extends keyof AgentClientEvents>(event: E, handler: AgentClientEvents[E]): void {
    // Proxy to internal event bus (cast needed for compatibility with existing EventBus interface)
    this.eventBus.on(event as string, handler as (...args: unknown[]) => void)
  }

  off<E extends keyof AgentClientEvents>(event: E, handler: AgentClientEvents[E]): void {
    // Proxy to internal event bus (cast needed for compatibility with existing EventBus interface)
    this.eventBus.off(event as string, handler as (...args: unknown[]) => void)
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

    const config = this.factory.getService('IConfigurationProvider') as IConfigurationProvider
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

    // Setup LiveKit event forwarding if service is available
    if (this.liveKitService) {
      // Forward LiveKit events to AgentClient events
      this.eventBus.on(LiveKitEvents.CONNECTED, () => {
        this.eventBus.emit('voice:connected')
      })

      this.eventBus.on(LiveKitEvents.DISCONNECTED, (data: { reason?: string }) => {
        this.eventBus.emit('voice:disconnected', data.reason)
      })

      this.eventBus.on(LiveKitEvents.MICROPHONE_PUBLISHED, () => {
        this.eventBus.emit('voice:microphone:published')
      })

      this.eventBus.on(LiveKitEvents.MICROPHONE_UNPUBLISHED, () => {
        this.eventBus.emit('voice:microphone:unpublished')
      })

      this.eventBus.on(LiveKitEvents.AUDIO_TRACK_SUBSCRIBED, (data: { trackSid: string }) => {
        this.eventBus.emit('voice:track:subscribed', data)
      })

      this.eventBus.on(LiveKitEvents.AUDIO_TRACK_UNSUBSCRIBED, (data: { trackSid: string }) => {
        this.eventBus.emit('voice:track:unsubscribed', data)
      })

      this.eventBus.on(LiveKitEvents.CONNECTION_ERROR, (error: Error) => {
        this.eventBus.emit('voice:error', error)
      })
    }
  }

  // Voice control (LiveKit) implementation
  async enableVoice(): Promise<void> {
    if (!this.liveKitService) {
      throw new Error('Voice service not available')
    }

    if (this.liveKitService.isConnected()) {
      this.logger.debug('Voice already enabled')
      return
    }

    const configProvider = this.factory.getService(
      'IConfigurationProvider',
    ) as IConfigurationProvider
    const config = configProvider.getConfiguration()

    // LiveKitサービスを初期化
    this.liveKitService.initialize(config.hubId)

    // 接続
    await this.liveKitService.connect()
    this.logger.info('Voice enabled successfully')
  }

  async disableVoice(): Promise<void> {
    if (!this.liveKitService) {
      throw new Error('Voice service not available')
    }

    await this.liveKitService.disconnect()
    this.logger.info('Voice disabled successfully')
  }

  isVoiceEnabled(): boolean {
    return this.liveKitService?.isConnected() ?? false
  }

  async publishMicrophone(): Promise<void> {
    if (!this.liveKitService) {
      throw new Error('Voice service not available')
    }

    if (!this.liveKitService.isConnected()) {
      throw new Error('Voice not enabled. Call enableVoice() first')
    }

    await this.liveKitService.publishMicrophone()
  }

  async unpublishMicrophone(): Promise<void> {
    if (!this.liveKitService) {
      throw new Error('Voice service not available')
    }

    await this.liveKitService.unpublishMicrophone()
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    if (!this.liveKitService) {
      throw new Error('Voice service not available')
    }

    await this.liveKitService.setMicrophoneEnabled(enabled)
  }

  isMicrophonePublished(): boolean {
    if (!this.liveKitService) {
      return false
    }

    return this.liveKitService.getMicrophonePublication() !== undefined
  }

  setSpeakerVolume(volume: number): void {
    if (!this.liveKitService) {
      throw new Error('Voice service not available')
    }

    // Ensure volume is between 0 and 1
    const clampedVolume = Math.max(0, Math.min(1, volume))
    this.speakerVolume = clampedVolume
    this.liveKitService.setSpeakerVolume(clampedVolume)
  }

  getSpeakerVolume(): number {
    return this.speakerVolume
  }
}

/**
 * Factory function to create agent client
 */
export function createAgentClient(
  factory: CoreServiceFactory,
  config?: AgentClientConfig,
): AgentClient {
  return new DefaultAgentClient(factory, config)
}
