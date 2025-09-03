/**
 * Bot initialization orchestrator
 * Responsible for setting up configuration, selecting avatar, and creating AgentClient
 */

import {
  type AgentClient,
  AvatarController,
  type BotConfiguration,
  createAgentClient,
  getLogger,
  type IAvatarController,
  type IMessageService,
  type IOrganizationService,
  type IPresenceManager,
  type IUserAvatarManager,
  MessageService,
  type OrganizationAvatar,
  OrganizationService,
  PresenceManager,
  UserAvatarManager,
} from '@metatell/sdk'
import { BotServiceFactory } from './bots/BotServiceFactory.js'
import type { CommandContext } from './bots/commands/BotCommand.js'
import { ConfigManager } from './cli/config/config.js'
import type { CliArgs } from './schemas/cli.js'
import { processMetatellUrl } from './utils/metatell-url.js'

export interface BotInitResult {
  config: BotConfiguration
  client: AgentClient
  commandContext: CommandContext
  selectedAvatar?: {
    id: string
    name: string
    url: string
  }
  organizationInfo?: {
    organizationId?: string
    realmId?: string
  }
}

export class BotInitializer {
  private logger = getLogger('BotInitializer')

  async setup(cliArgs: CliArgs): Promise<BotInitResult> {
    // 1. Configuration resolution
    const configManager = new ConfigManager()
    const flags = this.buildFlags(cliArgs)
    const rawConfig = await configManager.getConfig(flags)

    if (!rawConfig.url) {
      throw new Error('No URL specified. Use --help for usage information.')
    }

    // 2. Process Metatell URL
    const { serverUrl, hubId } = processMetatellUrl(rawConfig.url)

    this.logger.info('Processing bot configuration', {
      hubUrl: rawConfig.url,
      serverUrl,
      hubId,
    })

    // 3. Avatar selection logic
    let selectedAvatar: OrganizationAvatar | undefined
    let selectedAvatarId = rawConfig.profile?.avatarId
    const avatarSelection = rawConfig.profile?.avatarSelection

    // Create a temporary factory to fetch organization info
    const tempFactory = new BotServiceFactory({
      serverUrl,
      hubUrl: rawConfig.url,
      hubId,
      profile: { displayName: 'temp', avatarId: '' },
      context: { mobile: false, embed: false, hmd: false },
      debug: false,
    })

    // If no specific avatar ID is provided, fetch from organization
    if (!selectedAvatarId || avatarSelection === 'organization' || avatarSelection === 'random') {
      try {
        const organizationService = tempFactory.getService(
          OrganizationService,
        ) as IOrganizationService
        const orgInfo = await organizationService.getOrganizationInfo(rawConfig.url, hubId)

        this.logger.info('Fetched organization info', {
          organizationId: orgInfo.organizationId,
          realmId: orgInfo.realmId,
        })

        if (orgInfo.organizationId) {
          const avatars = await organizationService.fetchOrganizationAvatars(
            rawConfig.url,
            orgInfo.organizationId,
          )

          if (avatars.length > 0) {
            selectedAvatar =
              organizationService.selectAvatar(avatars, {
                avatarId: selectedAvatarId,
                avatarSelection: avatarSelection,
              }) || undefined

            if (selectedAvatar) {
              selectedAvatarId = selectedAvatar.id
              this.logger.info('Selected organization avatar', {
                avatarId: selectedAvatar.id,
                avatarName: selectedAvatar.name,
                avatarUrl: selectedAvatar.gltf.avatar,
              })
            }
          }
        }
      } catch (error) {
        this.logger.error('Failed to fetch organization avatars', { error })
        // Continue with fallback avatar if provided
      }
    }

    // 4. Build final bot configuration
    const botConfig: BotConfiguration = {
      serverUrl,
      hubUrl: rawConfig.url,
      hubId,
      profile: {
        displayName: rawConfig.profile?.displayName || 'AI Assistant',
        avatarId: selectedAvatarId || '', // Require avatar ID
      },
      context: {
        mobile: false,
        embed: false,
        hmd: false,
      },
      debug: rawConfig.debug || false,
      botAccessKey: rawConfig.botAccessKey,
      organizationAvatarUrl: selectedAvatar?.gltf.avatar,
    }

    // 5. Create AgentClient using the SDK
    const client = createAgentClient(botConfig)

    // Create factory for legacy services (temporary until full migration)
    const factory = new BotServiceFactory(botConfig)

    // 6. Create command context
    const commandContext: CommandContext = {
      avatarController: factory.getService(AvatarController) as IAvatarController,
      userAvatarManager: factory.getService(UserAvatarManager) as IUserAvatarManager,
      presenceManager: factory.getService(PresenceManager) as IPresenceManager,
      messageService: factory.getService(MessageService) as IMessageService,
      logger: getLogger('CommandContext'),
      agentClient: client,
      botConfig: botConfig,
      organizationService: factory.getService(OrganizationService) as IOrganizationService,
    }

    // 7. Get organization info for display
    let organizationInfo: { organizationId?: string; realmId?: string } = {}
    try {
      const organizationService = factory.getService(OrganizationService) as IOrganizationService
      const orgInfo = await organizationService.getOrganizationInfo(rawConfig.url, hubId)
      organizationInfo = orgInfo
    } catch (error) {
      this.logger.debug('Failed to get organization info for display', { error })
    }

    return {
      config: botConfig,
      client,
      commandContext,
      selectedAvatar: selectedAvatar
        ? {
            id: selectedAvatar.id,
            name: selectedAvatar.name,
            url: selectedAvatar.gltf.avatar,
          }
        : undefined,
      organizationInfo,
    }
  }

  private buildFlags(cliArgs: CliArgs): Record<string, string | boolean> {
    const flags: Record<string, string | boolean> = {}

    if (cliArgs.url) flags['--url'] = cliArgs.url
    if (cliArgs.token) flags['--token'] = cliArgs.token
    if (cliArgs.debug) flags['--debug'] = true
    if (cliArgs.profile) flags['--profile'] = cliArgs.profile

    return flags
  }
}
