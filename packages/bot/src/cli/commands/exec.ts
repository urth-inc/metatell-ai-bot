/**
 * Command execution engine using unified commands
 */

import type { AgentClient } from '@metatell/sdk'
import { getLogger } from '@metatell/sdk'
import type { CommandPlan } from './plan.js'
import { CommandRegistry, type CommandContext } from '../../bots/commands/BotCommand.js'
import { unifiedCommands } from '../../bots/commands/unifiedCommands.js'

export interface CommandResult {
  success: boolean
  message?: string
  data?: unknown
  showModal?: boolean
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
    const factory = (this.client as any).factory
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
      // Handle special cases that don't map to unified commands
      switch (plan.kind) {
        case 'quit':
          return { success: true, message: 'Goodbye!' }
        
        case 'error':
          return { success: false, message: plan.message }
        
        case 'logs':
          return this.executeLogs(plan)
      }

      // Map plan.kind to command name
      const commandName = this.mapPlanKindToCommandName(plan.kind)
      
      // Extract arguments from plan
      const args = this.extractArgumentsFromPlan(plan)
      
      // Execute using unified command registry
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

  private mapPlanKindToCommandName(kind: string): string {
    // Map plan kinds to unified command names
    const mapping: Record<string, string> = {
      status: 'info',
      say: 'say',
      move: 'move', 
      look: 'nearby',
      nearby: 'nearby',
      users: 'users',
      help: 'help',
    }
    return mapping[kind] || kind
  }

  private extractArgumentsFromPlan(plan: CommandPlan): string[] {
    switch (plan.kind) {
      case 'say':
        return [(plan as any).message || '']
      
      case 'move':
        const movePlan = plan as any
        return [
          movePlan.position?.x?.toString() || '0',
          movePlan.position?.y?.toString() || '0', 
          movePlan.position?.z?.toString() || '0'
        ]
      
      case 'look':
      case 'nearby':
        const nearbyPlan = plan as any
        return nearbyPlan.radius ? [nearbyPlan.radius.toString()] : []
      
      default:
        return []
    }
  }

  private async executeLogs(plan: CommandPlan): Promise<CommandResult> {
    // Logs command is CLI-specific and not in unified commands
    return {
      success: true,
      message: 'Logs functionality not yet implemented',
    }
  }

  /**
   * Get available commands for help display
   */
  getAvailableCommands(): string[] {
    return this.commandRegistry.getAll()
      .filter(cmd => cmd.cliHandler)
      .map(cmd => {
        const aliases = cmd.cliAliases?.length 
          ? ` (${cmd.cliAliases.join(', ')})` 
          : ''
        return `/${cmd.name}${aliases} - ${cmd.description}`
      })
  }
}