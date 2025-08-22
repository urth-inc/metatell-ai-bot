import type {
  IAvatarController,
  IConfigurationProvider,
  IMessageService,
  PresenceUser,
} from '@metatell/sdk'
import { getLogger } from '@metatell/sdk'

export interface PresenceHandlerOptions {
  messageService: IMessageService
  avatarController: IAvatarController
  configProvider: IConfigurationProvider
}

export class PresenceHandler {
  private logger = getLogger('PresenceHandler')

  constructor(private options: PresenceHandlerOptions) {}

  public async handleUserJoin(user: PresenceUser): Promise<void> {
    const config = this.options.configProvider.getConfiguration()
    const displayName = user.profile.displayName || 'Unknown'

    // Ignore self join events
    if (displayName === config.profile.displayName) {
      return
    }

    await this.sendWelcomeMessage(displayName)
    await this.resyncAvatarForNewUser(displayName)
  }

  public handleUserLeave(user: PresenceUser): void {
    const _displayName = user.profile.displayName || 'Unknown'
    // Currently no action on user leave
  }

  private async sendWelcomeMessage(displayName: string): Promise<void> {
    try {
      await this.options.messageService.sendMessage(`Welcome to the room, ${displayName}! 👋`)
    } catch (error) {
      this.logger.debug('Welcome message error:', { error })
    }
  }

  private async resyncAvatarForNewUser(displayName: string): Promise<void> {
    const currentState = this.options.avatarController.getState()
    if (!currentState) {
      return
    }

    try {
      await this.options.avatarController.resyncAvatar()
      this.logger.debug(`Resynced avatar for new user: ${displayName}`)
    } catch (error) {
      this.logger.error('Failed to resync avatar:', { error, user: displayName })
    }
  }
}
