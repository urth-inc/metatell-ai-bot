/**
 * Bot command definition interface
 */
export interface BotCommand {
  /** Command name for identification */
  name: string
  
  /** Pattern to match the command */
  pattern: RegExp
  
  /** Description of what the command does */
  description: string
  
  /** Usage example */
  usage?: string
  
  /** Handler function that processes the command */
  handler: (match: RegExpMatchArray, sessionId: string, context: CommandContext) => Promise<string | null>
}

import type { IAvatarController } from '../../core/interfaces/IAvatarController.js'
import type { IUserAvatarManager } from '../../core/interfaces/IUserAvatarManager.js'
import type { IPresenceManager } from '../../core/interfaces/IPresenceManager.js'
import type { IMessageService } from '../../core/interfaces/IMessageService.js'
import type { Logger } from '../../sdk/logging/spi.js'

/**
 * Context provided to command handlers
 */
export interface CommandContext {
  avatarController: IAvatarController
  userAvatarManager: IUserAvatarManager
  presenceManager: IPresenceManager
  messageService: IMessageService
  logger: Logger
}

/**
 * Command registry for managing bot commands
 */
export class CommandRegistry {
  private commands: BotCommand[] = []
  
  /**
   * Register a new command
   */
  register(command: BotCommand): void {
    this.commands.push(command)
  }
  
  /**
   * Register multiple commands at once
   */
  registerAll(commands: BotCommand[]): void {
    this.commands.push(...commands)
  }
  
  /**
   * Get all registered commands
   */
  getAll(): BotCommand[] {
    return [...this.commands]
  }
  
  /**
   * Find and execute a matching command
   */
  async execute(
    message: string, 
    sessionId: string, 
    context: CommandContext
  ): Promise<string | null> {
    for (const command of this.commands) {
      const match = message.match(command.pattern)
      if (match) {
        try {
          return await command.handler(match, sessionId, context)
        } catch (error) {
          context.logger.error(`Command ${command.name} failed:`, error)
          return `Error executing ${command.name} command`
        }
      }
    }
    return null
  }
  
  /**
   * Generate help text for all commands
   */
  getHelpText(): string {
    const commandHelp = this.commands
      .filter(cmd => cmd.usage) // Only include commands with usage info
      .map(cmd => `  • ${cmd.usage} - ${cmd.description}`)
      .join('\n')
    
    return `Available commands:\n${commandHelp}`
  }
}