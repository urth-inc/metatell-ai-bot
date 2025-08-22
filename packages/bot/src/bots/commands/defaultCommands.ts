import type { BotCommand } from './BotCommand.js'
import { unifiedCommands } from './unifiedCommands.js'

/**
 * Convert unified commands to legacy BotCommand format for backward compatibility
 */
export const defaultCommands: BotCommand[] = unifiedCommands
  .filter(cmd => cmd.pattern && (cmd.botHandler || (cmd as any).handler))
  .map(cmd => ({
    name: cmd.name,
    pattern: cmd.pattern!,
    description: cmd.description,
    usage: cmd.usage,
    handler: cmd.botHandler || (cmd as any).handler,
    // Include other properties for potential future use
    botHandler: cmd.botHandler,
    cliHandler: cmd.cliHandler,
    cliAliases: cmd.cliAliases,
  } as BotCommand))