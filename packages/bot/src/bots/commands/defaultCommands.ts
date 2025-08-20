import type { BotCommand } from './BotCommand.js'
import type { UserAvatar, PresenceUser } from '@metatell/sdk'

/**
 * Default bot commands
 */
export const defaultCommands: BotCommand[] = [
  {
    name: 'help',
    pattern: /^help$/i,
    description: 'Show available commands',
    usage: 'help',
    handler: async (_match, _sessionId, _context) => {
      const commands = [
        '  • help - Show this help message',
        '  • info - Show room information',
        '  • time - Show current time',
        '  • users - List all users with positions',
        '  • nearby <radius> - Show users within radius',
        '  • move <x> <y> <z> - Move bot to position',
      ].join('\n')
      
      return `Available commands:\n${commands}`
    }
  },
  
  {
    name: 'info',
    pattern: /^info$/i,
    description: 'Show room information',
    usage: 'info',
    handler: async (_match, _sessionId, context) => {
      const users = context.presenceManager.getUsers()
      const userList = users
        .map((u: PresenceUser) => u.profile?.displayName || 'Unknown')
        .join(', ')
      
      return `Room Information:\n• Hub: Connected\n• Users online: ${users.length}\n• User list: ${userList}`
    }
  },
  
  {
    name: 'time',
    pattern: /^time$/i,
    description: 'Show current time',
    usage: 'time',
    handler: async () => {
      const now = new Date()
      return `Current time: ${now.toLocaleString()}`
    }
  },
  
  {
    name: 'hello',
    pattern: /^(hello|hi|hey)/i,
    description: 'Greet the bot',
    handler: async (_match, sessionId, context) => {
      const user = context.presenceManager.getUser?.(sessionId)
      const userName = user?.profile?.displayName || 'there'
      const botName = context.avatarController.getState()?.displayName || 'Bot'
      
      return `Hello ${userName}! I'm ${botName}, your friendly room assistant. Type 'help' to see what I can do!`
    }
  },
  
  {
    name: 'move',
    pattern: /^move\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/i,
    description: 'Move bot to specified position',
    usage: 'move <x> <y> <z>',
    handler: async (match, _sessionId, context) => {
      const x = parseFloat(match[1])
      const y = parseFloat(match[2])
      const z = parseFloat(match[3])
      
      if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
        return 'Invalid coordinates. Please use numbers for x, y, and z.'
      }
      
      await context.avatarController.move({ x, y, z })
      return `Moving to position (${x}, ${y}, ${z})`
    }
  },
  
  {
    name: 'users',
    pattern: /^users$/i,
    description: 'List all users with their positions',
    usage: 'users',
    handler: async (_match, _sessionId, context) => {
      const users = context.userAvatarManager.getUsers()
      
      if (users.length === 0) {
        return 'No users currently in the room'
      }
      
      const userList = users
        .map((u: UserAvatar) => {
          const pos = u.position
          const shortId = u.id.substring(0, 8)
          const x = pos.x.toFixed(1)
          const y = pos.y.toFixed(1)
          const z = pos.z.toFixed(1)
          return `• ${u.nickname} (${shortId}...) at (${x}, ${y}, ${z})`
        })
        .join('\n')
      
      return `👥 Users in room (${users.length}):\n${userList}`
    }
  },
  
  {
    name: 'nearby',
    pattern: /^nearby\s+(\d+(?:\.\d+)?)$/i,
    description: 'Show users within specified radius',
    usage: 'nearby <radius>',
    handler: async (match, _sessionId, context) => {
      const radius = parseFloat(match[1])
      
      if (Number.isNaN(radius) || radius <= 0) {
        return 'Please specify a valid positive radius'
      }
      
      const myState = context.avatarController.getState()
      if (!myState) {
        return 'Bot avatar not spawned yet'
      }
      
      const nearbyUsers = context.userAvatarManager.getUsersInRange(
        myState.position,
        radius
      )
      
      if (nearbyUsers.length === 0) {
        return `No users within ${radius} units`
      }
      
      const userList = nearbyUsers
        .map((u: UserAvatar) => {
          const pos = u.position
          const dx = pos.x - myState.position.x
          const dy = pos.y - myState.position.y
          const dz = pos.z - myState.position.z
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
          return `• ${u.nickname} - ${distance.toFixed(1)} units away`
        })
        .join('\n')
      
      return `📍 Users within ${radius} units (${nearbyUsers.length}):\n${userList}`
    }
  },
]