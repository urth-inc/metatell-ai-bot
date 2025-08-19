/**
 * Command planning - parse user input into executable command plans
 */

export type CommandPlan =
  | { kind: 'status' }
  | { kind: 'say'; message: string }
  | { kind: 'move'; x: number; y: number; z: number }
  | {
      kind: 'look'
      target:
        | { type: 'position'; x: number; y: number; z: number }
        | { type: 'user'; id: string }
        | { type: 'nearest' }
    }
  | { kind: 'nearby'; radius?: number }
  | { kind: 'users'; nearby?: number }
  | { kind: 'logs'; subcommand: 'tail' | 'filter' | 'clear'; arg?: string }
  | { kind: 'help' }
  | { kind: 'quit' }
  | { kind: 'error'; message: string; usage?: string }

export interface CommandDefinition {
  command: string
  description: string
  usage: string
  aliases?: string[]
}

export const COMMANDS: CommandDefinition[] = [
  {
    command: '/status',
    description: 'Show connection status',
    usage: '/status',
  },
  {
    command: '/say',
    description: 'Send a message',
    usage: '/say <message>',
  },
  {
    command: '/move',
    description: 'Move avatar to position',
    usage: '/move <x> <y> <z>',
  },
  {
    command: '/look',
    description: 'Look at position or user',
    usage: '/look <x> <y> <z> | /look user <id> | /look nearest',
  },
  {
    command: '/nearby',
    description: 'Show users within radius',
    usage: '/nearby [radius]',
  },
  {
    command: '/users',
    description: 'List users',
    usage: '/users [--nearby <n>]',
  },
  {
    command: '/logs',
    description: 'Manage logs',
    usage: '/logs tail|filter <regex>|clear',
  },
  {
    command: '/help',
    description: 'Show help',
    usage: '/help',
    aliases: ['/?'],
  },
  {
    command: '/quit',
    description: 'Exit the program',
    usage: '/quit',
    aliases: ['/exit', '/q'],
  },
]

/**
 * Parse command line into a command plan
 */
export function parseCommand(input: string): CommandPlan {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) {
    return {
      kind: 'error',
      message: 'Commands must start with /',
      usage: 'Type /help for commands',
    }
  }

  const parts = trimmed.split(/\s+/)
  const command = parts[0].toLowerCase()

  // エイリアスの解決
  const resolvedCommand = resolveAlias(command)

  try {
    switch (resolvedCommand) {
      case '/status':
        return { kind: 'status' }

      case '/say':
        return parseSay(parts.slice(1))

      case '/move':
        return parseMove(parts.slice(1))

      case '/look':
        return parseLook(parts.slice(1))

      case '/nearby':
        return parseNearby(parts.slice(1))

      case '/users':
        return parseUsers(parts.slice(1))

      case '/logs':
        return parseLogs(parts.slice(1))

      case '/help':
        return { kind: 'help' }

      case '/quit':
        return { kind: 'quit' }

      default:
        return {
          kind: 'error',
          message: `Unknown command: ${command}`,
          usage: 'Type /help for commands',
        }
    }
  } catch (error) {
    if (error instanceof ParseError) {
      return { kind: 'error', message: error.message, usage: error.usage }
    }
    return { kind: 'error', message: `Parse error: ${error}` }
  }
}

class ParseError extends Error {
  constructor(
    message: string,
    public usage?: string,
  ) {
    super(message)
  }
}

function resolveAlias(command: string): string {
  for (const cmd of COMMANDS) {
    if (cmd.command === command || cmd.aliases?.includes(command)) {
      return cmd.command
    }
  }
  return command
}



function parseSay(args: string[]): CommandPlan {
  if (args.length === 0) {
    throw new ParseError('Missing message', '/say <message>')
  }
  return {
    kind: 'say',
    message: args.join(' '),
  }
}

function parseMove(args: string[]): CommandPlan {
  if (args.length !== 3) {
    throw new ParseError('Invalid arguments', '/move <x> <y> <z>')
  }

  const x = parseFloat(args[0])
  const y = parseFloat(args[1])
  const z = parseFloat(args[2])

  if (isNaN(x) || isNaN(y) || isNaN(z)) {
    throw new ParseError('Invalid coordinates', '/move <x> <y> <z>')
  }

  return { kind: 'move', x, y, z }
}

function parseLook(args: string[]): CommandPlan {
  if (args.length === 0) {
    throw new ParseError('Missing arguments', '/look <x> <y> <z> | /look user <id> | /look nearest')
  }

  if (args[0] === 'user' && args[1]) {
    return { kind: 'look', target: { type: 'user', id: args[1] } }
  }

  if (args[0] === 'nearest') {
    return { kind: 'look', target: { type: 'nearest' } }
  }

  if (args.length === 3) {
    const x = parseFloat(args[0])
    const y = parseFloat(args[1])
    const z = parseFloat(args[2])

    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      throw new ParseError('Invalid coordinates', '/look <x> <y> <z>')
    }

    return { kind: 'look', target: { type: 'position', x, y, z } }
  }

  throw new ParseError('Invalid arguments', '/look <x> <y> <z> | /look user <id> | /look nearest')
}

function parseNearby(args: string[]): CommandPlan {
  const radius = args[0] ? parseFloat(args[0]) : undefined
  if (radius !== undefined && isNaN(radius)) {
    throw new ParseError('Invalid radius', '/nearby [radius]')
  }
  return { kind: 'nearby', radius }
}

function parseUsers(args: string[]): CommandPlan {
  const flags = parseFlags(args)
  const nearby = flags['--nearby'] ? parseFloat(flags['--nearby'] as string) : undefined

  if (nearby !== undefined && isNaN(nearby)) {
    throw new ParseError('Invalid --nearby value', '/users [--nearby <n>]')
  }

  return {
    kind: 'users',
    nearby,
  }
}

function parseLogs(args: string[]): CommandPlan {
  const subcommand = args[0]
  if (!['tail', 'filter', 'clear'].includes(subcommand)) {
    throw new ParseError('Invalid subcommand', '/logs tail|filter <regex>|clear')
  }

  if (subcommand === 'filter' && !args[1]) {
    throw new ParseError(
      `Missing argument for ${subcommand}`,
      '/logs tail|filter <regex>|clear',
    )
  }

  return {
    kind: 'logs',
    subcommand: subcommand as 'tail' | 'filter' | 'clear',
    arg: args[1],
  }
}


function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {}
  let i = 0

  while (i < args.length) {
    if (args[i].startsWith('--')) {
      const flag = args[i]
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        flags[flag] = args[i + 1]
        i += 2
      } else {
        flags[flag] = true
        i++
      }
    } else {
      i++
    }
  }

  return flags
}
