import type { IAvatarController } from '../core/interfaces/IAvatarController.js'
import type { IConfigurationProvider } from '../core/interfaces/IConfigurationProvider.js'
import type { IConnectionManager } from '../core/interfaces/IConnectionManager.js'
import type { IMessageService } from '../core/interfaces/IMessageService.js'
import type { IPresenceManager, PresenceUser } from '../core/interfaces/IPresenceManager.js'
import type { IUserAvatarManager } from '../core/interfaces/IUserAvatarManager.js'
import { LoggerFactory } from '../utils/logging/logger-factory.js'

export type MessageHandler = (message: string, sessionId: string) => string | null

export class MetatellBot {
  private messageHandlers: MessageHandler[] = []
  private isRunning = false
  private logger = LoggerFactory.createLogger('MetatellBot')

  constructor(
    private connectionManager: IConnectionManager,
    private messageService: IMessageService,
    private avatarController: IAvatarController,
    private presenceManager: IPresenceManager,
    private configProvider: IConfigurationProvider,
    private userAvatarManager: IUserAvatarManager,
  ) {
    this.setupEventHandlers()
    this.setupDefaultHandlers()
  }

  private setupEventHandlers(): void {
    // Handle incoming messages
    this.messageService.on('message', (payload: unknown) => {
      this.handleIncomingMessage(payload)
    })

    // Handle user joins
    this.presenceManager.on('join', (user: PresenceUser) => {
      this.handleUserJoin(user)
    })

    // Handle user leaves
    this.presenceManager.on('leave', (user: PresenceUser) => {
      this.handleUserLeave(user)
    })
  }

  private setupDefaultHandlers(): void {
    // Help command
    this.addMessageHandler((message) => {
      if (message.toLowerCase() === 'help') {
        return `Available commands:
• help - Show this help message
• info - Show room information
• hello - Say hello!
• time - Show current time
• move <x> <y> <z> - Move avatar to position
• users - Show all users with positions
• nearby <radius> - Show users within radius`
      }
      return null
    })

    // Info command
    this.addMessageHandler((message) => {
      if (message.toLowerCase() === 'info') {
        return this.getRoomInfo()
      }
      return null
    })

    // Hello command
    this.addMessageHandler((message) => {
      if (message.toLowerCase().includes('hello')) {
        const config = this.configProvider.getConfiguration()
        return `Hello! I'm ${config.profile.displayName}, your AI assistant! 👋`
      }
      return null
    })

    // Time command
    this.addMessageHandler((message) => {
      if (message.toLowerCase() === 'time') {
        return `Current time: ${new Date().toLocaleString()}`
      }
      return null
    })

    // Move command
    this.addMessageHandler((message) => {
      const moveMatch = message.match(
        /^move\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/i,
      )
      if (moveMatch) {
        const x = parseFloat(moveMatch[1])
        const y = parseFloat(moveMatch[2])
        const z = parseFloat(moveMatch[3])

        this.avatarController.move({ x, y, z }).catch((error) => {
          this.logger.debug('Avatar move error:', { error })
        })
        return `Moving to position (${x}, ${y}, ${z})`
      }
      return null
    })

    // Users command - 全ユーザーと位置情報を表示
    this.addMessageHandler((message) => {
      if (message.toLowerCase() === 'users') {
        const users = this.userAvatarManager.getUsers()
        if (users.length === 0) {
          return 'No users currently in the room'
        }

        const userList = users
          .map((u) => {
            const pos = u.position
            return `• ${u.nickname} (${u.id.substring(0, 8)}...) at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`
          })
          .join('\n')

        return `👥 Users in room (${users.length}):\n${userList}`
      }
      return null
    })

    // Nearby command - 指定半径内のユーザーを表示
    this.addMessageHandler((message) => {
      const nearbyMatch = message.match(/^nearby\s+(\d+(?:\.\d+)?)$/i)
      if (nearbyMatch) {
        const radius = parseFloat(nearbyMatch[1])
        const myState = this.avatarController.getState()

        if (!myState) {
          return 'Bot avatar not spawned yet'
        }

        const nearbyUsers = this.userAvatarManager.getUsersInRange(myState.position, radius)

        if (nearbyUsers.length === 0) {
          return `No users within ${radius} units`
        }

        const userList = nearbyUsers
          .map((u) => {
            const pos = u.position
            const dx = pos.x - myState.position.x
            const dy = pos.y - myState.position.y
            const dz = pos.z - myState.position.z
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
            return `• ${u.nickname} - ${distance.toFixed(1)} units away`
          })
          .join('\n')

        return `📍 Users within ${radius} units (${nearbyUsers.length}):\n${userList}`
      }
      return null
    })
  }

  private handleIncomingMessage(payload: unknown): void {
    const { body, session_id } = payload as { body: string; session_id: string }

    // Don't respond to own messages
    const _config = this.configProvider.getConfiguration()
    if (session_id === this.connectionManager.getSessionId()) {
      return
    }

    // ログは出さない（Ink UI内で処理するため）

    // Process message through handlers
    for (const handler of this.messageHandlers) {
      try {
        const response = handler(body, session_id)
        if (response) {
          this.messageService.sendMessage(response).catch((error) => {
            this.logger.debug('Message send error:', { error })
          })
          break // Only send first matching response
        }
      } catch (error) {
        this.logger.debug('Error in message handler:', { error })
      }
    }
  }

  private handleUserJoin(user: PresenceUser): void {
    const config = this.configProvider.getConfiguration()
    const displayName = user.profile.displayName || 'Unknown'

    // Welcome new users
    if (displayName !== config.profile.displayName) {
      this.messageService.sendMessage(`Welcome to the room, ${displayName}! 👋`).catch((error) => {
        this.logger.debug('Welcome message error:', { error })
      })
    }
  }

  private handleUserLeave(user: PresenceUser): void {
    const _displayName = user.profile.displayName || 'Unknown'
    // ログは出さない
  }

  private getRoomInfo(): string {
    const users = this.presenceManager.getUsers()
    const userList = users.map((u) => u.profile.displayName || 'Unknown').join(', ')

    return `📊 Room Information:
• Users online: ${users.length}
• Connected users: ${userList}
• Server time: ${new Date().toLocaleString()}`
  }

  public addMessageHandler(handler: MessageHandler): void {
    this.messageHandlers.push(handler)
  }

  public removeMessageHandler(handler: MessageHandler): void {
    const index = this.messageHandlers.indexOf(handler)
    if (index !== -1) {
      this.messageHandlers.splice(index, 1)
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('Bot is already running')
      return
    }

    try {
      const config = this.configProvider.getConfiguration()

      // Connect to server
      await this.connectionManager.connect({
        authUrl: config.authUrl,
        hubId: config.hubId,
      })

      // Enter room
      this.logger.info('Entering room...')
      await this.enterRoom()

      // Spawn avatar
      this.logger.info('Spawning avatar...', { avatarId: config.profile.avatarId })
      await this.avatarController.spawn(config.profile.avatarId)

      // Send welcome message
      this.logger.info('Sending welcome message...')
      await this.messageService.sendMessage(
        `🤖 ${config.profile.displayName} is now online! Type "help" to see what I can do.`,
      )

      this.isRunning = true
      // logger.debug('✅ Bot started successfully')
    } catch (error) {
      this.logger.error(`Failed to start bot: ${error}`)
      throw error
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.debug('Bot is not running')
      return
    }

    try {
      // Send goodbye message
      await this.messageService.sendMessage('Goodbye everyone! See you next time! 👋')

      // Destroy avatar
      await this.avatarController.destroy()

      // Disconnect
      await this.connectionManager.disconnect()

      this.isRunning = false
      // logger.debug('Bot stopped successfully')
    } catch (error) {
      this.logger.error(`Error stopping bot: ${error}`)
    }
  }

  private async enterRoom(): Promise<void> {
    const channel = this.connectionManager.getHubChannel()
    if (!channel) {
      throw new Error('Not connected to hub')
    }

    // Send entering event
    this.logger.info('Sending entering event...')
    channel.push('events:entering', {})

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Send entered event
    const enteredPayload = {
      initialOccupantCount: 0,
      isNewDaily: true,
      isNewMonthly: true,
      isNewDayWindow: true,
      isNewMonthWindow: true,
      entryDisplayType: 'Bot',
      userAgent: 'MetatellBot/1.0',
    }

    this.logger.info('Sending entered event...', enteredPayload)
    channel.push('events:entered', enteredPayload)
    this.logger.info('✅ Entered room')
  }

  public isActive(): boolean {
    return this.isRunning
  }

  public getAvatarState() {
    return this.avatarController.getState()
  }

  public async moveAvatar(position: { x: number; y: number; z: number }) {
    return this.avatarController.move(position)
  }

  public async lookAt(target: { x: number; y: number; z: number }) {
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

    this.logger.debug('🔄 [AVATAR LOOK AT]', {
      currentPosition: currentState.position,
      targetPosition: target,
      deltaX: dx,
      deltaZ: dz,
      angle: angle,
      angleDegrees: (angle * 180) / Math.PI,
      quaternion: rotation,
    })

    return this.avatarController.rotate(rotation)
  }

  public async lookAtUser(userId: string) {
    const user = this.userAvatarManager.getUser(userId)
    if (!user) {
      throw new Error(`User not found: ${userId}`)
    }
    return this.lookAt(user.position)
  }

  public async lookAtNearestUser() {
    const currentState = this.avatarController.getState()
    if (!currentState) {
      throw new Error('Avatar not spawned')
    }

    const nearestUser = this.userAvatarManager.getNearestUser(currentState.position)
    if (!nearestUser) {
      throw new Error('No users found')
    }

    this.logger.debug(`Looking at nearest user: ${nearestUser.nickname}`)
    return this.lookAt(nearestUser.position)
  }

  public async sendMessage(message: string) {
    return this.messageService.sendMessage(message)
  }
}
