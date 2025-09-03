/**
 * MetatellClient implementation - main facade for SDK
 */

import { EventEmitter } from 'node:events'
import {
  AnimationService,
  AvatarController,
  ConfigurationProvider,
  ConnectionManager,
  // Core logging provider utilities (to ensure provider is set)
  DefaultLoggerProvider as CoreDefaultLoggerProvider,
  CoreServiceFactory,
  EventBus,
  type IAnimationService,
  type IAvatarController,
  type IConfigurationProvider,
  type IConnectionManager,
  type IEventBus,
  type IMessageService,
  type IOrganizationService,
  type IPresenceManager,
  type IUserAvatarManager,
  MessageService,
  OrganizationService,
  PresenceManager,
  registerLoggerProvider as registerCoreLoggerProvider,
  SystemEvents,
  UserAvatarManager,
} from '@metatell/bot-core'
import { getLogger } from './sdk/logging/index.js'
import type {
  Animation,
  AvatarAsset,
  BotInfo,
  CreateClientOptions,
  Euler,
  MessageEventData,
  MetatellClientEvents,
  PcmInput,
  PcmInputOptions,
  PlaybackControls,
  User,
  Vec3,
} from './types.js'
import { AuthError, MetatellError, NetworkError, NotFoundError } from './types.js'

/**
 * MetatellClient - メインのfacadeインターフェース
 */
export interface MetatellClient {
  /**
   * Metatellサーバーに接続し、指定されたルームに参加します。
   * @throws {AuthError} 認証トークンが無効な場合。
   * @throws {NetworkError} ネットワーク接続に失敗した場合。
   */
  connect(): Promise<void>

  /**
   * サーバーから切断します。
   */
  disconnect(): Promise<void>

  /** ルーム関連の操作 */
  readonly room: {
    /** 現在ルームに参加しているユーザーの一覧を取得します。 */
    getUsers(): Promise<User[]>

    /** 指定した半径内のユーザーを取得します。 */
    getNearbyUsers(radius?: number): Promise<User[]>
  }

  /** 現在ルームに参加しているユーザーの一覧を取得します（同期版）。 */
  getUsers(): User[]

  /** チャット関連の操作 */
  readonly chat: {
    /** ルーム全体にメッセージを送信します。 */
    send(text: string): Promise<void>

    /**
     * ボットへのメンションを購読します。
     * SDKが"@ボット名"の形式を自動で解析し、メンション以降のテキストを渡します。
     */
    onMention(
      handler: (event: {
        from: User
        text: string
        /** 受信したメッセージに簡易返信するユーティリティ関数 */
        reply: (text: string) => Promise<void>
      }) => void,
    ): void
  }

  /** ボットアバターの操作 */
  readonly avatar: {
    /**
     * アバターを選択・変更します。
     * @param assetId 組織アバターのIDなど
     */
    select(assetId: string): Promise<void>

    /**
     * アニメーションを再生します。
     * @param animation 再生するアニメーションの仕様
     * @throws {NotFoundError} 指定されたアニメーションが存在しない場合。
     */
    play(animation: Animation): Promise<void>

    /**
     * 指定された座標に移動します。
     * @param position 移動先の座標（メートル）
     */
    moveTo(position: Vec3): Promise<void>

    /**
     * 指定された角度に回転します。
     * @param rotation 回転角度（オイラー角・度数法）
     */
    rotateTo(rotation: Euler): Promise<void>

    /**
     * 指定された座標を見るように回転します。
     * @param target 見る対象の座標（メートル）
     */
    lookAt(target: Vec3): Promise<void>

    /** 現在の位置を取得します。 */
    getPosition(): Vec3 | null

    /** 利用可能なアバターアセットの一覧を取得します。 */
    getAvailableAssets(): Promise<AvatarAsset[]>

    /** 現在のアバターで利用可能なアニメーションの一覧を取得します。 */
    getAvailableAnimations(): Promise<Animation[]>
  }

  /** 音声関連の操作 */
  readonly voice: {
    /**
     * 16-bit PCMデータを注入し、ボットに発話させます。
     * SDKは内部で48kHz/monoにリサンプリングし、10msのフレームに分割して送信します。
     * @param input Int16Array, AsyncIterable<Int16Array>, またはNodeJS.ReadableStream
     * @param options 入力PCMのフォーマット
     * @returns 再生を制御するためのオブジェクト
     * @throws {UnsupportedAudioFormatError} サポート外のフォーマットが指定された場合。
     */
    playPcm(input: PcmInput, options: PcmInputOptions): Promise<PlaybackControls>
  }

  /** ボット自身の情報を取得します。 */
  getInfo(): Promise<BotInfo>

  /** 接続状態を取得します。 */
  getStatus(): { connected: boolean; connecting: boolean }

  /** レート制限設定を取得します。 */
  getRateLimit(key: 'messages' | 'moves' | 'looks'): number | undefined

  /**
   * 現在のセッションIDを取得します。
   */
  getSessionId(): string | null

  /**
   * SDKのイベントを購読します。
   * @param event イベント名
   * @param listener イベントハンドラ
   */
  on<E extends keyof MetatellClientEvents>(event: E, listener: MetatellClientEvents[E]): this

  /**
   * SDKのイベント購読を解除します。
   */
  off<E extends keyof MetatellClientEvents>(event: E, listener: MetatellClientEvents[E]): this
}

/**
 * MetatellClient実装
 */
class MetatellClientImpl extends EventEmitter implements MetatellClient {
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
  private logger = getLogger('MetatellClient')

  constructor(private options: CreateClientOptions) {
    super()

    // Ensure Core logging provider is registered to avoid runtime error
    try {
      // CoreServiceFactoryがプロバイダーを必要とする場合のみ登録
      registerCoreLoggerProvider(new CoreDefaultLoggerProvider(), { allowOverwrite: true })
    } catch {
      // すでに登録されている場合はエラーを無視
    }

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

    // イベントのプロキシ設定
    this.setupEventProxies()
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
      const presenceUser = data as import('@metatell/bot-core').PresenceUser
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
      const presenceUser = data as import('@metatell/bot-core').PresenceUser
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
      const users = this.presenceManager.getUsers()
      const currentSessionId = this.connectionManager.getSessionId()

      // PresenceUserをUser型に変換
      return users.map((u) => {
        // 自分自身の場合はAvatarControllerから位置情報を取得
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

        // UserAvatarManagerからアバター情報を取得
        const avatar = this.userAvatarManager.getUser(u.id)

        return {
          id: u.id,
          name: u.profile?.displayName || u.id.split('#')[0] || u.id,
          isBot: false,
          position: avatar?.position,
          rotation: avatar?.rotation,
        }
      })
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
      await this.messageService.sendMessage(text)
    },

    onMention: (
      handler: (event: {
        from: User
        text: string
        reply: (text: string) => Promise<void>
      }) => void,
    ): void => {
      // メッセージ受信イベントをサブスクライブ
      this.eventBus.on(SystemEvents.MESSAGE_RECEIVED, async (data: unknown) => {
        const messageData = data as MessageEventData
        const botSessionId = this.getSessionId()

        if (messageData.type === 'chat' && messageData.body) {
          const parsed = this.parseMessageMention(messageData.body)

          // ボットがメンションされた場合のみハンドラーを呼び出す
          if (parsed.mention && parsed.mention.sessionId === botSessionId) {
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
              reply: async (replyText: string) => {
                await this.messageService.sendMessage(replyText)
              },
            })
          }
        }
      })
    },
  }

  readonly avatar = {
    select: async (assetId: string): Promise<void> => {
      // アバターを変更するには再度spawnを呼び出す
      const state = this.avatarController.getState()
      await this.avatarController.spawn(assetId, state?.position)
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
      await this.avatarController.move(position)
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
      const animations = await this.animationService.getAvailableAnimations(state.avatarId)
      return animations.map((anim) => ({
        id: anim.id,
        name: anim.name || 'Unknown Animation',
        duration: anim.duration,
      }))
    },
  }

  readonly voice = {
    playPcm: async (_input: PcmInput, _options: PcmInputOptions): Promise<PlaybackControls> => {
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
    return {
      name: config.profile?.displayName || 'MetatellBot',
      version: '1.0.0',
      roomId: config.hubId,
    }
  }

  getStatus(): { connected: boolean; connecting: boolean } {
    // 簡易的な接続状態を返す
    return {
      connected: true,
      connecting: false,
    }
  }

  getUsers(): User[] {
    const users = this.presenceManager.getUsers()
    const currentSessionId = this.connectionManager.getSessionId()

    // PresenceUserをUser型に変換（room.getUsersと同じ実装）
    return users.map((u) => {
      // 自分自身の場合はAvatarControllerから位置情報を取得
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

      // UserAvatarManagerからアバター情報を取得
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

  getRateLimit(_key: 'messages' | 'moves' | 'looks'): number | undefined {
    // レート制限設定なし
    return undefined
  }

  getSessionId(): string | null {
    // 接続マネージャーからセッションIDを取得
    return this.connectionManager.getSessionId()
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
 * MetatellClientのインスタンスを生成し、初期化します。
 * @param options クライアント設定
 * @returns MetatellClientのインスタンス
 * @throws {MetatellError} 設定が不正な場合にスローされます。
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
