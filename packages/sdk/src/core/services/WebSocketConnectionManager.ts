import { type Channel, Socket } from 'phoenix'
import { getLogger } from '../../sdk/logging/index.js'
import type { IAppSettings } from '../interfaces/IAppSettings.js'
import type { IConfigurationProvider } from '../interfaces/IConfigurationProvider.js'
import type { ConnectionConfig, IConnectionManager } from '../interfaces/IConnectionManager.js'
import { type IEventBus, SystemEvents } from '../interfaces/IEventBus.js'

export class WebSocketConnectionManager implements IConnectionManager {
  private socket: Socket | null = null
  private hubChannel: Channel | null = null
  private sessionId: string | null = null
  private logger = getLogger('WebSocketConnectionManager')

  constructor(
    private eventBus: IEventBus,
    private configProvider: IConfigurationProvider,
    private appSettings: IAppSettings,
  ) {
    if (this.appSettings.debugMode) {
      this.logger.debug('Debug mode is ON')
    }
  }

  async connect(config: ConnectionConfig): Promise<void> {
    try {
      // Create Phoenix socket (no authentication here, just connect)
      const socketUrl = new URL(config.authUrl)
      socketUrl.pathname = '/socket'
      socketUrl.protocol = socketUrl.protocol.replace('http', 'ws')

      this.socket = new Socket(socketUrl.toString(), {
        params: {
          session_token: null,
          perms_token: null,
        },
        reconnectAfterMs: (tries) => {
          const delay = [1000, 2000, 5000, 10000][tries - 1] || 10000
          this.logger.debug(`Reconnecting in ${delay}ms... (attempt ${tries})`)
          return delay
        },
      })

      // Set up socket event handlers
      this.socket.onOpen(() => {
        this.logger.debug('WebSocket connected')
        this.eventBus.emit(SystemEvents.CONNECTION_ESTABLISHED)
      })

      this.socket.onClose(() => {
        this.logger.debug('WebSocket disconnected')
        this.eventBus.emit(SystemEvents.CONNECTION_LOST)
      })

      this.socket.onError((error) => {
        this.logger.debug('WebSocket error:', { error })
        this.eventBus.emit(SystemEvents.CONNECTION_ERROR, error)
      })

      // Connect socket
      this.socket.connect()

      // Wait for connection
      await this.waitForConnection()

      // Join hub channel
      this.logger.debug('About to join hub:', { hubId: config.hubId })
      await this.joinHub(config.hubId)
    } catch (error) {
      this.logger.error(`Connection failed: ${error}`)
      throw error
    }
  }

  private async joinHub(hubId: string): Promise<void> {
    if (!this.socket) {
      throw new Error('Socket not connected')
    }

    return new Promise((resolve, reject) => {
      // Get profile and context from configuration provider
      const config = this.configProvider.getConfiguration()
      const channelParams = {
        profile: config.profile,
        context: config.context || {},
      }

      this.logger.debug('Attempting to join hub with:', {
        channel: `hub:${hubId}`,
        params: channelParams,
      })

      this.hubChannel = this.socket?.channel(`hub:${hubId}`, channelParams) || null

      if (this.hubChannel) {
        // デバッグモードの場合、主要なイベントを監視
        if (this.appSettings.debugMode) {
          // PhoenixのChannelは特定のイベントに対してのみリスナーを設定可能
          // 全てのイベントを監視するには、個別にリスナーを追加する必要がある
          const debugEvents = [
            'phx_reply',
            'presence_state',
            'presence_diff',
            'message',
            'naf',
            'nafr',
            'event',
            'events:entering',
            'events:entered',
            'events:leaving',
            'events:left',
            'hub:member_update',
            'hub:avatar_update',
            'hub:scene_update',
          ]

          debugEvents.forEach((event) => {
            this.hubChannel?.on(event, (payload: unknown) => {
              this.logger.debug('[WS_RECEIVE]', { event, payload })
            })
          })
        }

        this.hubChannel
          .join()
          .receive('ok', (response: unknown) => {
            this.logger.debug('Joined hub channel:', { response })
            this.sessionId = (response as { session_id: string }).session_id
            this.eventBus.emit(SystemEvents.ROOM_JOINED, response)
            resolve()
          })
          .receive('error', (error: unknown) => {
            this.logger.error(`Failed to join hub: ${error}`)
            reject(new Error(`Failed to join hub: ${JSON.stringify(error)}`))
          })
          .receive('timeout', () => {
            this.logger.error('Hub join timeout')
            reject(new Error('Hub join timeout'))
          })
      } else {
        reject(new Error('Failed to create hub channel'))
      }
    })
  }

  async disconnect(): Promise<void> {
    if (this.hubChannel) {
      this.hubChannel.leave()
      this.hubChannel = null
    }

    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }

    this.sessionId = null
    this.eventBus.emit(SystemEvents.CONNECTION_LOST)
  }

  isConnected(): boolean {
    return this.socket?.isConnected() ?? false
  }

  getSocket(): Socket | null {
    return this.socket
  }

  getHubChannel(): Channel | null {
    return this.hubChannel
  }

  async waitForConnection(timeout: number = 30000): Promise<void> {
    const startTime = Date.now()

    while (!this.isConnected()) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Connection timeout')
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  on(event: string, callback: (...args: unknown[]) => void): void {
    this.hubChannel?.on(event, callback)
  }

  getSessionId(): string | null {
    return this.sessionId
  }
}
