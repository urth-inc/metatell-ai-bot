/**
 * Agent Client - facade for CLI/SDK usage
 */

import { EventEmitter } from 'node:events'
import type { RealtimeEvent, RealtimeTransport } from '@metatell/realtime'
import { CoreServiceFactory } from '../core/CoreServiceFactory.js'
import {
  AnimationNotFoundError,
  AnimationPlaybackError,
  AvatarNotSpawnedError,
} from '../core/errors/animation-errors.js'
import type { IAnimationService } from '../core/interfaces/IAnimationService.js'
import type { IAvatarController } from '../core/interfaces/IAvatarController.js'
import type {
  BotConfiguration,
  BotVoiceConfig,
  IConfigurationProvider,
} from '../core/interfaces/IConfigurationProvider.js'
import type { IConnectionManager } from '../core/interfaces/IConnectionManager.js'
import type { IMessageService } from '../core/interfaces/IMessageService.js'
import type { IUserAvatarManager, UserAvatar } from '../core/interfaces/IUserAvatarManager.js'
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
  private realtimeTransport?: RealtimeTransport
  private rateLimiter = new RateLimitedQueue()
  private logger = getLogger('AgentClient')
  private factory: CoreServiceFactory
  private voiceMuted = false
  private status: ConnectionStatus = {
    connected: false,
    connecting: false,
    retries: 0,
  }

  constructor(factory: CoreServiceFactory, config: AgentClientConfig = {}) {
    super()
    this.factory = factory
    // コアサービスインターフェースのみに依存
    this.avatarController = factory.getService('IAvatarController') as IAvatarController
    this.messageService = factory.getService('IMessageService') as IMessageService
    this.userAvatarManager = factory.getService('IUserAvatarManager') as IUserAvatarManager
    this.connectionManager = factory.getService('IConnectionManager') as IConnectionManager

    // Optional services
    try {
      this.animationService = factory.getService('IAnimationService') as IAnimationService
    } catch {
      // Animation service is optional
      this.logger.debug('Animation service not available')
    }

    try {
      this.realtimeTransport = factory.getService('RealtimeTransport') as RealtimeTransport
    } catch {
      // RealtimeTransport service is optional
      this.logger.debug('RealtimeTransport service not available')
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
        'IConfigurationProvider',
      ) as IConfigurationProvider
      const config = configProvider.getConfiguration()

      if (config.profile.avatarId) {
        await this.avatarController.spawn(
          config.profile.avatarId,
          undefined,
          config.organizationAvatarUrl,
        )
      }

      // 音声接続（有効な場合）
      const voiceConfig = options.voice || config.voice
      if (this.realtimeTransport && voiceConfig?.enabled) {
        await this.connectVoice({ ...config, voice: voiceConfig })
      }

      this.status.connected = true
      this.status.connecting = false
      this.logger.info('Connected successfully', {
        serverUrl,
        hubId,
        sessionId: this.status.sessionId,
        voiceEnabled: voiceConfig?.enabled || false,
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

    // 音声接続を切断
    if (this.realtimeTransport) {
      try {
        await this.realtimeTransport.disconnect()
      } catch (error) {
        this.logger.error('Error disconnecting voice', { error })
      }
    }

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

  /**
   * Send voice frame
   */
  async sendVoiceFrame(pcmData: Int16Array): Promise<void> {
    if (!this.realtimeTransport) {
      throw new Error('Voice not enabled')
    }

    if (this.voiceMuted) {
      // ミュート中は送信しない
      return
    }

    await this.realtimeTransport.pushPcmFrame(pcmData)
  }

  /**
   * Mute/unmute voice
   */
  async muteVoice(muted: boolean): Promise<void> {
    this.voiceMuted = muted

    // RealtimeTransportのsetMicEnabledを呼ぶ
    if (this.realtimeTransport?.setMicEnabled) {
      await this.realtimeTransport.setMicEnabled(!muted)
    }

    this.logger.debug(`Voice ${muted ? 'muted' : 'unmuted'}`)
  }

  /**
   * Check if voice is muted
   */
  isVoiceMuted(): boolean {
    return this.voiceMuted
  }

  private async connectVoice(config: BotConfiguration): Promise<void> {
    if (!this.realtimeTransport || !config.voice) return

    // RealtimeTransportのイベントハンドラを設定
    this.realtimeTransport.on((event: RealtimeEvent) => {
      switch (event.type) {
        case 'state':
          if (event.state === 'connected') {
            this.emit('voiceConnected')
          } else if (event.state === 'disconnected') {
            this.emit('voiceDisconnected')
          }
          break

        case 'data':
          // 音声フレームデータの場合
          if (event.topic === 'audio' && event.payload instanceof Uint8Array) {
            const pcmData = new Int16Array(
              event.payload.buffer,
              event.payload.byteOffset,
              event.payload.byteLength / 2,
            )
            const frameData = {
              participantId: event.from || 'unknown',
              pcmData,
            }
            this.emit('voiceFrameReceived', frameData)
          }
          break

        case 'error':
          this.emit('voiceError', new Error(`Voice error: ${event.message}`))
          break
      }
    })

    // LiveKitトークンプロバイダー
    const tokenProvider = async () => {
      try {
        // v-air_clientの実装を参考にAPIコールでトークンを取得
        const hubUrl = config.hubUrl
        const roomName = config.hubId
        const identity = this.status.sessionId || 'anonymous'

        const response = await fetch(`${hubUrl}/livekit/api/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            roomName,
            identity,
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to get LiveKit token')
        }

        const data = (await response.json()) as { token?: string }
        if (!data.token) {
          throw new Error('LiveKit token not found in response')
        }

        return data.token
      } catch (error) {
        this.logger.error('Failed to get LiveKit token', { error })
        throw error
      }
    }

    // RealtimeTransportに接続
    const voiceUrl = config.voice.livekitUrl || 'wss://livekit.metatell.app'
    const audioConfig = {
      sampleRate: config.voice.audioConfig?.sampleRate || 48000,
      channels: config.voice.audioConfig?.channels || 1,
      frameDurationMs: config.voice.audioConfig?.frameDurationMs || 20,
    } as const

    await this.realtimeTransport.connect({
      url: voiceUrl,
      tokenProvider,
      topics: ['control', 'events', 'transcript', 'audio'],
      audioPublish: audioConfig,
    })

    // 音声パブリッシャーを開始
    await this.realtimeTransport.startAudioPublisher()

    this.logger.info('Voice connected', { url: voiceUrl })
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
