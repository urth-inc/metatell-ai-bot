/**
 * Command execution engine using unified commands
 */

import type { AgentClient, CoreServiceFactory } from '@metatell/sdk'
import { getLogger } from '@metatell/sdk'
import { type CommandContext, CommandRegistry } from '../../bots/commands/BotCommand.js'
import { unifiedCommands } from '../../bots/commands/unifiedCommands.js'
import type { CommandPlan } from './plan.js'

export interface CommandResult {
  success: boolean
  message?: string
  data?: unknown
  showModal?: boolean
}

interface ClientWithFactory extends AgentClient {
  factory: CoreServiceFactory
}

export class CommandExecutor {
  private logger = getLogger('CommandExecutor')
  private commandRegistry: CommandRegistry
  private context: CommandContext

  constructor(private client: AgentClient) {
    // Initialize command registry with unified commands
    this.commandRegistry = new CommandRegistry()
    this.commandRegistry.registerAll(unifiedCommands)

    // Create command context from client services
    const factory = (this.client as ClientWithFactory).factory
    this.context = {
      avatarController: factory.getService('IAvatarController'),
      userAvatarManager: factory.getService('IUserAvatarManager'),
      presenceManager: factory.getService('IPresenceManager'),
      messageService: factory.getService('IMessageService'),
      logger: this.logger,
    }
  }

  async execute(plan: CommandPlan): Promise<CommandResult> {
    this.logger.debug('Executing command', { plan })

    try {
      // Handle special cases
      if (plan.kind === 'error') {
        return { success: false, message: plan.message }
      }

      if (plan.kind === 'quit') {
        return { success: true, message: 'Goodbye! 👋' }
      }

      // Convert plan to command name and args
      const { commandName, args } = this.planToCommandArgs(plan)

      // Delegate all execution to CommandRegistry
      const result = await this.commandRegistry.executeCLI(commandName, args, this.context)

      // Special handling for help command to show in modal
      if (plan.kind === 'help') {
        return {
          ...result,
          showModal: true,
        }
      }

      return result
    } catch (error) {
      this.logger.error('Command execution failed', { error })
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Command failed',
      }
    }
  }

  private planToCommandArgs(plan: CommandPlan): { commandName: string; args: string[] } {
    // Map plan kinds to command names
    const commandMapping: Record<string, string> = {
      status: 'info',
      say: 'say',
      move: 'move',
      look: 'nearby',
      nearby: 'nearby',
      users: 'users',
      help: 'help',
      logs: 'logs',
    }

    const commandName = commandMapping[plan.kind] || plan.kind

    // Extract arguments based on plan type
    let args: string[] = []

    switch (plan.kind) {
      case 'say':
        if (plan.kind === 'say') {
          args = [plan.message || '']
        }
        break

      case 'move': {
        if (plan.kind === 'move') {
          args = [plan.x?.toString() || '0', plan.y?.toString() || '0', plan.z?.toString() || '0']
        }
        break
      }

      case 'look':
      case 'nearby': {
        if (plan.kind === 'nearby') {
          args = plan.radius ? [plan.radius.toString()] : []
        }
        break
      }

      default:
        args = []
    }

    return { commandName, args }
  }

  /**
   * Get available commands for help display
   */
  getAvailableCommands(): string[] {
    return this.commandRegistry
      .getAll()
      .filter((cmd) => cmd.cliHandler)
      .map((cmd) => {
        const aliases = cmd.cliAliases?.length ? ` (${cmd.cliAliases.join(', ')})` : ''
        return `/${cmd.name}${aliases} - ${cmd.description}`
      })
  }
}
