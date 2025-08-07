import type { IMessageService, NAFMessage } from '../interfaces/IMessageService'
import type { IConnectionManager } from '../interfaces/IConnectionManager'
import { type IEventBus, SystemEvents } from '../interfaces/IEventBus'
import type { IRateLimiter } from '../interfaces/IRateLimiter'

export class MessageService implements IMessageService {
  private messageHandlers = new Map<string, Set<(data: unknown) => void>>()

  constructor(
    private connectionManager: IConnectionManager,
    private eventBus: IEventBus,
    private rateLimiter: IRateLimiter
  ) {
    this.setupChannelListeners()
  }

  private setupChannelListeners(): void {
    // Listen for connection events to setup channel listeners
    this.eventBus.on(SystemEvents.ROOM_JOINED, () => {
      const channel = this.connectionManager.getHubChannel()
      if (!channel) { return }

      // Setup message listener
      channel.on('message', (payload: unknown) => {
        this.handleIncomingMessage('message', payload)
        this.eventBus.emit(SystemEvents.MESSAGE_RECEIVED, payload)
      })

      // Setup NAF listener
      channel.on('naf', (payload: unknown) => {
        this.handleIncomingMessage('naf', payload)
        this.eventBus.emit(SystemEvents.NAF_RECEIVED, payload)
      })

      // Setup NAFR listener
      channel.on('nafr', (payload: unknown) => {
        this.handleIncomingMessage('nafr', payload)
        this.eventBus.emit(SystemEvents.NAFR_RECEIVED, payload)
      })
    })
  }

  private handleIncomingMessage(type: string, data: unknown): void {
    const handlers = this.messageHandlers.get(type)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data)
        } catch (error) {
          console.error(`Error in message handler for "${type}":`, error)
        }
      }
    }
  }

  async sendMessage(message: string): Promise<void> {
    const channel = this.connectionManager.getHubChannel()
    if (!channel) {
      throw new Error('Not connected to hub')
    }

    // Check rate limit
    if (!this.rateLimiter.check('message')) {
      const waitTime = this.rateLimiter.getTimeUntilReset('message')
      console.log(`Rate limited: Message not sent (wait ${Math.ceil(waitTime / 1000)}s)`)
      await this.rateLimiter.wait('message')
    }

    // Fire and forget - don't wait for response
    channel.push('message', { body: message, type: 'chat' })
    this.eventBus.emit(SystemEvents.MESSAGE_SENT, { body: message })
    console.log('Message sent:', message)
  }

  async sendNAF(data: NAFMessage): Promise<void> {
    const channel = this.connectionManager.getHubChannel()
    if (!channel) {
      throw new Error('Not connected to hub')
    }

    // Fire and forget - don't wait for response
    channel.push('naf', data)
    console.log('NAF message sent')
  }

  async sendNAFR(data: NAFMessage): Promise<void> {
    const channel = this.connectionManager.getHubChannel()
    if (!channel) {
      throw new Error('Not connected to hub')
    }

    // Fire and forget - don't wait for response
    channel.push('nafr', { naf: JSON.stringify(data) })
    console.log('NAFR message sent')
  }

  async beginTyping(): Promise<void> {
    const channel = this.connectionManager.getHubChannel()
    if (!channel) {
      throw new Error('Not connected to hub')
    }

    channel.push('events:typing', { typing: true })
  }

  async endTyping(): Promise<void> {
    const channel = this.connectionManager.getHubChannel()
    if (!channel) {
      throw new Error('Not connected to hub')
    }

    channel.push('events:typing', { typing: false })
  }

  on(event: 'message' | 'naf' | 'nafr', handler: (data: unknown) => void): void {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, new Set())
    }
    this.messageHandlers.get(event)?.add(handler)
  }

  off(event: 'message' | 'naf' | 'nafr', handler: (data: unknown) => void): void {
    const handlers = this.messageHandlers.get(event)
    if (handlers) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        this.messageHandlers.delete(event)
      }
    }
  }
}