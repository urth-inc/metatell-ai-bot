import { Socket, Channel } from 'phoenix'
import { IConnectionManager, ConnectionConfig } from '../interfaces/IConnectionManager'
import { IEventBus, SystemEvents } from '../interfaces/IEventBus'
import { IConfigurationProvider } from '../interfaces/IConfigurationProvider'

export class WebSocketConnectionManager implements IConnectionManager {
  private socket: Socket | null = null
  private hubChannel: Channel | null = null
  private config: ConnectionConfig | null = null
  private sessionId: string | null = null

  constructor(
    private eventBus: IEventBus,
    private configProvider: IConfigurationProvider
  ) {}

  async connect(config: ConnectionConfig): Promise<void> {
    this.config = config

    try {
      // Create Phoenix socket (no authentication here, just connect)
      const socketUrl = new URL(config.authUrl)
      socketUrl.pathname = '/socket'
      socketUrl.protocol = socketUrl.protocol.replace('http', 'ws')

      this.socket = new Socket(socketUrl.toString(), {
        params: {
          session_token: null,
          perms_token: null
        },
        reconnectAfterMs: (tries) => {
          const delay = [1000, 2000, 5000, 10000][tries - 1] || 10000
          console.log(`Reconnecting in ${delay}ms... (attempt ${tries})`)
          return delay
        }
      })

      // Set up socket event handlers
      this.socket.onOpen(() => {
        console.log('WebSocket connected')
        this.eventBus.emit(SystemEvents.CONNECTION_ESTABLISHED)
      })

      this.socket.onClose(() => {
        console.log('WebSocket disconnected')
        this.eventBus.emit(SystemEvents.CONNECTION_LOST)
      })

      this.socket.onError((error) => {
        console.error('WebSocket error:', error)
        this.eventBus.emit(SystemEvents.CONNECTION_ERROR, error)
      })

      // Connect socket
      this.socket.connect()

      // Wait for connection
      await this.waitForConnection()

      // Join hub channel
      console.log('About to join hub:', config.hubId)
      await this.joinHub(config.hubId)

    } catch (error) {
      console.error('Connection failed:', error)
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
        context: config.context || {}
      }

      console.log('Attempting to join hub with:', {
        channel: `hub:${hubId}`,
        params: channelParams
      })

      this.hubChannel = this.socket!.channel(`hub:${hubId}`, channelParams)

      this.hubChannel
        .join()
        .receive('ok', (response: any) => {
          console.log('Joined hub channel:', response)
          this.sessionId = response.session_id
          this.eventBus.emit(SystemEvents.ROOM_JOINED, response)
          resolve()
        })
        .receive('error', (error: any) => {
          console.error('Failed to join hub:', error)
          reject(new Error(`Failed to join hub: ${JSON.stringify(error)}`))
        })
        .receive('timeout', () => {
          console.error('Hub join timeout')
          reject(new Error('Hub join timeout'))
        })
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
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  on(event: string, callback: (...args: any[]) => void): void {
    this.hubChannel?.on(event, callback)
  }

  getSessionId(): string | null {
    return this.sessionId
  }
}