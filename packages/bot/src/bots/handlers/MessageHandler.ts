import type {
  IAppSettings,
  IConfigurationProvider,
  IConnectionManager,
  IMessageService,
} from '@metatell/sdk'
import { getLogger } from '@metatell/sdk'
import { parseMention } from '../../utils/mentionParser.js'
import type { CommandContext, CommandRegistry } from '../commands/BotCommand.js'

export type MessageHandlerCallback = (
  message: string,
  sessionId: string,
) => string | null | Promise<string | null>

export interface MessageHandlerOptions {
  connectionManager: IConnectionManager
  messageService: IMessageService
  configProvider: IConfigurationProvider
  appSettings: IAppSettings
  commandRegistry: CommandRegistry
  commandContext: CommandContext
}

export class MessageHandler {
  private logger = getLogger('MessageHandler')
  private customHandlers: MessageHandlerCallback[] = []

  constructor(private options: MessageHandlerOptions) {}

  public async handleIncomingMessage(payload: unknown): Promise<void> {
    this.logger.debug('[RAW_MESSAGE]', payload)
    this.logger.debug('Debug mode status', { debugMode: this.options.appSettings.debugMode })

    const { body, session_id } = payload as { body: string; session_id: string }

    if (!this.shouldProcessMessage(session_id)) {
      this.logger.debug('[IGNORED] Own message')
      return
    }

    const config = this.options.configProvider.getConfiguration()
    const botName = config.profile.displayName

    this.logMessageDetails(body, session_id, botName)

    // Use utility function for mention parsing
    const commandText = parseMention(body, botName)

    if (commandText === null) {
      this.logger.debug('[MENTION_NOT_FOUND] Ignoring message')
      return
    }

    await this.processMessage(commandText, session_id)
  }

  private shouldProcessMessage(sessionId: string): boolean {
    return sessionId !== this.options.connectionManager.getSessionId()
  }

  private async processMessage(message: string, sessionId: string): Promise<void> {
    // First try command registry
    const commandResult = await this.options.commandRegistry.execute(
      message,
      sessionId,
      this.options.commandContext,
    )

    if (commandResult) {
      this.logger.debug('[COMMAND_MATCHED]', { message, response: commandResult })
      await this.options.messageService.sendMessage(commandResult)
      return
    }

    // Then try custom handlers
    this.logger.debug('[PROCESSING_HANDLERS]', { totalHandlers: this.customHandlers.length })

    for (let i = 0; i < this.customHandlers.length; i++) {
      const handler = this.customHandlers[i]
      try {
        this.logger.debug(`[HANDLER_${i}] Testing handler`)
        const response = await handler(message, sessionId)
        this.logger.debug(`[HANDLER_${i}] Response`, { response })

        if (response) {
          this.logger.debug('[HANDLER_MATCHED]', { handlerIndex: i })
          await this.options.messageService.sendMessage(response)
          break
        }
      } catch (error) {
        this.logger.error('[HANDLER_ERROR]', { handlerIndex: i, error })
      }
    }

    this.logger.debug('[HANDLERS_COMPLETE]')
  }

  private logMessageDetails(body: string, sessionId: string, botName: string): void {
    this.logger.debug('Received message', {
      body,
      session_id: sessionId,
      debugMode: this.options.appSettings.debugMode,
      botName,
    })

    if (this.options.appSettings.debugMode) {
      this.logger.debug('[WS_MESSAGE]', { body, session_id: sessionId })
    }
  }

  public addCustomHandler(handler: MessageHandlerCallback): void {
    this.customHandlers.push(handler)
  }

  public removeCustomHandler(handler: MessageHandlerCallback): void {
    const index = this.customHandlers.indexOf(handler)
    if (index !== -1) {
      this.customHandlers.splice(index, 1)
    }
  }
}
