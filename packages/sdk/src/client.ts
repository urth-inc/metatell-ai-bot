/**
 * MetatellClient implementation - main facade for SDK
 */

import { EventEmitter } from 'node:events'
import {
  AnimationService,
  AvatarController,
  ConfigurationProvider,
  ConnectionManager,
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
  MessageService,
  OrganizationService,
  PresenceManager,
  SystemEvents,
} from '@metatell/core'
import type {
  Animation,
  AvatarAsset,
  BotInfo,
  CreateClientOptions,
  Euler,
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

  constructor(private options: CreateClientOptions) {
    super()

    // CoreServiceFactoryを初期化
    this.serviceFactory = new CoreServiceFactory({
      serverUrl: options.serverUrl,
      hubUrl: options.serverUrl.replace(/^ws/, 'http'), // WebSocket URLからHTTP URLに変換
      hubId: options.roomId,
      profile: {
        displayName: options.username || 'MetatellBot',
        avatarId: '', // 後で設定
      },
      debug: options.debug || false,
    })

    // 必要なサービスを取得
    const container = this.serviceFactory.getContainer()
    this.connectionManager = container.get(ConnectionManager) as IConnectionManager
    this.messageService = container.get(MessageService) as IMessageService
    this.avatarController = container.get(AvatarController) as IAvatarController
    this.presenceManager = container.get(PresenceManager) as IPresenceManager
    // userAvatarManagerは現在使用していないため、取得しない
    this.organizationService = container.get(OrganizationService) as IOrganizationService
    this.animationService = container.get(AnimationService) as IAnimationService
    this.eventBus = container.get(EventBus) as IEventBus
    this.configProvider = container.get(ConfigurationProvider) as IConfigurationProvider

    // イベントのプロキシ設定
    this.setupEventProxies()
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
      this.emit('message', data as import('./types.js').MessageEventData)
    })
  }

  async connect(): Promise<void> {
    try {
      await this.connectionManager.connect({
        serverUrl: this.options.serverUrl,
        hubId: this.options.roomId,
      })
      // アバター設定を取得してスポーン
      const config = this.configProvider.getConfiguration()
      if (config.profile.avatarId) {
        await this.avatarController.spawn(
          config.profile.avatarId,
          undefined,
          config.organizationAvatarUrl,
        )
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
      // PresenceUserをUser型に変換
      return users.map((u) => ({
        id: u.id,
        name: u.profile.displayName || u.id.split('#')[0] || u.id,
        isBot: false,
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
        const messageData = data as import('./types.js').MessageEventData
        const botName = this.configProvider.getConfiguration().profile?.displayName || 'bot'
        const mentionPattern = new RegExp(`@${botName}\\s+(.+)`, 'i')
        const match = messageData.body?.match(mentionPattern)

        if (match) {
          const user: User = {
            id: messageData.senderId || '',
            name: messageData.senderId?.split('#')[0] || 'Unknown',
            isBot: false,
          }

          handler({
            from: user,
            text: match[1].trim(),
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
      // Euler角をラジアンに変換（SDKは度数法、Coreはラジアン）
      const radians = {
        x: (rotation.x * Math.PI) / 180,
        y: (rotation.y * Math.PI) / 180,
        z: (rotation.z * Math.PI) / 180,
      }
      // AvatarControllerのrotateメソッドを使用
      await this.avatarController.rotate(radians)
    },

    getAvailableAssets: async (): Promise<AvatarAsset[]> => {
      // organizationInfoを取得するには、hubUrlとhubIdが必要
      const config = this.configProvider.getConfiguration()
      const orgInfo = await this.organizationService.getOrganizationInfo(
        config.hubUrl,
        config.hubId,
      )
      const avatars = await this.organizationService.fetchOrganizationAvatars(
        config.hubUrl,
        orgInfo.organizationId,
      )
      return avatars.map((avatar) => ({
        id: avatar.id,
        name: avatar.name,
        thumbnailUrl: avatar.thumbnail_url || '',
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
    // 空配列を返す（実装は後で検討）
    return []
  }

  getRateLimit(_key: 'messages' | 'moves' | 'looks'): number | undefined {
    // レート制限設定なし
    return undefined
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
  if (!options.serverUrl || !options.roomId || !options.token) {
    throw new MetatellError('INVALID_CONFIG', 'serverUrl, roomId, and token are required')
  }

  return new MetatellClientImpl(options)
}
