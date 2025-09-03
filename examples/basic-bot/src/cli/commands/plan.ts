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
  | { kind: 'voice'; action: 'on' | 'off' | 'status' }
  | { kind: 'mute' }
  | { kind: 'testvoice'; duration?: number }
  | { kind: 'anime'; animationName: string }
  | { kind: 'stop' }

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
    usage: '/look <x> <y> <z> | /look @<username> | /look nearest',
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
    command: '/anime',
    description: 'Play VRM avatar animation',
    usage: '/anime <animation_name>',
    aliases: ['/animation', '/react', '/anim'],
  },
  {
    command: '/stop',
    description: 'Stop current animation',
    usage: '/stop',
    aliases: ['/idle'],
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

  // Resolve aliases
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

      case '/voice':
        return parseVoice(parts.slice(1))

      case '/mute':
        return { kind: 'mute' }

      case '/testvoice':
        return parseTestVoice(parts.slice(1))

      case '/anime':
        return parseAnime(parts.slice(1))

      case '/stop':
        return { kind: 'stop' }

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

  if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
    throw new ParseError('Invalid coordinates', '/move <x> <y> <z>')
  }

  return { kind: 'move', x, y, z }
}

function parseLook(args: string[]): CommandPlan {
  if (args.length === 0) {
    throw new ParseError(
      'Missing arguments',
      '/look <x> <y> <z> | /look @<username> | /look nearest',
    )
  }

  // @username format
  if (args[0].startsWith('@') && args[0].length > 1) {
    return { kind: 'look', target: { type: 'user', id: args[0].substring(1) } }
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

    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
      throw new ParseError('Invalid coordinates', '/look <x> <y> <z>')
    }

    return { kind: 'look', target: { type: 'position', x, y, z } }
  }

  throw new ParseError('Invalid arguments', '/look <x> <y> <z> | /look @<username> | /look nearest')
}

function parseNearby(args: string[]): CommandPlan {
  const radius = args[0] ? parseFloat(args[0]) : undefined
  if (radius !== undefined && Number.isNaN(radius)) {
    throw new ParseError('Invalid radius', '/nearby [radius]')
  }
  return { kind: 'nearby', radius }
}

function parseUsers(args: string[]): CommandPlan {
  const flags = parseFlags(args)
  const nearby = flags['--nearby'] ? parseFloat(flags['--nearby'] as string) : undefined

  if (nearby !== undefined && Number.isNaN(nearby)) {
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
    throw new ParseError(`Missing argument for ${subcommand}`, '/logs tail|filter <regex>|clear')
  }

  return {
    kind: 'logs',
    subcommand: subcommand as 'tail' | 'filter' | 'clear',
    arg: args[1],
  }
}

function parseVoice(args: string[]): CommandPlan {
  if (args.length === 0) {
    throw new ParseError('Missing action', '/voice on|off|status')
  }

  const action = args[0].toLowerCase()
  if (!['on', 'off', 'status'].includes(action)) {
    throw new ParseError('Invalid action', '/voice on|off|status')
  }

  return {
    kind: 'voice',
    action: action as 'on' | 'off' | 'status',
  }
}

function parseTestVoice(args: string[]): CommandPlan {
  if (args.length === 0) {
    return { kind: 'testvoice' }
  }

  const duration = parseInt(args[0], 10)
  if (Number.isNaN(duration) || duration < 100 || duration > 5000) {
    throw new ParseError('Duration must be between 100 and 5000', '/testvoice [duration_ms]')
  }

  return {
    kind: 'testvoice',
    duration,
  }
}

function parseAnime(args: string[]): CommandPlan {
  if (args.length === 0) {
    throw new ParseError('Missing animation name', '/anime <animation_name>')
  }

  const animationName = args[0].toLowerCase()

  return {
    kind: 'anime',
    animationName,
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
