/**
 * Command parser and executor for CLI commands
 */

import type { MetatellClient } from '@metatell/bot-sdk'

export interface CommandResult {
  success: boolean
  message?: string
  data?: unknown
}

export class CommandParser {
  async execute(input: string, client: MetatellClient): Promise<CommandResult> {
    const parts = input.split(/\s+/)
    const command = parts[0].toLowerCase()
    const args = parts.slice(1)

    switch (command) {
      case '/help':
      case '/?':
        return this.showHelp()

      case '/say':
        return this.say(args, client)

      case '/move':
        return this.move(args, client)

      case '/look':
        return this.look(args, client)

      case '/nearby':
        return this.nearby(args, client)

      case '/users':
        return this.listUsers(client)

      case '/status':
        return this.showStatus(client)

      case '/info':
        return this.showInfo(client)

      case '/anime':
      case '/animation':
        return this.playAnimation(args, client)

      case '/stop':
        return this.stopAnimation(client)

      case '/avatar':
        return this.changeAvatar(args, client)

      case '/assets':
        return this.listAssets(client)

      case '/animations':
        return this.listAnimations(client)

      default:
        return {
          success: false,
          message: `Unknown command: ${command}. Type /help for commands.`,
        }
    }
  }

  private showHelp(): CommandResult {
    const help = `
Available commands:
  /help, /?          - Show this help
  /say <message>     - Send a message
  /move <x> <y> <z>  - Move avatar to position
  /look <x> <y> <z>  - Look at position
  /look @<username>  - Look at user
  /nearby [radius]   - Show nearby users (default: 10)
  /users             - List all users
  /status            - Show connection status
  /info              - Show bot info
  /avatar <id>       - Change avatar
  /assets            - List available avatars
  /anime <name>      - Play animation
  /animations        - List available animations
  /stop              - Stop current animation
  quit, exit         - Exit the program
`
    console.log(help)
    return { success: true }
  }

  private async say(args: string[], client: MetatellClient): Promise<CommandResult> {
    if (args.length === 0) {
      return { success: false, message: 'Usage: /say <message>' }
    }

    const message = args.join(' ')
    await client.chat.send(message)
    console.log('[Sent]', message)
    return { success: true }
  }

  private async move(args: string[], client: MetatellClient): Promise<CommandResult> {
    if (args.length !== 3) {
      return { success: false, message: 'Usage: /move <x> <y> <z>' }
    }

    const x = parseFloat(args[0])
    const y = parseFloat(args[1])
    const z = parseFloat(args[2])

    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
      return { success: false, message: 'Invalid coordinates. Must be numbers.' }
    }

    await client.avatar.moveTo({ x, y, z })
    console.log(`[Moved to] x:${x} y:${y} z:${z}`)
    return { success: true }
  }

  private async look(args: string[], client: MetatellClient): Promise<CommandResult> {
    if (args.length === 0) {
      return { success: false, message: 'Usage: /look <x> <y> <z> or /look @<username>' }
    }

    // ユーザーを見る場合
    if (args[0].startsWith('@')) {
      const username = args[0].substring(1)
      const users = await client.room.getUsers()
      const targetUser = users.find((u) => u.name?.toLowerCase() === username.toLowerCase())

      if (!targetUser) {
        return { success: false, message: `User not found: ${username}` }
      }

      try {
        const position = await (
          client.room as unknown as {
            getUserPosition: (id: string) => Promise<{ x: number; y: number; z: number } | null>
          }
        ).getUserPosition(targetUser.id)

        if (!position) {
          return {
            success: false,
            message: `Could not get position for user: ${targetUser.name ?? targetUser.id}`,
          }
        }

        await client.avatar.lookAt(position)

        console.log(`[Looking at] ${targetUser.name}`)
        return { success: true }
      } catch (_error) {
        return {
          success: false,
          message: `Failed to look at user: ${targetUser.name ?? targetUser.id}`,
        }
      }
    }

    // 座標を見る場合
    if (args.length !== 3) {
      return { success: false, message: 'Usage: /look <x> <y> <z>' }
    }

    const x = parseFloat(args[0])
    const y = parseFloat(args[1])
    const z = parseFloat(args[2])

    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
      return { success: false, message: 'Invalid coordinates. Must be numbers.' }
    }

    // 指定座標を見る
    await client.avatar.lookAt({ x, y, z })

    console.log(`[Looking at] x:${x} y:${y} z:${z}`)
    return { success: true }
  }

  private async nearby(args: string[], client: MetatellClient): Promise<CommandResult> {
    const radius = args.length > 0 ? parseFloat(args[0]) : 10

    if (Number.isNaN(radius)) {
      return { success: false, message: 'Invalid radius. Must be a number.' }
    }

    const nearbyUsers = await client.room.getNearbyUsers(radius)

    console.log(`[Nearby users within ${radius}m]`)
    nearbyUsers.forEach((u) => {
      console.log(`- ${u.name || 'Anonymous'} (${u.id})${u.isBot ? ' [Bot]' : ''}`)
    })

    return { success: true }
  }

  private async listUsers(client: MetatellClient): Promise<CommandResult> {
    const users = await client.room.getUsers()
    console.log(`[Users (${users.length})]`)
    users.forEach((u) => {
      console.log(`- ${u.name || 'Anonymous'} (${u.id})${u.isBot ? ' [Bot]' : ''}`)
    })
    return { success: true }
  }

  private showStatus(client: MetatellClient): CommandResult {
    const status = client.getStatus()
    const sessionId = client.getSessionId()

    console.log('[Status]')
    console.log(`Connected: ${status.connected}`)
    console.log(`Connecting: ${status.connecting}`)
    console.log(`Session ID: ${sessionId || 'N/A'}`)

    return { success: true }
  }

  private async showInfo(client: MetatellClient): Promise<CommandResult> {
    const info = await client.getInfo()

    console.log('[Bot Info]')
    console.log(`Name: ${info.name}`)
    console.log(`Version: ${info.version}`)
    console.log(`Room ID: ${info.roomId}`)

    return { success: true }
  }

  private async changeAvatar(args: string[], client: MetatellClient): Promise<CommandResult> {
    if (args.length === 0) {
      return { success: false, message: 'Usage: /avatar <id>' }
    }

    const avatarId = args[0]
    try {
      await client.avatar.select(avatarId)
      console.log(`[Avatar changed to] ${avatarId}`)
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Error]', errorMessage)
      return {
        success: false,
        message: `Failed to change avatar: ${errorMessage}`,
      }
    }
  }

  private async listAssets(client: MetatellClient): Promise<CommandResult> {
    const assets = await client.avatar.getAvailableAssets()

    console.log(`[Available avatars (${assets.length})]`)
    assets.forEach((asset) => {
      console.log(`- ${asset.id}: ${asset.name}`)
    })

    return { success: true }
  }

  private async playAnimation(args: string[], client: MetatellClient): Promise<CommandResult> {
    if (args.length === 0) {
      return { success: false, message: 'Usage: /anime <name>' }
    }

    const animationName = args.join(' ')

    try {
      await client.avatar.play({
        name: animationName,
        id: animationName,
        loop: false,
      })
      console.log(`[Playing animation] ${animationName}`)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        message: `Failed to play animation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  private async stopAnimation(client: MetatellClient): Promise<CommandResult> {
    // アイドルアニメーションに戻す
    try {
      await client.avatar.play({
        name: 'idle',
        id: 'idle',
        loop: true,
      })
      console.log('[Stopped animation]')
      return { success: true }
    } catch {
      return { success: true, message: 'Animation stopped' }
    }
  }

  private async listAnimations(client: MetatellClient): Promise<CommandResult> {
    const animations = await client.avatar.getAvailableAnimations()

    console.log(`[Available animations (${animations.length})]`)
    animations.forEach((anim) => {
      const duration = anim.duration ? ` (${anim.duration.toFixed(1)}s)` : ''
      console.log(`- ${anim.id || anim.name}: ${anim.name}${duration}`)
    })

    return { success: true }
  }
}
