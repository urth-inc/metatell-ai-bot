/**
 * MetatellClient implementation - main facade for SDK
 */

import { EventEmitter } from 'node:events'
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
import { AuthError, MetatellError, NetworkError } from './types.js'

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
  constructor(private options: CreateClientOptions) {
    super()

    // 仮実装: 実際のCoreServiceFactoryの実装が完成するまで
    this.serviceFactory = null
  }

  async connect(): Promise<void> {
    try {
      // 仮実装: 実際の接続ロジック
      // await this.serviceFactory.initialize();
      this.connected = true
      this.emit('connected')
    } catch (error) {
      // エラーを適切なタイプに変換
      if (error instanceof Error && error.message.includes('auth')) {
        throw new AuthError('AUTH_FAILED', 'Authentication failed', error)
      }
      throw new NetworkError('CONNECTION_FAILED', 'Failed to connect', error)
    }
  }

  async disconnect(): Promise<void> {
    // 仮実装: 実際の切断ロジック
    // await this.serviceFactory.cleanup();
    this.connected = false
    this.emit('disconnected')
  }

  readonly room = {
    getUsers: async (): Promise<User[]> => {
      // 仮実装: 実際のプレゼンスマネージャーからユーザー一覧を取得
      return []
    },
  }

  readonly chat = {
    send: async (text: string): Promise<void> => {
      // 仮実装: メッセージ送信
      console.log('Sending message:', text)
    },

    onMention: (
      _handler: (event: {
        from: User
        text: string
        reply: (text: string) => Promise<void>
      }) => void,
    ): void => {
      // 仮実装: メンション監視
      console.log('Setting up mention handler')
    },
  }

  readonly avatar = {
    select: async (assetId: string): Promise<void> => {
      // 仮実装: アバター選択
      console.log('Selecting avatar:', assetId)
    },

    play: async (animation: Animation): Promise<void> => {
      // 仮実装: アニメーション再生
      console.log('Playing animation:', animation.name)
    },

    moveTo: async (position: Vec3): Promise<void> => {
      // 仮実装: 移動
      console.log('Moving to:', position)
    },

    rotateTo: async (rotation: Euler): Promise<void> => {
      // 仮実装: 回転
      console.log('Rotating to:', rotation)
    },

    getAvailableAssets: async (): Promise<AvatarAsset[]> => {
      // 仮実装: 利用可能アセット取得
      return []
    },

    getAvailableAnimations: async (): Promise<Animation[]> => {
      // 仮実装: 利用可能アニメーション取得
      return []
    },
  }

  readonly voice = {
    playPcm: async (_input: PcmInput, options: PcmInputOptions): Promise<PlaybackControls> => {
      // 仮実装: PCM音声再生
      console.log('Playing PCM audio with options:', options)

      return {
        stop: async () => {
          console.log('Stopping audio playback')
        },
        finished: Promise.resolve(),
      }
    },
  }

  async getInfo(): Promise<BotInfo> {
    // 仮実装: ボット情報取得
    return {
      name: 'MetatellBot',
      version: '1.0.0',
      roomId: this.options.roomId,
    }
  }

  // EventEmitterのメソッドをオーバーライド
  on<E extends keyof MetatellClientEvents>(event: E, listener: MetatellClientEvents[E]): this {
    // @ts-expect-error EventEmitter has looser types
    super.on(event, listener)
    return this
  }

  off<E extends keyof MetatellClientEvents>(event: E, listener: MetatellClientEvents[E]): this {
    // @ts-expect-error EventEmitter has looser types
    super.off(event, listener)
    return this
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
