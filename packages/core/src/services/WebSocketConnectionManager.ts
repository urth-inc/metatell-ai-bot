// WebSocket polyfill for Node.js environment
import WebSocketImpl from 'ws'

// Set WebSocket globally in Node.js environment if not already defined
// Phoenix.js expects the browser's WebSocket API to be available globally
if (typeof global !== 'undefined') {
  const g = global as {
    WebSocket?: unknown
  }

  if (!g.WebSocket) {
    // biome-ignore lint/suspicious/noExplicitAny: ws library provides a compatible WebSocket implementation for Node.js
    g.WebSocket = WebSocketImpl as any
  }
}

import { type Channel, Socket } from 'phoenix'
import type { IAppSettings } from '../interfaces/IAppSettings.js'
import type { IConfigurationProvider } from '../interfaces/IConfigurationProvider.js'
import type { ConnectionConfig, IConnectionManager } from '../interfaces/IConnectionManager.js'
import { type IEventBus, SystemEvents } from '../interfaces/IEventBus.js'
import { getLogger } from '../logging/index.js'

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
      const socketUrl = new URL(config.serverUrl)
      socketUrl.pathname = '/socket'
      // プロトコルがhttpまたはhttpsの場合のみ変換
      if (socketUrl.protocol === 'http:') {
        socketUrl.protocol = 'ws:'
      } else if (socketUrl.protocol === 'https:') {
        socketUrl.protocol = 'wss:'
      }
      // すでにws:またはwss:の場合はそのまま使用

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

      // Join ret channel first (required by Metatell backend)
      await this.joinRetChannel(config.hubId)

      // Join hub channel
      this.logger.debug('About to join hub:', { hubId: config.hubId })
      await this.joinHub(config.hubId)
    } catch (error) {
      this.logger.error(`Connection failed: ${error}`)
      throw error
    }
  }

  private async joinRetChannel(hubId: string): Promise<void> {
    if (!this.socket) {
      throw new Error('Socket not connected')
    }

    return new Promise((resolve, reject) => {
      const retChannel = this.socket?.channel('ret', { hub_id: hubId })

      if (!retChannel) {
        reject(new Error('Failed to create ret channel'))
        return
      }

      retChannel
        .join()
        .receive('ok', () => {
          this.logger.debug('Successfully joined ret channel')
          resolve()
        })
        .receive('error', (error) => {
          this.logger.error('Failed to join ret channel:', error)
          reject(new Error(`Failed to join ret channel: ${JSON.stringify(error)}`))
        })
        .receive('timeout', () => {
          this.logger.error('Timeout joining ret channel')
          reject(new Error('Timeout joining ret channel'))
        })
    })
  }

  private async joinHub(hubId: string): Promise<void> {
    if (!this.socket) {
      throw new Error('Socket not connected')
    }

    return new Promise((resolve, reject) => {
      // Get profile and context from configuration provider
      const config = this.configProvider.getConfiguration()

      // Build channel parameters
      // Note: Don't send auth_token/perms_token if they're null
      // The backend has issues handling null tokens
      const channelParams: Record<string, unknown> = {
        profile: config.profile,
        context: config.context || {},
      }

      // Add bot_access_key if provided
      if (config.botAccessKey) {
        channelParams.bot_access_key = config.botAccessKey
      }

      // Send auth_token when an OIDC token is available. The backend resolves the account from it
      // and grants room-role permissions such as text_chat. Omit it when unset; do not send null.
      if (config.authToken) {
        channelParams.auth_token = config.authToken
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

            // session_idまたはsessionIdを探す
            const sessionResponse = response as Record<string, unknown>
            this.sessionId =
              ((sessionResponse.session_id ||
                sessionResponse.sessionId ||
                sessionResponse.id) as string) || null

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
