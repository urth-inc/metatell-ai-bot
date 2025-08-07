import { IMessageService } from '../core/interfaces/IMessageService'
import { IAvatarController } from '../core/interfaces/IAvatarController'
import { IPresenceManager, PresenceUser } from '../core/interfaces/IPresenceManager'
import { IConfigurationProvider } from '../core/interfaces/IConfigurationProvider'
import { IEventBus, SystemEvents } from '../core/interfaces/IEventBus'
import { IConnectionManager } from '../core/interfaces/IConnectionManager'

export type MessageHandler = (message: string, sessionId: string) => string | null

export class MetatellBot {
  private messageHandlers: MessageHandler[] = []
  private isRunning = false

  constructor(
    private connectionManager: IConnectionManager,
    private messageService: IMessageService,
    private avatarController: IAvatarController,
    private presenceManager: IPresenceManager,
    private configProvider: IConfigurationProvider,
    private eventBus: IEventBus
  ) {
    this.setupEventHandlers()
    this.setupDefaultHandlers()
  }

  private setupEventHandlers(): void {
    // Handle incoming messages
    this.messageService.on('message', (payload: any) => {
      this.handleIncomingMessage(payload)
    })

    // Handle user joins
    this.presenceManager.on('join', (user: PresenceUser) => {
      this.handleUserJoin(user)
    })

    // Handle user leaves
    this.presenceManager.on('leave', (user: PresenceUser) => {
      this.handleUserLeave(user)
    })
  }

  private setupDefaultHandlers(): void {
    // Help command
    this.addMessageHandler((message) => {
      if (message.toLowerCase() === 'help') {
        return `Available commands:
• help - Show this help message
• info - Show room information
• hello - Say hello!
• time - Show current time
• move <x> <y> <z> - Move avatar to position`
      }
      return null
    })

    // Info command
    this.addMessageHandler((message) => {
      if (message.toLowerCase() === 'info') {
        return this.getRoomInfo()
      }
      return null
    })

    // Hello command
    this.addMessageHandler((message) => {
      if (message.toLowerCase().includes('hello')) {
        const config = this.configProvider.getConfiguration()
        return `Hello! I'm ${config.profile.displayName}, your AI assistant! 👋`
      }
      return null
    })

    // Time command
    this.addMessageHandler((message) => {
      if (message.toLowerCase() === 'time') {
        return `Current time: ${new Date().toLocaleString()}`
      }
      return null
    })

    // Move command
    this.addMessageHandler((message) => {
      const moveMatch = message.match(/^move\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/i)
      if (moveMatch) {
        const x = parseFloat(moveMatch[1])
        const y = parseFloat(moveMatch[2])
        const z = parseFloat(moveMatch[3])
        
        this.avatarController.move({ x, y, z }).catch(console.error)
        return `Moving to position (${x}, ${y}, ${z})`
      }
      return null
    })
  }

  private handleIncomingMessage(payload: any): void {
    const { body, session_id } = payload
    
    // Don't respond to own messages
    const config = this.configProvider.getConfiguration()
    if (session_id === this.connectionManager.getSessionId()) {
      return
    }

    console.log(`[${session_id}] ${body}`)

    // Process message through handlers
    for (const handler of this.messageHandlers) {
      try {
        const response = handler(body, session_id)
        if (response) {
          this.messageService.sendMessage(response).catch(console.error)
          break // Only send first matching response
        }
      } catch (error) {
        console.error('Error in message handler:', error)
      }
    }
  }

  private handleUserJoin(user: PresenceUser): void {
    const config = this.configProvider.getConfiguration()
    const displayName = user.profile.displayName || 'Unknown'
    
    console.log(`User joined: ${displayName}`)
    
    // Welcome new users
    if (displayName !== config.profile.displayName) {
      this.messageService.sendMessage(`Welcome to the room, ${displayName}! 👋`)
        .catch(console.error)
    }
  }

  private handleUserLeave(user: PresenceUser): void {
    const displayName = user.profile.displayName || 'Unknown'
    console.log(`User left: ${displayName}`)
  }

  private getRoomInfo(): string {
    const users = this.presenceManager.getUsers()
    const userList = users
      .map(u => u.profile.displayName || 'Unknown')
      .join(', ')
    
    return `📊 Room Information:
• Users online: ${users.length}
• Connected users: ${userList}
• Server time: ${new Date().toLocaleString()}`
  }

  public addMessageHandler(handler: MessageHandler): void {
    this.messageHandlers.push(handler)
  }

  public removeMessageHandler(handler: MessageHandler): void {
    const index = this.messageHandlers.indexOf(handler)
    if (index !== -1) {
      this.messageHandlers.splice(index, 1)
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Bot is already running')
      return
    }

    try {
      const config = this.configProvider.getConfiguration()
      
      // Connect to server
      await this.connectionManager.connect({
        authUrl: config.authUrl,
        hubId: config.hubId
      })

      // Enter room
      await this.enterRoom()

      // Spawn avatar
      await this.avatarController.spawn(config.profile.avatarId)

      // Send welcome message
      await this.messageService.sendMessage(
        `🤖 ${config.profile.displayName} is now online! Type "help" to see what I can do.`
      )

      this.isRunning = true
      console.log('✅ Bot started successfully')

    } catch (error) {
      console.error('Failed to start bot:', error)
      throw error
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('Bot is not running')
      return
    }

    try {
      // Send goodbye message
      await this.messageService.sendMessage('Goodbye everyone! See you next time! 👋')
      
      // Destroy avatar
      await this.avatarController.destroy()
      
      // Disconnect
      await this.connectionManager.disconnect()
      
      this.isRunning = false
      console.log('Bot stopped successfully')

    } catch (error) {
      console.error('Error stopping bot:', error)
    }
  }

  private extractHubIdFromUrl(url: string): string {
    const match = url.match(/\/([a-zA-Z0-9_-]+)(?:\?|$)/)
    if (!match) {
      throw new Error(`Cannot extract hub ID from URL: ${url}`)
    }
    return match[1]
  }

  private async enterRoom(): Promise<void> {
    const channel = this.connectionManager.getHubChannel()
    if (!channel) {
      throw new Error('Not connected to hub')
    }

    // Send entering event
    channel.push('events:entering', {})
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Send entered event
    const enteredPayload = {
      initialOccupantCount: 0,
      isNewDaily: true,
      isNewMonthly: true,
      isNewDayWindow: true,
      isNewMonthWindow: true,
      entryDisplayType: 'Bot',
      userAgent: 'MetatellBot/1.0',
    }
    
    channel.push('events:entered', enteredPayload)
    console.log('✅ Entered room')
  }

  public isActive(): boolean {
    return this.isRunning
  }
}