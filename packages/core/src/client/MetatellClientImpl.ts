import { EventEmitter } from 'node:events'
import { CoreServiceFactory } from '../CoreServiceFactory.js'
import { AnimationService, type IAnimationService } from '../interfaces/IAnimationService.js'
import { AppSettings } from '../interfaces/IAppSettings.js'
import { AvatarController, type IAvatarController } from '../interfaces/IAvatarController.js'
import {
  ConfigurationProvider,
  type IConfigurationProvider,
} from '../interfaces/IConfigurationProvider.js'
import { ConnectionManager, type IConnectionManager } from '../interfaces/IConnectionManager.js'
import { EventBus, type IEventBus, SystemEvents } from '../interfaces/IEventBus.js'
import { type IMessageService, MessageService } from '../interfaces/IMessageService.js'
import {
  type IOrganizationService,
  OrganizationService,
} from '../interfaces/IOrganizationService.js'
import { type IPresenceManager, PresenceManager } from '../interfaces/IPresenceManager.js'
import { type IUserAvatarManager, UserAvatarManager } from '../interfaces/IUserAvatarManager.js'
import { getLogger } from '../logging/index.js'
import type { Logger } from '../logging/spi.js'
import type {
  Animation,
  AvatarAsset,
  BotInfo,
  Euler,
  MetatellClient,
  MetatellClientEvents,
  PcmInputOptions,
  PlaybackControls,
  User,
  Vec3,
} from '../types/client.js'

// Rate limiting classes (these might need to be moved to core too)
class RateLimitedQueue {
  private rates = new Map<string, number>()

  async execute(_key: string, fn: () => Promise<void>): Promise<void> {
    // シンプルなレート制限実装
    await fn()
  }

  getRate(key: string): number | undefined {
    return this.rates.get(key)
  }

  setRate(key: string, rate: number): void {
    this.rates.set(key, rate)
  }
}

// Error types
export class MetatellError extends Error {
  constructor(
    public code: string,
    message: string,
    public cause?: unknown,
  ) {
    super(message)
    this.name = 'MetatellError'
  }
}

export class AuthError extends MetatellError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, cause)
    this.name = 'AuthError'
  }
}

export class NetworkError extends MetatellError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, cause)
    this.name = 'NetworkError'
  }
}

export class NotFoundError extends MetatellError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, cause)
    this.name = 'NotFoundError'
  }
}

// Message event data type
interface MessageEventData {
  type: string
  body?: string
  senderId?: string
}

// Create client options
export interface CreateClientOptions {
  serverUrl: string
  roomId: string
  token?: string
  username?: string
  avatarId?: string
  debug?: boolean
}

/**
 * MetatellClient implementation
 */
export class MetatellClientImpl extends EventEmitter implements MetatellClient {
  private serviceFactory: CoreServiceFactory
  private connectionManager: IConnectionManager
  private messageService: IMessageService
  private avatarController: IAvatarController
  private presenceManager: IPresenceManager
  private organizationService: IOrganizationService
  private animationService: IAnimationService
  private eventBus: IEventBus
  private configProvider: IConfigurationProvider
  private userAvatarManager: IUserAvatarManager
  private rateLimiter = new RateLimitedQueue()
  private logger: Logger
  private orgAvatarUrlCache = new Map<string, string>()
  private voiceMuted = false

  constructor(private options: CreateClientOptions) {
    super()

    // Initialize logger
    this.logger = getLogger('MetatellClient')

    // デバッグモードの場合、ロギングを有効化
    if (options.debug) {
      process.env.DEBUG = 'metatell:*'
    }

    // CoreServiceFactoryを初期化
    this.serviceFactory = new CoreServiceFactory({
      serverUrl: options.serverUrl,
      hubUrl: options.serverUrl.replace(/^ws/, 'http'), // WebSocket URLからHTTP URLに変換
      hubId: options.roomId,
      profile: {
        displayName: options.username || 'MetatellBot',
        avatarId: options.avatarId || '', // 後で組織アバターから取得
      },
      botAccessKey: options.token,
      debug: options.debug || false,
    })

    // 必要なサービスを取得
    const container = this.serviceFactory.getContainer()
    this.connectionManager = container.get(ConnectionManager) as IConnectionManager
    this.messageService = container.get(MessageService) as IMessageService
    this.avatarController = container.get(AvatarController) as IAvatarController
    this.presenceManager = container.get(PresenceManager) as IPresenceManager
    this.userAvatarManager = container.get(UserAvatarManager) as IUserAvatarManager
    this.organizationService = container.get(OrganizationService) as IOrganizationService
    this.animationService = container.get(AnimationService) as IAnimationService
    this.eventBus = container.get(EventBus) as IEventBus
    this.configProvider = container.get(ConfigurationProvider) as IConfigurationProvider

    // デバッグモードの場合、AppSettingsのログレベルを変更
    if (options.debug) {
      const appSettings = container.get(AppSettings)
      ;(appSettings as unknown as { setLogLevel: (level: string) => void }).setLogLevel('debug')
      ;(appSettings as unknown as { setDebugMode: (enabled: boolean) => void }).setDebugMode(true)
    }

    // イベントのプロキシ設定
    this.setupEventProxies()

    // Voice mute state synchronization
    this.eventBus.on('voice:mute-changed', ({ muted }: { muted: boolean }) => {
      this.applyVoiceMute(muted)
    })
  }

  /**
   * Parse mention from message body
   * Format: [@displayName](session-id) message
   * Example: [@MetatellCLI](b754ca96-d395-4b80-adb1-77cb0240a43d) hello
   */
  private parseMessageMention(body: string): {
    text: string
    mention?: {
      sessionId: string
      name: string
    }
  } {
    const mentionPattern = /\[@([^\]]+)\]\(([^)]+)\)\s*(.*)$/
    const match = body.match(mentionPattern)

    if (match) {
      return {
        text: match[3].trim(),
        mention: {
          name: match[1],
          sessionId: match[2],
        },
      }
    }

    return { text: body }
  }

  private setupEventProxies(): void {
    // Coreのイベントをクライアントイベントにマッピング
    this.eventBus.on(SystemEvents.CONNECTION_ESTABLISHED, () => {
      this.emit('connected')
    })

    this.eventBus.on(SystemEvents.CONNECTION_LOST, () => {
      this.emit('disconnected')
    })

    this.eventBus.on(SystemEvents.MESSAGE_RECEIVED, (data: unknown) => {
      const messageData = data as MessageEventData
      this.emit('message', messageData)

      // チャットメッセージの場合、詳細な情報を解析して別イベントを発火
      if (messageData.type === 'chat' && messageData.body) {
        const parsed = this.parseMessageMention(messageData.body)

        // PresenceManagerから送信者の情報を取得
        const users = this.presenceManager.getUsers()
        const sender = users.find((u) => u.id === messageData.senderId)

        // デバッグ情報
        if (this.options.debug) {
          this.logger.debug('Message sender lookup:', {
            senderId: messageData.senderId,
            foundSender: !!sender,
            senderData: sender,
            allUsers: users.map((u) => ({ id: u.id, name: u.profile?.displayName })),
          })
        }

        const senderName = sender?.profile?.displayName || sender?.id.split('#')[0] || 'Unknown'

        this.emit('chat-message', {
          from: {
            id: messageData.senderId || '',
            name: senderName,
            isBot: false,
          },
          text: parsed.text,
          mention: parsed.mention,
        })
      }
    })

    this.eventBus.on(SystemEvents.USER_JOINED, (data: unknown) => {
      // PresenceUserデータをUser型に変換
      const presenceUser = data as import('../interfaces/IPresenceManager.js').PresenceUser
      // UserAvatarManagerからアバター情報を取得
      const avatar = this.userAvatarManager.getUser(presenceUser.id)

      const user: User = {
        id: presenceUser.id,
        name: presenceUser.profile?.displayName || presenceUser.id.split('#')[0] || presenceUser.id,
        isBot: false,
        position: avatar?.position,
        rotation: avatar?.rotation,
      }
      this.emit('user-join', user)
      // 新しいユーザーが入室したときにアバターを再同期
      this.resyncAvatarForNewUser()
    })

    this.eventBus.on(SystemEvents.USER_LEFT, (data: unknown) => {
      // PresenceUserデータをUser型に変換
      const presenceUser = data as import('../interfaces/IPresenceManager.js').PresenceUser
      // UserAvatarManagerからアバター情報を取得
      const avatar = this.userAvatarManager.getUser(presenceUser.id)

      const user: User = {
        id: presenceUser.id,
        name: presenceUser.profile?.displayName || presenceUser.id.split('#')[0] || presenceUser.id,
        isBot: false,
        position: avatar?.position,
        rotation: avatar?.rotation,
      }
      this.emit('user-leave', user)
    })
  }

  private async resyncAvatarForNewUser(): Promise<void> {
    try {
      // アバターがスポーンされている場合のみ再同期
      if (this.avatarController.getState()) {
        await this.avatarController.resyncAvatar()
        this.logger.debug('Avatar resynced for new user')
      }
    } catch (error) {
      this.logger.warn('Failed to resync avatar for new user', error)
    }
  }

  async connect(): Promise<void> {
    try {
      await this.connectionManager.connect({
        serverUrl: this.options.serverUrl,
        hubId: this.options.roomId,
      })

      // 組織情報を取得
      const orgInfo = await this.organizationService.getOrganizationInfo(
        this.options.serverUrl.replace(/^ws/, 'http'),
        this.options.roomId,
      )

      // アバターIDが指定されていない場合、組織アバターから選択
      let avatarId = this.options.avatarId
      let avatarUrl: string | undefined

      if (!avatarId && orgInfo.organizationId) {
        try {
          // 組織アバター一覧を取得
          const avatars = await this.organizationService.fetchOrganizationAvatars(
            this.options.serverUrl.replace(/^ws/, 'http'),
            orgInfo.organizationId,
          )

          if (avatars.length > 0) {
            // 最初のアバターを使用
            const defaultAvatar = avatars[0]
            avatarId = defaultAvatar.id
            avatarUrl = defaultAvatar.gltf.avatar
          }
        } catch (error) {
          // 組織アバター取得に失敗した場合はスキップ
          this.logger.debug('Failed to fetch organization avatars', error)
        }
      }

      // アバターIDが取得できない場合はエラー
      if (!avatarId) {
        throw new MetatellError(
          'NO_AVATAR_AVAILABLE',
          'No avatar available. Organization avatars not found and no avatar ID specified.',
        )
      }

      // アバターをスポーン
      if (avatarId) {
        // 設定を更新
        const config = this.configProvider.getConfiguration()
        config.profile.avatarId = avatarId
        if (avatarUrl) {
          config.organizationAvatarUrl = avatarUrl
        }

        await this.avatarController.spawn(avatarId, undefined, avatarUrl)
      }
    } catch (error) {
      // エラーを適切なタイプに変換
      if (error instanceof Error && error.message.includes('auth')) {
        throw new AuthError('AUTH_FAILED', 'Authentication failed', error)
      }
      throw new NetworkError('CONNECTION_FAILED', 'Failed to connect', error)
    }
  }

  async disconnect(): Promise<void> {
    await this.connectionManager.disconnect()
  }

  readonly room = {
    getUsers: async (): Promise<User[]> => {
      return this.buildUserList()
    },

    getNearbyUsers: async (radius: number = 10): Promise<User[]> => {
      // 現在のアバター位置を取得
      const currentPosition = this.avatar.getPosition()
      if (!currentPosition) {
        // アバターがスポーンされていない場合は全ユーザーを返す
        return this.room.getUsers()
      }

      // UserAvatarManagerから距離内のユーザーを取得
      const nearbyAvatars = this.userAvatarManager.getUsersInRange(currentPosition, radius)

      // UserAvatarをUser型に変換
      return nearbyAvatars.map((avatar) => ({
        id: avatar.id,
        name: avatar.nickname || avatar.id.split('#')[0] || avatar.id,
        isBot: false,
        position: avatar.position,
        rotation: avatar.rotation,
      }))
    },
  }

  readonly chat = {
    send: async (text: string): Promise<void> => {
      await this.rateLimiter.execute('messages', async () => {
        await this.messageService.sendMessage(text)
      })
    },

    onMessage: (
      handler: (event: {
        from: User
        text: string
        mention?: {
          sessionId: string
          name: string
        }
        reply: (text: string) => Promise<void>
      }) => void,
    ): void => {
      // メッセージ受信イベントをサブスクライブ
      this.eventBus.on(SystemEvents.MESSAGE_RECEIVED, async (data: unknown) => {
        const messageData = data as MessageEventData

        if (messageData.type === 'chat' && messageData.body) {
          const parsed = this.parseMessageMention(messageData.body)

          // PresenceManagerから送信者の情報を取得
          const users = this.presenceManager.getUsers()
          const sender = users.find((u) => u.id === messageData.senderId)
          const senderName = sender?.profile?.displayName || sender?.id.split('#')[0] || 'Unknown'

          const user: User = {
            id: messageData.senderId || '',
            name: senderName,
            isBot: false,
          }

          handler({
            from: user,
            text: parsed.text,
            mention: parsed.mention,
            reply: async (replyText: string) => {
              await this.messageService.sendMessage(replyText)
            },
          })
        }
      })
    },
  }

  readonly avatar = {
    select: async (assetId: string): Promise<void> => {
      // アバターを変更するには再度spawnを呼び出す
      const state = this.avatarController.getState()

      try {
        // まず通常のアバターとしてspawnを試みる
        await this.avatarController.spawn(assetId, state?.position)
      } catch (error) {
        // avatarSrc URLが必要というエラーの場合のみ、組織アバターとして処理
        if (
          error instanceof Error &&
          error.message.includes('Organization avatar requires avatarSrc URL')
        ) {
          // キャッシュをチェック
          let avatarSrc = this.orgAvatarUrlCache.get(assetId)

          if (!avatarSrc) {
            // キャッシュにない場合はOrganizationServiceから取得
            const hubUrl = this.configProvider.getConfiguration().hubUrl
            const hubId = this.configProvider.getConfiguration().hubId
            const orgInfo = await this.organizationService.getOrganizationInfo(hubUrl, hubId)

            if (!orgInfo.organizationId) {
              throw new Error(
                `Cannot fetch organization avatars: organization ID not set for hub ${hubId}`,
              )
            }

            const avatars = await this.organizationService.fetchOrganizationAvatars(
              hubUrl,
              orgInfo.organizationId,
            )
            const targetAvatar = avatars.find((a) => a.id === assetId)

            if (!targetAvatar) {
              throw new Error(`Organization avatar not found: ${assetId}`)
            }

            avatarSrc = targetAvatar.gltf.avatar
            // URLをキャッシュに保存
            this.orgAvatarUrlCache.set(assetId, avatarSrc)
            this.logger.debug('Cached organization avatar URL', { assetId, avatarSrc })
          } else {
            this.logger.debug('Using cached organization avatar URL', { assetId, avatarSrc })
          }

          // avatarSrc付きで再度spawnを試みる
          await this.avatarController.spawn(assetId, state?.position, avatarSrc)
        } else {
          // その他のエラーはそのまま再スロー
          throw error
        }
      }
    },

    play: async (animation: Animation): Promise<void> => {
      try {
        // アニメーションオプションを変換
        const playOptions = {
          loop: animation.loop || false,
          duration: animation.duration,
          transitionDuration: animation.transitionDuration,
        }

        if ('id' in animation && animation.id) {
          await this.avatarController.playAnimation(animation.id, playOptions)
        } else if ('url' in animation && animation.url) {
          // URLベースのアニメーションは現在のインターフェースではサポートされていない
          // カスタムアニメーションとして扱う必要がある
          throw new NotFoundError(
            'ANIMATION_NOT_FOUND',
            'URL-based animations are not yet supported',
          )
        } else {
          throw new NotFoundError('ANIMATION_NOT_FOUND', 'Animation must have either id or url')
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          throw new NotFoundError('ANIMATION_NOT_FOUND', error.message, error)
        }
        throw error
      }
    },

    moveTo: async (position: Vec3): Promise<void> => {
      await this.rateLimiter.execute('moves', async () => {
        await this.avatarController.move(position)
      })
    },

    rotateTo: async (rotation: Euler): Promise<void> => {
      // Euler角（度数法）をラジアンに変換
      const xRad = (rotation.x * Math.PI) / 180
      const yRad = (rotation.y * Math.PI) / 180
      const zRad = (rotation.z * Math.PI) / 180

      // オイラー角からクォータニオンに変換（ZYX順）
      const cx = Math.cos(xRad / 2)
      const sx = Math.sin(xRad / 2)
      const cy = Math.cos(yRad / 2)
      const sy = Math.sin(yRad / 2)
      const cz = Math.cos(zRad / 2)
      const sz = Math.sin(zRad / 2)

      const quaternion = {
        x: sx * cy * cz - cx * sy * sz,
        y: cx * sy * cz + sx * cy * sz,
        z: cx * cy * sz - sx * sy * cz,
        w: cx * cy * cz + sx * sy * sz,
      }

      // AvatarControllerのrotateメソッドを使用
      await this.avatarController.rotate(quaternion)
    },

    lookAt: async (target: Vec3): Promise<void> => {
      await this.rateLimiter.execute('looks', async () => {
        // 現在位置を取得
        const state = this.avatarController.getState()
        if (!state) {
          throw new MetatellError('AVATAR_NOT_SPAWNED', 'Avatar is not spawned')
        }

        // ターゲットへの方向ベクトルを計算
        const dx = target.x - state.position.x
        const dz = target.z - state.position.z

        // Y軸周りの回転角度を計算（ラジアン）
        const yRotation = Math.atan2(dx, dz)

        // ラジアンからクォータニオンに変換（Y軸回転のみ）
        const halfAngle = yRotation / 2
        const quaternion = {
          x: 0,
          y: Math.sin(halfAngle),
          z: 0,
          w: Math.cos(halfAngle),
        }

        // 回転を適用
        await this.avatarController.rotate(quaternion)
      })
    },

    getPosition: (): Vec3 | null => {
      const state = this.avatarController.getState()
      return state ? { ...state.position } : null
    },

    getAvailableAssets: async (): Promise<AvatarAsset[]> => {
      // organizationInfoを取得するには、hubUrlとhubIdが必要
      const config = this.configProvider.getConfiguration()
      const orgInfo = await this.organizationService.getOrganizationInfo(
        config.hubUrl,
        config.hubId,
      )
      if (!orgInfo.organizationId) {
        // 組織IDがない場合は空配列を返す
        return []
      }

      const avatars = await this.organizationService.fetchOrganizationAvatars(
        config.hubUrl,
        orgInfo.organizationId,
      )
      return avatars.map((avatar) => ({
        id: avatar.id,
        name: avatar.name,
        thumbnailUrl: avatar.images?.preview?.url || avatar.thumbnail_url || '',
        modelUrl: avatar.gltf.avatar,
      }))
    },

    getAvailableAnimations: async (): Promise<Animation[]> => {
      // 現在のアバターIDを取得
      const state = this.avatarController.getState()
      if (!state) {
        return []
      }

      this.logger.debug('Getting available animations for avatar', { avatarId: state.avatarId })

      const animations = await this.animationService.getAvailableAnimations(state.avatarId)

      this.logger.debug('Retrieved animations', {
        avatarId: state.avatarId,
        animationCount: animations.length,
        animations: animations.map((a) => ({ id: a.id, name: a.name })),
      })

      return animations.map((anim) => ({
        id: anim.id,
        name: anim.name || 'Unknown Animation',
        duration: anim.duration,
      }))
    },
  }

  readonly voice = {
    playPcm: async (_input: unknown, _options: PcmInputOptions): Promise<PlaybackControls> => {
      // 音声機能は別パッケージ（@metatell/realtime）で実装
      // ここではプレースホルダーを返す
      const finishedPromise = new Promise<void>((resolve) => {
        setTimeout(resolve, 1000)
      })

      return {
        stop: async () => {
          // 音声停止の実装は別パッケージで行う
        },
        finished: finishedPromise,
      }
    },
  }

  async getInfo(): Promise<BotInfo> {
    const config = this.configProvider.getConfiguration()
    const sessionId = this.getSessionId()
    return {
      name: config.profile?.displayName || 'MetatellBot',
      version: '1.0.0',
      roomId: config.hubId,
      sessionId: sessionId || undefined,
    }
  }

  private buildUserList(): User[] {
    const users = this.presenceManager.getUsers()
    const currentSessionId = this.connectionManager.getSessionId()

    return users.map((u) => {
      if (u.id === currentSessionId) {
        const avatarState = this.avatarController.getState()
        return {
          id: u.id,
          name: u.profile?.displayName || u.id.split('#')[0] || u.id,
          isBot: false,
          position: avatarState?.position,
          rotation: avatarState?.rotation
            ? {
                x: (avatarState.rotation.x * 180) / Math.PI,
                y: (avatarState.rotation.y * 180) / Math.PI,
                z: (avatarState.rotation.z * 180) / Math.PI,
                w: 1, // 簡略化
              }
            : undefined,
        }
      }

      const avatar = this.userAvatarManager.getUser(u.id)

      return {
        id: u.id,
        name: u.profile?.displayName || u.id.split('#')[0] || u.id,
        isBot: false,
        position: avatar?.position,
        rotation: avatar?.rotation,
      }
    })
  }

  getStatus(): { connected: boolean; connecting: boolean } {
    const sessionId = this.connectionManager.getSessionId()
    return {
      connected: !!sessionId,
      connecting: !sessionId,
    }
  }

  getUsers(): User[] {
    return this.buildUserList()
  }

  getRateLimit(key: 'messages' | 'moves' | 'looks'): number | undefined {
    return this.rateLimiter.getRate(key)
  }

  setRateLimit(key: 'messages' | 'moves' | 'looks', perSecond: number): void {
    this.rateLimiter.setRate(key, perSecond)
  }

  getSessionId(): string | null {
    // 接続マネージャーからセッションIDを取得
    return this.connectionManager.getSessionId()
  }

  private applyVoiceMute(muted: boolean): void {
    if (this.voiceMuted === muted) {
      // 状態が変化しない場合は何もしない
      return
    }

    this.voiceMuted = muted
    this.logger.info(`Voice ${muted ? 'muted' : 'unmuted'}`)

    // クライアントイベントとして通知
    this.emit('voice:mute-changed', { muted })
  }

  async muteVoice(muted: boolean): Promise<void> {
    this.logger.debug('Voice mute requested', { muted })
    // Only emit to the event bus; state and public event are updated via subscription
    this.eventBus.emit('voice:mute-changed', { muted })
  }

  async sendVoiceFrame(_pcm: Int16Array): Promise<void> {
    if (this.voiceMuted) {
      this.logger.debug('Ignoring voice frame because microphone is muted')
      return
    }

    // 実装は外部パッケージからランタイムでパッチされる
    throw new Error('Voice functionality not available - enable voice first with enableVoice()')
  }

  // EventEmitterのメソッドをオーバーライド
  on<E extends keyof MetatellClientEvents>(event: E, listener: MetatellClientEvents[E]): this {
    // EventEmitterは汎用的な型を期待するため、型変換が必要
    // string型にキャストして、リスナーは関数型として扱う
    return super.on(event as string, listener as (...args: unknown[]) => void)
  }

  off<E extends keyof MetatellClientEvents>(event: E, listener: MetatellClientEvents[E]): this {
    // EventEmitterは汎用的な型を期待するため、型変換が必要
    return super.off(event as string, listener as (...args: unknown[]) => void)
  }
}

/**
 * Create MetatellClient instance
 * @param options Client configuration
 * @returns MetatellClient instance
 * @throws {MetatellError} If configuration is invalid
 */
export function createMetatellClient(options: CreateClientOptions): MetatellClient {
  // 設定バリデーション
  if (!options.serverUrl || !options.roomId) {
    throw new MetatellError('INVALID_CONFIG', 'serverUrl and roomId are required')
  }

  // サブドメインを除いたサーバーURLを生成
  const processedOptions = { ...options }
  try {
    const url = new URL(options.serverUrl.replace(/^ws/, 'http'))
    const hostParts = url.hostname.split('.')

    if (hostParts.length >= 2) {
      // サブドメインがある場合は除去（例: urth.metatell.app -> metatell.app）
      const mainDomain = hostParts.slice(-2).join('.')
      processedOptions.serverUrl = options.serverUrl.replace(url.hostname, mainDomain)
    }
  } catch (_error) {
    // URL解析に失敗した場合はそのまま使用
    // エラーログなどは出さず、元のURLを使用
  }

  return new MetatellClientImpl(processedOptions)
}
