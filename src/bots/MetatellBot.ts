import type { IAppSettings } from '../core/interfaces/IAppSettings.js'
import type { IAvatarController } from '../core/interfaces/IAvatarController.js'
import type { IConfigurationProvider } from '../core/interfaces/IConfigurationProvider.js'
import type { IConnectionManager } from '../core/interfaces/IConnectionManager.js'
import type { IMessageService } from '../core/interfaces/IMessageService.js'
import type { IPresenceManager, PresenceUser } from '../core/interfaces/IPresenceManager.js'
import type { IUserAvatarManager } from '../core/interfaces/IUserAvatarManager.js'
import { getLogger } from '../sdk/logging/index.js'
import { CommandRegistry, type CommandContext } from './commands/BotCommand.js'
import { defaultCommands } from './commands/defaultCommands.js'

export type MessageHandler = (message: string, sessionId: string) => string | null | Promise<string | null>

export class MetatellBot {
  private messageHandlers: MessageHandler[] = []
  private commandRegistry = new CommandRegistry()
  private isRunning = false
  private logger = getLogger('MetatellBot')

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
    this.setupCommands()
    this.setupDefaultHandlers()
  }

  private setupEventHandlers(): void {
    this.logger.debug('[SETUP_EVENT_HANDLERS] Setting up event handlers')
    
    // Handle incoming messages
    this.messageService.on('message', async (payload: unknown) => {
      this.logger.debug('[MESSAGE_EVENT] Received message event')
      await this.handleIncomingMessage(payload)
    })
    this.logger.debug('[SETUP_EVENT_HANDLERS] Message handler registered')

    // Handle user joins
    this.presenceManager.on('join', (user: PresenceUser) => {
      this.handleUserJoin(user)
    })

    // Handle user leaves
    this.presenceManager.on('leave', (user: PresenceUser) => {
      this.handleUserLeave(user)
    })
    
    this.logger.debug('[SETUP_EVENT_HANDLERS] All event handlers registered')
  }

  /**
   * Setup declarative command system
   */
  private setupCommands(): void {
    // Register default commands
    this.commandRegistry.registerAll(defaultCommands)
    
    // Create command context
    const context: CommandContext = {
      avatarController: this.avatarController,
      userAvatarManager: this.userAvatarManager,
      presenceManager: this.presenceManager,
      messageService: this.messageService,
      logger: this.logger,
    }
    
    // Add a single message handler that uses the command registry
    this.addMessageHandler(async (message, sessionId) => {
      // Debug logging
      if (this.appSettings.debugMode) {
        this.logger.debug('[COMMAND_HANDLER]', { message, sessionId })
      }
      
      // Try to execute command
      const result = await this.commandRegistry.execute(message, sessionId, context)
      return result
    })
    
    this.logger.info('Command system initialized', { 
      commandCount: this.commandRegistry.getAll().length 
    })
  }
  
  private setupDefaultHandlers(): void {
    // Legacy compatibility: Keep addMessageHandler for custom handlers
    // All default commands are now handled by the command registry
  }

  private async handleIncomingMessage(payload: unknown): Promise<void> {
    // 最初に生のペイロードをログ出力
    this.logger.debug('[RAW_MESSAGE]', payload)
    this.logger.debug('Debug mode status', { debugMode: this.appSettings.debugMode })
    
    const { body, session_id } = payload as { body: string; session_id: string }

    // Don't respond to own messages
    const config = this.configProvider.getConfiguration()
    if (session_id === this.connectionManager.getSessionId()) {
      this.logger.debug('[IGNORED] Own message')
      return
    }

    // デバッグモード時はWSメッセージをログ出力
    this.logger.debug('Received message', { 
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
    this.logger.debug('[MENTION_CHECK]', { 
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
      this.logger.debug('[MENTION_NOT_FOUND] Ignoring message')
      return
    }

    // メンションを削除してメッセージを処理
    const cleanedMessage = body.replace(mentionPattern, '').trim()
    
    // cleanedMessageのログも常に出力
    this.logger.debug('[MENTION_PROCESSED]', { 
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
    this.logger.debug('[PROCESSING_HANDLERS]', { totalHandlers: this.messageHandlers.length })
    for (let i = 0; i < this.messageHandlers.length; i++) {
      const handler = this.messageHandlers[i]
      try {
        this.logger.debug(`[HANDLER_${i}] Testing handler`)
        const response = await handler(cleanedMessage, session_id)
        this.logger.debug(`[HANDLER_${i}] Response`, { response })
        
        if (response) {
          this.logger.debug('[HANDLER_MATCHED]', { handlerIndex: i })
          if (this.appSettings.debugMode) {
            this.logger.debug('[HANDLER_MATCHED]', { message: cleanedMessage, response })
          }
          await this.messageService.sendMessage(response)
          break // Only send first matching response
        }
      } catch (error) {
        this.logger.error('[HANDLER_ERROR]', { handlerIndex: i, error })
      }
    }
    this.logger.debug('[HANDLERS_COMPLETE]')
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

      // 重要: 新規ユーザーに対して既存のアバター情報を即座に送信
      // joinイベントが発火した時点で、ユーザーのクライアントは初期化済み
      const currentState = this.avatarController.getState()
      if (currentState) {
        try {
          await this.avatarController.resyncAvatar()
          this.logger.debug(`Resynced avatar for new user: ${displayName}`)
        } catch (error) {
          this.logger.error('Failed to resync avatar:', { error, user: displayName })
        }
      }
    }
  }

  private handleUserLeave(user: PresenceUser): void {
    const _displayName = user.profile.displayName || 'Unknown'
    // ログは出さない
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

  public async start(connectionInfo?: { authUrl: string; hubId: string; authToken?: string }): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('Bot is already running')
      return
    }

    try {
      const config = this.configProvider.getConfiguration()
      
      // Use provided connection info or fall back to config
      const authUrl = connectionInfo?.authUrl || config.authUrl
      const hubId = connectionInfo?.hubId || config.hubId

      // Connect to server
      await this.connectionManager.connect({
        authUrl,
        hubId,
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

    // Send entering event and wait for server confirmation
    this.logger.info('Sending entering event...')
    try {
      await new Promise<void>((resolve, reject) => {
        const push = channel.push('events:entering', {})
        push
          .receive('ok', () => {
            this.logger.debug('Entering event acknowledged by server')
            resolve()
          })
          .receive('error', (error) => {
            this.logger.error('Entering event failed:', error)
            reject(new Error(`Entering event failed: ${JSON.stringify(error)}`))
          })
          .receive('timeout', () => {
            this.logger.error('Entering event timed out')
            reject(new Error('Entering event timed out'))
          })
      })
    } catch (error) {
      this.logger.error('Failed to send entering event:', error)
      throw error
    }

    // Send entered event and wait for confirmation
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
    try {
      await new Promise<void>((resolve, reject) => {
        const push = channel.push('events:entered', enteredPayload)
        push
          .receive('ok', () => {
            this.logger.debug('Entered event acknowledged by server')
            resolve()
          })
          .receive('error', (error) => {
            this.logger.error('Entered event failed:', error)
            reject(new Error(`Entered event failed: ${JSON.stringify(error)}`))
          })
          .receive('timeout', () => {
            this.logger.error('Entered event timed out')
            reject(new Error('Entered event timed out'))
          })
      })
      this.logger.info('✅ Entered room successfully')
    } catch (error) {
      this.logger.error('Failed to enter room:', error)
      throw error
    }
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
