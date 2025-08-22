import type {
  IAvatarController,
  IConfigurationProvider,
  IConnectionManager,
  IMessageService,
} from '@metatell/sdk'
import { getLogger } from '@metatell/sdk'

export interface BotLifecycleOptions {
  connectionManager: IConnectionManager
  messageService: IMessageService
  avatarController: IAvatarController
  configProvider: IConfigurationProvider
}

export interface ConnectionInfo {
  authUrl: string
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

    try {
      await this.sendGoodbyeMessage()
      await this.destroyAvatar()
      await this.disconnect()

      this.isRunning = false
      this.logger.info('Bot stopped successfully')
    } catch (error) {
      this.logger.error(`Error stopping bot: ${error}`)
      this.isRunning = false
    }
  }

  public getRunningState(): boolean {
    return this.isRunning
  }

  private async establishConnection(connectionInfo?: ConnectionInfo): Promise<void> {
    const config = this.options.configProvider.getConfiguration()

    const authUrl = connectionInfo?.authUrl || config.authUrl
    const hubId = connectionInfo?.hubId || config.hubId

    await this.options.connectionManager.connect({
      authUrl,
      hubId,
    })
  }

  private async enterRoom(): Promise<void> {
    this.logger.info('Entering room...')

    const channel = this.options.connectionManager.getHubChannel()
    if (!channel) {
      throw new Error('No hub channel available')
    }

    // Send entering event first
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for room entry'))
      }, 30000)

      channel
        .push('events:entering', {})
        .receive('ok', () => {
          clearTimeout(timeout)
          this.logger.debug('Entering event acknowledged')
          resolve()
        })
        .receive('error', (resp: unknown) => {
          clearTimeout(timeout)
          this.logger.error('Failed to send entering event:', resp)
          reject(new Error('Failed to send entering event'))
        })
        .receive('timeout', () => {
          clearTimeout(timeout)
          this.logger.error('Timeout sending entering event')
          reject(new Error('Timeout sending entering event'))
        })
    })

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

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for room entry'))
      }, 30000)

      channel
        .push('events:entered', enteredPayload)
        .receive('ok', () => {
          clearTimeout(timeout)
          this.logger.info('Successfully entered room')
          resolve()
        })
        .receive('error', (resp: unknown) => {
          clearTimeout(timeout)
          this.logger.error('Failed to enter room:', resp)
          reject(new Error('Failed to enter room'))
        })
        .receive('timeout', () => {
          clearTimeout(timeout)
          this.logger.error('Timeout entering room')
          reject(new Error('Timeout entering room'))
        })
    })
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
