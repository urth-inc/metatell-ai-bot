import type {
  IAvatarController,
  IConfigurationProvider,
  IConnectionManager,
  IMessageService,
} from '@metatell/sdk'
import { getLogger } from '@metatell/sdk'
import { pushPromise } from '../../utils/phoenixUtils.js'

export interface BotLifecycleOptions {
  connectionManager: IConnectionManager
  messageService: IMessageService
  avatarController: IAvatarController
  configProvider: IConfigurationProvider
}

export interface ConnectionInfo {
  serverUrl: string
  hubId: string
  authToken?: string
}

export class BotLifecycleManager {
  private logger = getLogger('BotLifecycleManager')
  private isRunning = false

  constructor(private options: BotLifecycleOptions) {}

  public async start(connectionInfo?: ConnectionInfo): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('Bot is already running')
      return
    }

    try {
      await this.establishConnection(connectionInfo)
      await this.enterRoom()
      await this.spawnAvatar()
      await this.sendWelcomeMessage()

      this.isRunning = true
      this.logger.info('Bot started successfully')
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

    const errors: Array<{ operation: string; error: unknown }> = []

    // Send goodbye message (non-critical, don't fail if this fails)
    try {
      await this.sendGoodbyeMessage()
    } catch (error) {
      this.logger.error('Failed to send goodbye message:', error)
      errors.push({ operation: 'sendGoodbyeMessage', error })
    }

    // Destroy avatar (non-critical)
    try {
      await this.destroyAvatar()
    } catch (error) {
      this.logger.error('Failed to destroy avatar:', error)
      errors.push({ operation: 'destroyAvatar', error })
    }

    // Disconnect (critical - must always attempt)
    try {
      await this.disconnect()
    } catch (error) {
      this.logger.error('Failed to disconnect:', error)
      errors.push({ operation: 'disconnect', error })
    }

    this.isRunning = false

    // Report success/partial success
    if (errors.length === 0) {
      this.logger.info('Bot stopped successfully')
    } else if (errors.length < 3) {
      this.logger.warn(`Bot stopped with ${errors.length} error(s):`, errors)
    } else {
      // All operations failed - throw aggregated error
      const errorMessage = `Bot stop failed completely: ${errors.map((e) => e.operation).join(', ')}`
      this.logger.error(errorMessage, errors)
      throw new Error(errorMessage)
    }
  }

  public getRunningState(): boolean {
    return this.isRunning
  }

  private async establishConnection(connectionInfo?: ConnectionInfo): Promise<void> {
    const config = this.options.configProvider.getConfiguration()

    const serverUrl = connectionInfo?.serverUrl || config.serverUrl
    const hubId = connectionInfo?.hubId || config.hubId

    await this.options.connectionManager.connect({
      serverUrl,
      hubId,
    })
  }

  private async enterRoom(): Promise<void> {
    this.logger.info('Entering room...')

    const channel = this.options.connectionManager.getHubChannel()
    if (!channel) {
      throw new Error('No hub channel available')
    }

    try {
      // Send entering event
      await pushPromise(channel, 'events:entering', {})
      this.logger.debug('Entering event acknowledged')

      // Send entered event with metadata
      const enteredPayload = {
        initialOccupantCount: 0,
        isNewDaily: true,
        isNewMonthly: true,
        isNewDayWindow: true,
        isNewMonthWindow: true,
        entryDisplayType: 'Bot',
        userAgent: 'MetatellBot/1.0',
      }

      await pushPromise(channel, 'events:entered', enteredPayload)
      this.logger.info('Successfully entered room')
    } catch (error) {
      this.logger.error('Failed to enter room:', { error })
      throw error
    }
  }

  private async spawnAvatar(): Promise<void> {
    const config = this.options.configProvider.getConfiguration()
    this.logger.info('Spawning avatar...', { avatarId: config.profile.avatarId })
    await this.options.avatarController.spawn(config.profile.avatarId)
  }

  private async sendWelcomeMessage(): Promise<void> {
    const config = this.options.configProvider.getConfiguration()
    this.logger.info('Sending welcome message...')
    await this.options.messageService.sendMessage(
      `🤖 ${config.profile.displayName} is now online! Type "@${config.profile.displayName} help" to see what I can do.`,
    )
  }

  private async sendGoodbyeMessage(): Promise<void> {
    await this.options.messageService.sendMessage('Goodbye everyone! See you next time! 👋')
  }

  private async destroyAvatar(): Promise<void> {
    await this.options.avatarController.destroy()
  }

  private async disconnect(): Promise<void> {
    await this.options.connectionManager.disconnect()
  }
}
