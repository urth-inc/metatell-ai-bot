import type { PresenceUser } from '@metatell/sdk'
import {
  getLogger,
  type IAppSettings,
  type IAvatarController,
  type IConfigurationProvider,
  type IConnectionManager,
  type IMessageService,
  type IPresenceManager,
  type IUserAvatarManager,
} from '@metatell/sdk'
import { type CommandContext, CommandRegistry } from './commands/BotCommand.js'
import { defaultCommands } from './commands/defaultCommands.js'
import { BotLifecycleManager, type ConnectionInfo } from './handlers/BotLifecycleManager.js'
import { MessageHandler, type MessageHandlerCallback } from './handlers/MessageHandler.js'
import { PresenceHandler } from './handlers/PresenceHandler.js'

export type { MessageHandlerCallback as MessageHandler } from './handlers/MessageHandler.js'

export class MetatellBot {
  private readonly commandRegistry = new CommandRegistry()
  private readonly logger = getLogger('MetatellBot')
  private readonly messageHandler: MessageHandler
  private readonly presenceHandler: PresenceHandler
  private readonly lifecycleManager: BotLifecycleManager

  constructor(
    private connectionManager: IConnectionManager,
    private messageService: IMessageService,
    private avatarController: IAvatarController,
    private presenceManager: IPresenceManager,
    private configProvider: IConfigurationProvider,
    private userAvatarManager: IUserAvatarManager,
    private appSettings: IAppSettings,
  ) {
    this.setupCommands()

    // Initialize handlers directly in constructor
    const commandContext: CommandContext = {
      avatarController: this.avatarController,
      userAvatarManager: this.userAvatarManager,
      presenceManager: this.presenceManager,
      messageService: this.messageService,
      logger: this.logger,
    }

    this.messageHandler = new MessageHandler({
      connectionManager: this.connectionManager,
      messageService: this.messageService,
      configProvider: this.configProvider,
      appSettings: this.appSettings,
      commandRegistry: this.commandRegistry,
      commandContext,
    })

    this.presenceHandler = new PresenceHandler({
      messageService: this.messageService,
      avatarController: this.avatarController,
      configProvider: this.configProvider,
    })

    this.lifecycleManager = new BotLifecycleManager({
      connectionManager: this.connectionManager,
      messageService: this.messageService,
      avatarController: this.avatarController,
      configProvider: this.configProvider,
    })

    this.setupEventHandlers()
    this.setupDefaultHandlers()
  }

  private setupEventHandlers(): void {
    this.logger.debug('[SETUP_EVENT_HANDLERS] Setting up event handlers')

    // Handle incoming messages
    this.messageService.on('message', async (payload: unknown) => {
      this.logger.debug('[MESSAGE_EVENT] Received message event')
      await this.messageHandler.handleIncomingMessage(payload)
    })
    this.logger.debug('[SETUP_EVENT_HANDLERS] Message handler registered')

    // Handle user joins
    this.presenceManager.on('join', (user: PresenceUser) => {
      this.presenceHandler.handleUserJoin(user)
    })

    // Handle user leaves
    this.presenceManager.on('leave', (user: PresenceUser) => {
      this.presenceHandler.handleUserLeave(user)
    })

    this.logger.debug('[SETUP_EVENT_HANDLERS] All event handlers registered')
  }

  /**
   * Setup declarative command system
   */
  private setupCommands(): void {
    // Register default commands
    this.commandRegistry.registerAll(defaultCommands)

    this.logger.info('Command system initialized', {
      commandCount: this.commandRegistry.getAll().length,
    })
  }

  private setupDefaultHandlers(): void {
    // Legacy compatibility: Keep addMessageHandler for custom handlers
    // All default commands are now handled by the command registry
  }

  public addMessageHandler(handler: MessageHandlerCallback): void {
    this.messageHandler.addCustomHandler(handler)
  }

  public removeMessageHandler(handler: MessageHandlerCallback): void {
    this.messageHandler.removeCustomHandler(handler)
  }

  public async start(connectionInfo?: ConnectionInfo): Promise<void> {
    await this.lifecycleManager.start(connectionInfo)
  }

  public async stop(): Promise<void> {
    await this.lifecycleManager.stop()
  }

  public isActive(): boolean {
    return this.lifecycleManager.getRunningState()
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
