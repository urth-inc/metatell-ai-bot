import type { UnifiedCommand } from './BotCommand.js'
import type { PresenceUser, UserAvatar } from '@metatell/sdk'

/**
 * Unified command definitions for both Bot mentions and CLI
 */
export const unifiedCommands: UnifiedCommand[] = [
  // Help command
  {
    name: 'help',
    pattern: /^help$/i,
    cliAliases: ['help', 'h', '?'],
    description: 'Show available commands',
    usage: 'help',
    botHandler: async (_match, _sessionId, context) => {
      const registry = await import('./BotCommand.js').then(m => new m.CommandRegistry())
      registry.registerAll(unifiedCommands)
      return registry.getHelpText(false)
    },
    cliHandler: async (_args, context) => {
      const registry = await import('./BotCommand.js').then(m => new m.CommandRegistry())
      registry.registerAll(unifiedCommands)
      return { 
        success: true, 
        message: registry.getHelpText(true)
      }
    },
  },

  // Hello/greeting command
  {
    name: 'hello',
    pattern: /^(hello|hi|hey|greetings?)\b/i,
    cliAliases: ['hello', 'hi', 'greet'],
    description: 'Greet the bot',
    usage: 'hello',
    botHandler: async (_match, sessionId, context) => {
      const user = context.presenceManager.getUser(sessionId)
      const name = user?.profile?.displayName || 'friend'
      return `Hello ${name}! 👋 How can I help you today?`
    },
    cliHandler: async (_args, _context) => {
      return { 
        success: true, 
        message: 'Hello! 👋 Bot is ready to help.'
      }
    },
  },

  // Time command
  {
    name: 'time',
    pattern: /^(time|date|now)$/i,
    cliAliases: ['time', 'date', 'now'],
    description: 'Show current time',
    usage: 'time',
    botHandler: async () => {
      const now = new Date()
      return `Current time: ${now.toLocaleString()}`
    },
    cliHandler: async () => {
      const now = new Date()
      return { 
        success: true, 
        message: `Current time: ${now.toLocaleString()}`
      }
    },
  },

  // Move command
  {
    name: 'move',
    pattern: /^move\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i,
    cliAliases: ['move', 'mv', 'goto'],
    description: 'Move avatar to position',
    usage: 'move <x> <y> <z>',
    botHandler: async (match, _sessionId, context) => {
      const x = parseFloat(match[1])
      const y = parseFloat(match[2])
      const z = parseFloat(match[3])
      
      if (isNaN(x) || isNaN(y) || isNaN(z)) {
        return 'Invalid coordinates. Usage: move <x> <y> <z>'
      }
      
      try {
        await context.avatarController.move({ x, y, z })
        return `Moving to position (${x}, ${y}, ${z}) 🚶`
      } catch (error) {
        context.logger.error('Move command failed:', error)
        return 'Failed to move avatar'
      }
    },
    cliHandler: async (args, context) => {
      if (args.length !== 3) {
        return { 
          success: false, 
          message: 'Usage: /move <x> <y> <z>' 
        }
      }
      
      const x = parseFloat(args[0])
      const y = parseFloat(args[1])
      const z = parseFloat(args[2])
      
      if (isNaN(x) || isNaN(y) || isNaN(z)) {
        return { 
          success: false, 
          message: 'Invalid coordinates. All values must be numbers.' 
        }
      }
      
      try {
        await context.avatarController.move({ x, y, z })
        return { 
          success: true, 
          message: `Moved to (${x}, ${y}, ${z})` 
        }
      } catch (error) {
        return { 
          success: false, 
          message: `Failed to move: ${error instanceof Error ? error.message : 'Unknown error'}` 
        }
      }
    },
  },

  // Info command
  {
    name: 'info',
    pattern: /^info$/i,
    cliAliases: ['info', 'status', 'stats'],
    description: 'Show room information',
    usage: 'info',
    botHandler: async (_match, _sessionId, context) => {
      const users = context.presenceManager.getUsers()
      const userCount = users.length
      
      const userNames = users
        .map((p: PresenceUser) => p.profile?.displayName || 'Unknown')
        .filter((name: string) => name !== 'Unknown')
        .join(', ')
      
      return `📊 Room Info:\n` +
             `• Users online: ${userCount}\n` +
             `• Connected users: ${userNames || 'None'}`
    },
    cliHandler: async (_args, context) => {
      const users = context.presenceManager.getUsers()
      const userCount = users.length
      
      return { 
        success: true, 
        message: `Room has ${userCount} user(s) connected` 
      }
    },
  },

  // Users command
  {
    name: 'users',
    pattern: /^users?$/i,
    cliAliases: ['users', 'list', 'who'],
    description: 'List all users in the room',
    usage: 'users',
    botHandler: async (_match, _sessionId, context) => {
      const users = context.userAvatarManager.getUsers()
      
      if (users.length === 0) {
        return 'No users in the room'
      }
      
      const userList = users
        .map((user: UserAvatar) => {
          const pos = user.position
          return `• ${user.nickname} at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`
        })
        .join('\n')
      
      return `Users in room:\n${userList}`
    },
    cliHandler: async (_args, context) => {
      const users = context.userAvatarManager.getUsers()
      
      if (users.length === 0) {
        return { 
          success: true, 
          message: 'No users in the room' 
        }
      }
      
      return { 
        success: true, 
        message: `${users.length} user(s) in room:\n${users.map((u: UserAvatar) => `• ${u.nickname}`).join('\n')}` 
      }
    },
  },

  // Nearby command
  {
    name: 'nearby',
    pattern: /^nearby(?:\s+(\d+(?:\.\d+)?))?$/i,
    cliAliases: ['nearby', 'near', 'around'],
    description: 'List users within radius',
    usage: 'nearby [radius]',
    botHandler: async (match, _sessionId, context) => {
      const radius = match[1] ? parseFloat(match[1]) : 10
      
      const avatarState = context.avatarController.getState()
      if (!avatarState) {
        return 'Bot avatar not spawned'
      }
      
      const nearbyUsers = context.userAvatarManager.getUsersInRange(
        avatarState.position,
        radius
      )
      
      if (nearbyUsers.length === 0) {
        return `No users within ${radius} units`
      }
      
      const userList = nearbyUsers
        .map((user: UserAvatar) => {
          const distance = Math.sqrt(
            Math.pow(user.position.x - avatarState.position.x, 2) +
            Math.pow(user.position.y - avatarState.position.y, 2) +
            Math.pow(user.position.z - avatarState.position.z, 2)
          )
          return `• ${user.nickname} (${distance.toFixed(1)} units away)`
        })
        .join('\n')
      
      return `Users within ${radius} units:\n${userList}`
    },
    cliHandler: async (args, context) => {
      const radius = args[0] ? parseFloat(args[0]) : 10
      
      if (isNaN(radius)) {
        return { 
          success: false, 
          message: 'Invalid radius. Must be a number.' 
        }
      }
      
      const avatarState = context.avatarController.getState()
      if (!avatarState) {
        return { 
          success: false, 
          message: 'Bot avatar not spawned' 
        }
      }
      
      const nearbyUsers = context.userAvatarManager.getUsersInRange(
        avatarState.position,
        radius
      )
      
      return { 
        success: true, 
        message: nearbyUsers.length > 0
          ? `${nearbyUsers.length} user(s) within ${radius} units:\n${nearbyUsers.map((u: UserAvatar) => `• ${u.nickname}`).join('\n')}`
          : `No users within ${radius} units` 
      }
    },
  },

  // Say command (CLI only)
  {
    name: 'say',
    cliAliases: ['say', 'msg', 'send'],
    description: 'Send a message to the room',
    usage: 'say <message>',
    cliHandler: async (args, context) => {
      if (args.length === 0) {
        return { 
          success: false, 
          message: 'Usage: /say <message>' 
        }
      }
      
      const message = args.join(' ')
      try {
        await context.messageService.sendMessage(message)
        return { 
          success: true, 
          message: 'Message sent' 
        }
      } catch (error) {
        return { 
          success: false, 
          message: `Failed to send: ${error instanceof Error ? error.message : 'Unknown error'}` 
        }
      }
    },
  },

  // Exit command (CLI only) 
  {
    name: 'exit',
    cliAliases: ['exit', 'quit', 'bye'],
    description: 'Exit the bot',
    usage: 'exit',
    cliHandler: async () => {
      // The actual exit handling is done by the CLI interface
      return { 
        success: true, 
        message: 'Goodbye! 👋' 
      }
    },
  },
]