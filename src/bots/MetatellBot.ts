import type { IAppSettings } from '../core/interfaces/IAppSettings.js'
import type { IAvatarController } from '../core/interfaces/IAvatarController.js'
import type { IConfigurationProvider } from '../core/interfaces/IConfigurationProvider.js'
import type { IConnectionManager } from '../core/interfaces/IConnectionManager.js'
import type { IMessageService } from '../core/interfaces/IMessageService.js'
import type { IPresenceManager, PresenceUser } from '../core/interfaces/IPresenceManager.js'
import type { IUserAvatarManager } from '../core/interfaces/IUserAvatarManager.js'
import { createLogger } from '../utils/logging/logger-factory.js'

export type MessageHandler = (message: string, sessionId: string) => string | null

export class MetatellBot {
  private messageHandlers: MessageHandler[] = []
  private isRunning = false
  private logger = createLogger('MetatellBot')

  constructor(
    private connectionManager: IConnectionManager,
    private messageService: IMessageService,
    private avatarController: IAvatarController,
    private presenceManager: IPresenceManager,
    private configProvider: IConfigurationProvider,
    private userAvatarManager: IUserAvatarManager,
    private appSettings: IAppSettings,
  ) {
    this.setupEventHandlers()
    this.setupDefaultHandlers()
  }

  private setupEventHandlers(): void {
    console.log('🔍 [SETUP_EVENT_HANDLERS] Setting up event handlers')
    
    // Handle incoming messages
    this.messageService.on('message', (payload: unknown) => {
      console.log('🔍 [MESSAGE_EVENT] Received message event')
      this.handleIncomingMessage(payload)
    })
    console.log('🔍 [SETUP_EVENT_HANDLERS] Message handler registered')

    // Handle user joins
    this.presenceManager.on('join', (user: PresenceUser) => {
      this.handleUserJoin(user)
    })

    // Handle user leaves
    this.presenceManager.on('leave', (user: PresenceUser) => {
      this.handleUserLeave(user)
    })
    
    console.log('🔍 [SETUP_EVENT_HANDLERS] All event handlers registered')
  }

  private setupDefaultHandlers(): void {
    // Help command
    this.addMessageHandler((message) => {
      // デバッグログを追加（常に出力）
      const isHelp = message.toLowerCase() === 'help'
      console.log('🔍 [HELP_HANDLER]', { 
        message, 
        messageQuoted: `"${message}"`,
        lowercased: message.toLowerCase(),
        isHelp,
        trimmed: message.trim(),
        trimmedLowercased: message.trim().toLowerCase(),
        charCodes: Array.from(message).map(c => c.charCodeAt(0))
      })
      
      if (this.appSettings.debugMode) {
        this.logger.debug('[HELP_HANDLER]', { 
          message, 
          lowercased: message.toLowerCase(),
          isHelp,
          trimmed: message.trim(),
          trimmedLowercased: message.trim().toLowerCase()
        })
      }
      if (isHelp) {
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
      const includesHello = message.toLowerCase().includes('hello')
      console.log('🔍 [HELLO_HANDLER]', { 
        message, 
        messageQuoted: `"${message}"`,
        lowercased: message.toLowerCase(),
        includesHello,
        charCodes: Array.from(message).map(c => c.charCodeAt(0))
      })
      
      if (includesHello) {
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
    // 最初に生のペイロードをログ出力
    console.log('📨 [RAW_MESSAGE]', payload)
    console.log('🔍 Debug mode status:', this.appSettings.debugMode)
    
    const { body, session_id } = payload as { body: string; session_id: string }

    // Don't respond to own messages
    const config = this.configProvider.getConfiguration()
    if (session_id === this.connectionManager.getSessionId()) {
      console.log('📨 [IGNORED] Own message')
      return
    }

    // デバッグモード時はWSメッセージをログ出力
    console.log('🔍 MetatellBot: Received message:', { 
      body, 
      session_id,
      debugMode: this.appSettings.debugMode,
      botName: config.profile.displayName
    })
    
    if (this.appSettings.debugMode) {
      this.logger.debug('[WS_MESSAGE]', { body, session_id })
    }

    // メンション機能: @名前 がついている場合のみ返事をする
    const botName = config.profile.displayName
    // スペースを含む名前でも正しく動作するように修正
    const escapedBotName = botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const mentionPattern = new RegExp(`@${escapedBotName}(?:\\s|$)`, 'i')
    
    // メンションチェックのログは常に出力
    const mentionTestResult = mentionPattern.test(body)
    console.log('🔍 [MENTION_CHECK]', { 
      botName,
      escapedBotName,
      pattern: mentionPattern.toString(),
      body,
      hasMatch: mentionTestResult,
      bodyCharCodes: Array.from(body).map(c => `${c}(${c.charCodeAt(0)})`)
    })
    
    if (this.appSettings.debugMode) {
      this.logger.debug('[MENTION_CHECK]', { 
        botName,
        pattern: mentionPattern.toString(),
        body,
        hasMatch: mentionTestResult
      })
    }
    
    if (!mentionTestResult) {
      // メンションされていない場合は無視
      console.log('🔍 [MENTION_NOT_FOUND] Ignoring message')
      return
    }

    // メンションを削除してメッセージを処理
    const cleanedMessage = body.replace(mentionPattern, '').trim()
    
    // cleanedMessageのログも常に出力
    console.log('🔍 [MENTION_PROCESSED]', { 
      original: body, 
      cleaned: cleanedMessage,
      cleanedQuoted: `"${cleanedMessage}"`,
      length: cleanedMessage.length,
      charCodes: Array.from(cleanedMessage).map(c => c.charCodeAt(0))
    })
    
    if (this.appSettings.debugMode) {
      this.logger.debug('[MENTION_PROCESSED]', { 
        original: body, 
        cleaned: cleanedMessage,
        cleanedQuoted: `"${cleanedMessage}"`,
        length: cleanedMessage.length,
        charCodes: Array.from(cleanedMessage).map(c => c.charCodeAt(0))
      })
    }

    // Process message through handlers
    console.log(`🔍 [PROCESSING_HANDLERS] Total handlers: ${this.messageHandlers.length}`)
    for (let i = 0; i < this.messageHandlers.length; i++) {
      const handler = this.messageHandlers[i]
      try {
        console.log(`🔍 [HANDLER_${i}] Testing handler...`)
        const response = handler(cleanedMessage, session_id)
        console.log(`🔍 [HANDLER_${i}] Response:`, response)
        
        if (response) {
          console.log(`🔍 [HANDLER_MATCHED] Handler ${i} matched, sending response`)
          if (this.appSettings.debugMode) {
            this.logger.debug('[HANDLER_MATCHED]', { message: cleanedMessage, response })
          }
          this.messageService.sendMessage(response).catch((error) => {
            console.error('🔍 [MESSAGE_SEND_ERROR]', error)
            this.logger.debug('Message send error:', { error })
          })
          break // Only send first matching response
        }
      } catch (error) {
        console.error(`🔍 [HANDLER_ERROR] Error in handler ${i}:`, error)
        this.logger.debug('Error in message handler:', { error })
      }
    }
    console.log('🔍 [HANDLERS_COMPLETE]')
  }

  private async handleUserJoin(user: PresenceUser): Promise<void> {
    const config = this.configProvider.getConfiguration()
    const displayName = user.profile.displayName || 'Unknown'

    // 自分自身のjoinイベントは無視
    if (displayName !== config.profile.displayName) {
      // Welcome new users
      this.messageService.sendMessage(`Welcome to the room, ${displayName}! 👋`).catch((error) => {
        this.logger.debug('Welcome message error:', { error })
      })

      // 重要: 新規ユーザーに対して既存のアバター情報を再送信
      const currentState = this.avatarController.getState()
      if (currentState) {
        // 少し遅延を入れて、新規ユーザーの初期化が完了するのを待つ
        setTimeout(async () => {
          try {
            await this.avatarController.resyncAvatar()
            this.logger.debug(`Resynced avatar for new user: ${displayName}`)
          } catch (error) {
            this.logger.error('Failed to resync avatar:', error)
          }
        }, 1000) // 1秒の遅延
      }
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
        `🤖 ${config.profile.displayName} is now online! Type "@${config.profile.displayName} help" to see what I can do.`,
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
      // エラーが発生しても、停止フラグは設定する
      this.isRunning = false
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
