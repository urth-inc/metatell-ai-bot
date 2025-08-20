/**
 * Command execution engine
 */

import type { AgentClient } from '@metatell/sdk'
import { getLogger } from '@metatell/sdk'
import type { CommandPlan } from './plan.js'
import { COMMANDS } from './plan.js'

export interface CommandResult {
  success: boolean
  message?: string
  data?: unknown
  showModal?: boolean
}

export class CommandExecutor {
  private logger = getLogger('CommandExecutor')

  constructor(private client: AgentClient) {}

  async execute(plan: CommandPlan): Promise<CommandResult> {
    this.logger.debug('Executing command', { plan })

    try {
      switch (plan.kind) {
        case 'status':
          return this.executeStatus()

        case 'say':
          return this.executeSay(plan)

        case 'move':
          return this.executeMove(plan)

        case 'look':
          return this.executeLook(plan)

        case 'nearby':
          return this.executeNearby(plan)

        case 'users':
          return this.executeUsers(plan)

        case 'logs':
          return this.executeLogs(plan)

        case 'help':
          return this.executeHelp()

        case 'quit':
          return { success: true, message: 'Goodbye!' }

        case 'error':
          return { success: false, message: plan.message }

        default:
          return { success: false, message: 'Unknown command' }
      }
    } catch (error) {
      this.logger.error('Command execution failed', { error })
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Command failed',
      }
    }
  }


  private async executeStatus(): Promise<CommandResult> {
    const status = this.client.getStatus()

    const lines = [
      `Connection: ${status.connected ? 'Connected' : status.connecting ? 'Connecting' : 'Disconnected'}`,
    ]
    if (status.room) lines.push(`Room: ${status.room}`)
    if (status.sessionId) lines.push(`Session: ${status.sessionId}`)
    if (status.rtt !== undefined) lines.push(`RTT: ${status.rtt}ms`)
    lines.push(`Retries: ${status.retries}`)

    return { success: true, message: lines.join('\n') }
  }

  private async executeSay(plan: Extract<CommandPlan, { kind: 'say' }>): Promise<CommandResult> {
    await this.client.send(plan.message)
    return { success: true, message: `Sent: ${plan.message}` }
  }

  private async executeMove(plan: Extract<CommandPlan, { kind: 'move' }>): Promise<CommandResult> {
    await this.client.move({ x: plan.x, y: plan.y, z: plan.z })
    return { success: true, message: `Moving to (${plan.x}, ${plan.y}, ${plan.z})` }
  }

  private async executeLook(plan: Extract<CommandPlan, { kind: 'look' }>): Promise<CommandResult> {
    switch (plan.target.type) {
      case 'position':
        await this.client.look({ x: plan.target.x, y: plan.target.y, z: plan.target.z })
        return {
          success: true,
          message: `Looking at (${plan.target.x}, ${plan.target.y}, ${plan.target.z})`,
        }

      case 'user':
        await this.client.look({ userId: plan.target.id })
        return { success: true, message: `Looking at user: ${plan.target.id}` }

      case 'nearest':
        await this.client.lookAtNearest()
        return { success: true, message: 'Looking at nearest user' }
    }
  }

  private async executeNearby(
    plan: Extract<CommandPlan, { kind: 'nearby' }>,
  ): Promise<CommandResult> {
    const radius = plan.radius || 10
    const users = this.client.getUsersNearby(radius)

    if (users.length === 0) {
      return { success: true, message: `No users within ${radius} units` }
    }

    const lines = [`Users within ${radius} units (${users.length}):`]
    users.forEach((user: any) => {
      const distance = Math.sqrt(user.position.x ** 2 + user.position.y ** 2 + user.position.z ** 2)
      lines.push(`  ${user.nickname} - ${distance.toFixed(1)} units away`)
    })

    return { success: true, message: lines.join('\n') }
  }

  private async executeUsers(
    plan: Extract<CommandPlan, { kind: 'users' }>,
  ): Promise<CommandResult> {
    let users = this.client.getUsers()

    if (plan.nearby !== undefined) {
      users = this.client.getUsersNearby(plan.nearby)
    }

    if (users.length === 0) {
      return { success: true, message: 'No users in room' }
    }

    const lines = [`Users in room (${users.length}):`]
    users.forEach((user: any) => {
      lines.push(`  ${user.nickname} (${user.id})`)
      const pos = user.position
      lines.push(
        `    Position: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`,
      )
      if (user.avatarId) {
        lines.push(`    Avatar: ${user.avatarId}`)
      }
    })

    return { success: true, message: lines.join('\n') }
  }

  private async executeLogs(_plan: Extract<CommandPlan, { kind: 'logs' }>): Promise<CommandResult> {
    // ログ管理はCLI側で処理
    return { success: true }
  }

  private async executeHelp(): Promise<CommandResult> {
    const lines = ['Available Commands:', '']

    COMMANDS.forEach((cmd) => {
      lines.push(`  ${cmd.command.padEnd(12)} - ${cmd.description}`)
      if (cmd.usage !== cmd.command) {
        lines.push(`    Usage: ${cmd.usage}`)
      }
      if (cmd.aliases && cmd.aliases.length > 0) {
        lines.push(`    Aliases: ${cmd.aliases.join(', ')}`)
      }
    })

    lines.push('')
    lines.push('Navigation:')
    lines.push('  ↑/↓        - Command history')
    lines.push('  Tab        - Complete command')
    lines.push('  Ctrl+R     - Search history')
    lines.push('  Esc        - Clear filter')
    lines.push('  Ctrl+C×2   - Exit')

    return { success: true, message: lines.join('\n'), showModal: true }
  }
}
