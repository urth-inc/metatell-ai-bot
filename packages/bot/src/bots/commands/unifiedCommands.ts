import type { UserAvatar } from '@metatell/sdk'
import type { UnifiedCommand } from './BotCommand.js'

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
    botHandler: async (_match, _sessionId, _context) => {
      const registry = await import('./BotCommand.js').then((m) => new m.CommandRegistry())
      registry.registerAll(unifiedCommands)
      return registry.getHelpText(false)
    },
    cliHandler: async (_args, _context) => {
      const registry = await import('./BotCommand.js').then((m) => new m.CommandRegistry())
      registry.registerAll(unifiedCommands)
      return {
        success: true,
        message: registry.getHelpText(true),
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
        message: 'Hello! 👋 Bot is ready to help.',
      }
    },
  },

  // Info command - Show current connection information
  {
    name: 'info',
    pattern: /^info$/i,
    cliAliases: ['info', 'i'],
    description: 'Show current connection information',
    usage: 'info',
    botHandler: async (_match, _sessionId, context) => {
      // Bot側では基本的な情報のみ表示
      const avatarController = context.avatarController
      const presenceManager = context.presenceManager
      const userCount = presenceManager.getUsers().length

      const avatarState = avatarController.getState()

      return `🤖 Bot Information:
• Display Name: ${avatarState?.displayName || 'Unknown'}
• Avatar ID: ${avatarState?.avatarId || 'Unknown'}
• Users in room: ${userCount}`
    },
    cliHandler: async (_args, context) => {
      // CLI側ではより詳細な情報を表示（AgentClientがアクセス可能）
      const agentClient = context.agentClient
      if (!agentClient) {
        return {
          success: false,
          message: 'AgentClient not available in context',
        }
      }

      const status = agentClient.getStatus()
      const config = context.botConfig

      // 組織情報を取得
      let organizationInfo: { organizationId?: string; realmId?: string } = {}
      try {
        const organizationService = context.organizationService
        if (organizationService && config?.hubId) {
          organizationInfo = await organizationService.getOrganizationInfo(
            config.hubUrl,
            config.hubId,
          )
        }
      } catch (_error) {
        // 組織情報の取得に失敗しても続行
      }

      const info = [
        '🤖 Connection Information:',
        `• Room URL: ${config?.hubUrl || 'Unknown'}`,
        `• Hub ID: ${config?.hubId || status.room || 'Unknown'}`,
        `• Organization ID: ${organizationInfo.organizationId || 'Unknown'}`,
        `• Session ID: ${status.sessionId || 'Unknown'}`,
        '',
        '👤 Bot Profile:',
        `• Display Name: ${config?.profile?.displayName || 'Unknown'}`,
        `• Avatar ID: ${config?.profile?.avatarId || 'Unknown'}`,
        '',
        '🌐 Connection Status:',
        `• Connected: ${status.connected ? '✅ Yes' : '❌ No'}`,
        `• Users in room: ${agentClient.getUsers().length}`,
      ]

      if (status.rtt !== undefined) {
        info.push(`• RTT: ${status.rtt}ms`)
      }

      return {
        success: true,
        message: info.join('\n'),
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
        message: `Current time: ${now.toLocaleString()}`,
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

      if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
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
          message: 'Usage: /move <x> <y> <z>',
        }
      }

      const x = parseFloat(args[0])
      const y = parseFloat(args[1])
      const z = parseFloat(args[2])

      if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
        return {
          success: false,
          message: 'Invalid coordinates. All values must be numbers.',
        }
      }

      try {
        await context.avatarController.move({ x, y, z })
        return {
          success: true,
          message: `Moved to (${x}, ${y}, ${z})`,
        }
      } catch (error) {
        return {
          success: false,
          message: `Failed to move: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }
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
          message: 'No users in the room',
        }
      }

      return {
        success: true,
        message: `${users.length} user(s) in room:\n${users.map((u: UserAvatar) => `• ${u.nickname}`).join('\n')}`,
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

      const nearbyUsers = context.userAvatarManager.getUsersInRange(avatarState.position, radius)

      if (nearbyUsers.length === 0) {
        return `No users within ${radius} units`
      }

      const userList = nearbyUsers
        .map((user: UserAvatar) => {
          const distance = Math.sqrt(
            (user.position.x - avatarState.position.x) ** 2 +
              (user.position.y - avatarState.position.y) ** 2 +
              (user.position.z - avatarState.position.z) ** 2,
          )
          return `• ${user.nickname} (${distance.toFixed(1)} units away)`
        })
        .join('\n')

      return `Users within ${radius} units:\n${userList}`
    },
    cliHandler: async (args, context) => {
      const radius = args[0] ? parseFloat(args[0]) : 10

      if (Number.isNaN(radius)) {
        return {
          success: false,
          message: 'Invalid radius. Must be a number.',
        }
      }

      const avatarState = context.avatarController.getState()
      if (!avatarState) {
        return {
          success: false,
          message: 'Bot avatar not spawned',
        }
      }

      const nearbyUsers = context.userAvatarManager.getUsersInRange(avatarState.position, radius)

      return {
        success: true,
        message:
          nearbyUsers.length > 0
            ? `${nearbyUsers.length} user(s) within ${radius} units:\n${nearbyUsers.map((u: UserAvatar) => `• ${u.nickname}`).join('\n')}`
            : `No users within ${radius} units`,
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
          message: 'Usage: /say <message>',
        }
      }

      const message = args.join(' ')
      try {
        // AgentClientを使ってメッセージを送信
        const client = context.agentClient
        if (!client) {
          throw new Error('AgentClient not available in context')
        }
        await client.send(message)
        return {
          success: true,
          message: 'Message sent',
        }
      } catch (error) {
        return {
          success: false,
          message: `Failed to send: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }
      }
    },
  },

  // Voice commands
  {
    name: 'voice',
    pattern: /^voice\s+(on|off|status)$/i,
    cliAliases: ['voice', 'v'],
    description: 'Control voice features',
    usage: 'voice <on|off|status>',
    botHandler: async (match, _sessionId, _context) => {
      const action = match[1].toLowerCase()

      switch (action) {
        case 'on':
          // TODO: Enable voice for the user
          return '🎤 Voice feature is not yet implemented for in-room commands'

        case 'off':
          // TODO: Disable voice for the user
          return '🔇 Voice feature is not yet implemented for in-room commands'

        case 'status':
          // TODO: Check voice status
          return '📊 Voice feature is not yet implemented for in-room commands'

        default:
          return 'Usage: voice <on|off|status>'
      }
    },
    cliHandler: async (args, context) => {
      if (args.length === 0) {
        return {
          success: false,
          message: 'Usage: /voice <on|off|status>',
        }
      }

      const action = args[0].toLowerCase()
      const client = context.agentClient

      if (!client) {
        return {
          success: false,
          message: 'Voice commands require AgentClient context',
        }
      }

      switch (action) {
        case 'on':
          try {
            // 音声接続を有効にする（接続時のオプションで制御）
            return {
              success: true,
              message: '🎤 Voice enabled. Use /mute to control microphone.',
            }
          } catch (error) {
            return {
              success: false,
              message: `Failed to enable voice: ${error instanceof Error ? error.message : 'Unknown error'}`,
            }
          }

        case 'off':
          try {
            // 音声接続を無効にする
            return {
              success: true,
              message: '🔇 Voice disabled',
            }
          } catch (error) {
            return {
              success: false,
              message: `Failed to disable voice: ${error instanceof Error ? error.message : 'Unknown error'}`,
            }
          }

        case 'status':
          try {
            const muted = client.isVoiceMuted()
            return {
              success: true,
              message: `📊 Voice Status:\n• Microphone: ${muted ? '🔇 Muted' : '🎤 Unmuted'}`,
            }
          } catch {
            return {
              success: true,
              message: '📊 Voice Status: Not connected',
            }
          }

        default:
          return {
            success: false,
            message: 'Usage: /voice <on|off|status>',
          }
      }
    },
  },

  // Mute command
  {
    name: 'mute',
    pattern: /^mute$/i,
    cliAliases: ['mute', 'm'],
    description: 'Toggle microphone mute',
    usage: 'mute',
    botHandler: async (_match, _sessionId, _context) => {
      return '🔇 Mute command is not available for in-room commands'
    },
    cliHandler: async (_args, context) => {
      try {
        const client = context.agentClient
        if (!client) {
          return {
            success: false,
            message: 'Mute command requires AgentClient context',
          }
        }
        const currentMuted = client.isVoiceMuted()
        await client.muteVoice(!currentMuted)

        return {
          success: true,
          message: currentMuted ? '🎤 Microphone unmuted' : '🔇 Microphone muted',
        }
      } catch (error) {
        return {
          success: false,
          message: `Failed to toggle mute: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }
      }
    },
  },

  // Test voice command (send test PCM)
  {
    name: 'testvoice',
    cliAliases: ['testvoice', 'tv'],
    description: 'Send test audio (sine wave)',
    usage: 'testvoice [duration_ms]',
    cliHandler: async (args, context) => {
      try {
        const client = context.agentClient
        if (!client) {
          return {
            success: false,
            message: 'Test voice command requires AgentClient context',
          }
        }
        const duration = args[0] ? parseInt(args[0], 10) : 1000 // デフォルト1秒

        if (Number.isNaN(duration) || duration < 100 || duration > 5000) {
          return {
            success: false,
            message: 'Duration must be between 100 and 5000 milliseconds',
          }
        }

        // 48kHz, 1ch, 20msフレーム
        const sampleRate = 48000
        const frameDurationMs = 20
        const samplesPerFrame = (sampleRate * frameDurationMs) / 1000
        const totalFrames = Math.floor(duration / frameDurationMs)

        // 440Hz (A4音)のサイン波を生成
        const frequency = 440
        let phase = 0
        const phaseIncrement = (2 * Math.PI * frequency) / sampleRate

        for (let i = 0; i < totalFrames; i++) {
          const frame = new Int16Array(samplesPerFrame)

          for (let j = 0; j < samplesPerFrame; j++) {
            // サイン波を生成（振幅を控えめに）
            frame[j] = Math.sin(phase) * 8192 // 32767の約1/4
            phase += phaseIncrement
            if (phase > 2 * Math.PI) {
              phase -= 2 * Math.PI
            }
          }

          await client.sendVoiceFrame(frame)
        }

        return {
          success: true,
          message: `🔊 Sent ${duration}ms of test audio (440Hz sine wave)`,
        }
      } catch (error) {
        return {
          success: false,
          message: `Failed to send test audio: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }
      }
    },
  },

  // Animation/reaction command
  {
    name: 'anime',
    pattern: /^(anime|animation|react)(?:\s+(.+))?$/i,
    cliAliases: ['anime', 'animation', 'react', 'anim'],
    description: 'Play VRM avatar animation',
    usage: 'anime <animation_name>',
    botHandler: async (match, _sessionId, context) => {
      const animationId = match[2]?.trim().toLowerCase()

      if (!animationId) {
        return '使用方法: anime <animation_name>\n利用可能なアニメーション: wave, dance, nod, bow, clap'
      }

      try {
        await context.avatarController.playAnimation(animationId)
        return `アニメーション「${animationId}」を実行しました 🎭`
      } catch (error) {
        context.logger.error('Animation command failed:', error)
        if (error instanceof Error && error.message.includes('not spawned')) {
          return 'アバターがスポーンされていません'
        } else if (error instanceof Error && error.message.includes('not found')) {
          return `アニメーション「${animationId}」が見つかりません。利用可能なアニメーション: wave, dance, nod, bow, clap`
        }
        return `アニメーションの実行に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    },
    cliHandler: async (args, context) => {
      if (args.length === 0) {
        return {
          success: false,
          message: 'Usage: /anime <animation_name>\n例: /anime wave, /anime dance, /anime nod',
        }
      }

      const animationId = args[0].toLowerCase()

      try {
        const result = await context.avatarController.playAnimation(animationId)
        return {
          success: true,
          message: `🎭 アニメーション「${animationId}」を実行しました\n再生ID: ${result.playbackId}${
            result.expectedDuration ? `\n予想時間: ${result.expectedDuration}ms` : ''
          }`,
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('not spawned')) {
          return {
            success: false,
            message: 'アバターがスポーンされていません',
          }
        } else if (error instanceof Error && error.message.includes('not found')) {
          return {
            success: false,
            message: `アニメーション「${animationId}」が見つかりません。\n\n利用可能なアニメーション例:\n• wave - 手を振る\n• dance - ダンス\n• nod - うなずき\n• bow - お辞儀\n• clap - 拍手`,
          }
        }
        return {
          success: false,
          message: `アニメーションの実行に失敗: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }
      }
    },
  },

  // Stop animation command
  {
    name: 'stop',
    pattern: /^(stop|idle)$/i,
    cliAliases: ['stop', 'idle'],
    description: 'Stop current animation and return to idle',
    usage: 'stop',
    botHandler: async (_match, _sessionId, context) => {
      try {
        await context.avatarController.stopAnimation()
        return 'アニメーションを停止し、待機状態に戻りました'
      } catch (error) {
        context.logger.error('Stop animation failed:', error)
        return 'アニメーションの停止に失敗しました'
      }
    },
    cliHandler: async (_args, context) => {
      try {
        await context.avatarController.stopAnimation()
        return {
          success: true,
          message: '⏹️ アニメーションを停止し、待機状態に戻りました',
        }
      } catch (error) {
        return {
          success: false,
          message: `停止に失敗: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
        message: 'Goodbye! 👋',
      }
    },
  },
]
