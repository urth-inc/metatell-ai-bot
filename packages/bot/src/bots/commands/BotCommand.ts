/**
 * Unified command definition interface for both Bot and CLI
 */
export interface UnifiedCommand {
  /** Command name for identification */
  name: string

  /** Pattern to match the command (for bot mentions) */
  pattern?: RegExp

  /** CLI command aliases (e.g., ['move', 'mv']) */
  cliAliases?: string[]

  /** Description of what the command does */
  description: string

  /** Usage example */
  usage?: string

  /** Handler function for bot mentions */
  botHandler?: (
    match: RegExpMatchArray,
    sessionId: string,
    context: CommandContext,
  ) => Promise<string | null>

  /** Handler function for CLI commands */
  cliHandler?: (
    args: string[],
    context: CommandContext,
  ) => Promise<{ success: boolean; message?: string }>
}

/**
 * Legacy Bot command definition interface (for backward compatibility)
 */
export interface BotCommand extends UnifiedCommand {
  /** Pattern to match the command */
  pattern: RegExp

  /** Handler function that processes the command */
  handler: (
    match: RegExpMatchArray,
    sessionId: string,
    context: CommandContext,
  ) => Promise<string | null>
}

import type {
  AgentClient,
  IAvatarController,
  IMessageService,
  IPresenceManager,
  IUserAvatarManager,
  Logger,
} from '@metatell/sdk'

/**
 * Context provided to command handlers
 */
export interface CommandContext {
  avatarController: IAvatarController
  userAvatarManager: IUserAvatarManager
  presenceManager: IPresenceManager
  messageService: IMessageService
  logger: Logger
  // Additional context for CLI commands
  agentClient?: AgentClient
  botConfig?: import('@metatell/sdk').BotConfiguration
  organizationService?: import('@metatell/sdk').IOrganizationService
}

/**
 * Command registry for managing bot commands
 */
export class CommandRegistry {
  private commands: UnifiedCommand[] = []

  /**
   * Register a new command (accepts both UnifiedCommand and BotCommand)
   */
  register(command: UnifiedCommand | BotCommand): void {
    // Convert BotCommand to UnifiedCommand if needed
    if ('handler' in command && !('botHandler' in command)) {
      const unifiedCommand: UnifiedCommand = {
        ...command,
        botHandler: command.handler,
      }
      this.commands.push(unifiedCommand)
    } else {
      this.commands.push(command)
    }
  }

  /**
   * Register multiple commands at once
   */
  registerAll(commands: (UnifiedCommand | BotCommand)[]): void {
    commands.forEach((cmd) => {
      this.register(cmd)
    })
  }

  /**
   * Get all registered commands
   */
  getAll(): UnifiedCommand[] {
    return [...this.commands]
  }

  /**
   * Find command by name or CLI alias
   */
  findCommand(nameOrAlias: string): UnifiedCommand | undefined {
    return this.commands.find(
      (cmd) => cmd.name === nameOrAlias || cmd.cliAliases?.includes(nameOrAlias),
    )
  }

  /**
   * Execute a bot command (from mentions)
   */
  async execute(
    message: string,
    sessionId: string,
    context: CommandContext,
  ): Promise<string | null> {
    for (const command of this.commands) {
      if (!command.pattern) continue

      const match = message.match(command.pattern)
      if (match) {
        try {
          const handler = command.botHandler || (command as BotCommand).handler
          if (handler) {
            return await handler(match, sessionId, context)
          }
        } catch (error) {
          context.logger.error(`Command ${command.name} failed:`, error)
          return `Error executing ${command.name} command`
        }
      }
    }
    return null
  }

  /**
   * Execute a CLI command
   */
  async executeCLI(
    commandName: string,
    args: string[],
    context: CommandContext,
  ): Promise<{ success: boolean; message?: string }> {
    const command = this.findCommand(commandName)

    if (!command) {
      return { success: false, message: `Unknown command: ${commandName}` }
    }

    if (!command.cliHandler) {
      return { success: false, message: `Command ${commandName} is not available in CLI` }
    }

    try {
      return await command.cliHandler(args, context)
    } catch (error) {
      context.logger.error(`CLI command ${commandName} failed:`, error)
      return {
        success: false,
        message: `Error executing ${commandName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  /**
   * Generate help text for all commands
   */
  getHelpText(forCLI = false): string {
    const relevantCommands = this.commands.filter((cmd) =>
      forCLI ? cmd.cliHandler : cmd.botHandler || ('handler' in cmd && cmd.handler),
    )

    const commandHelp = relevantCommands
      .filter((cmd) => cmd.usage)
      .map((cmd) => {
        const aliases =
          forCLI && cmd.cliAliases?.length ? ` (aliases: ${cmd.cliAliases.join(', ')})` : ''
        return `  • ${cmd.usage}${aliases} - ${cmd.description}`
      })
      .join('\n')

    return `Available commands:\n${commandHelp}`
  }
}
