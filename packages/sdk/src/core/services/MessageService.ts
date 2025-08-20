import { getLogger } from '../../sdk/logging/index.js'
import type { IAppSettings } from '../interfaces/IAppSettings.js'
import type { IConnectionManager } from '../interfaces/IConnectionManager.js'
import { type IEventBus, SystemEvents } from '../interfaces/IEventBus.js'
import type { IMessageService, NAFMessage } from '../interfaces/IMessageService.js'

export class MessageService implements IMessageService {
  private messageHandlers = new Map<string, Set<(data: unknown) => void>>()
  private logger = getLogger('MessageService')

  constructor(
    private connectionManager: IConnectionManager,
    private eventBus: IEventBus,
    private appSettings: IAppSettings,
  ) {
    if (this.appSettings.debugMode) {
      this.logger.debug('Debug mode is ON')
    }
    this.setupChannelListeners()
  }

  private setupChannelListeners(): void {
    // Listen for connection events to setup channel listeners
    this.eventBus.on(SystemEvents.ROOM_JOINED, () => {
      const channel = this.connectionManager.getHubChannel()
      if (!channel) {
        return
      }

      // Setup message listener
      channel.on('message', (payload: unknown) => {
        if (this.appSettings.debugMode) {
          this.logger.debug('[MESSAGE RECEIVED]', payload)
        }
        this.handleIncomingMessage('message', payload)
        this.eventBus.emit(SystemEvents.MESSAGE_RECEIVED, payload)
      })

      // Setup NAF listener
      channel.on('naf', (payload: unknown) => {
        if (this.appSettings.debugMode) {
          this.logger.debug('[NAF RECEIVED]', payload)
        }
        this.handleIncomingMessage('naf', payload)
        this.eventBus.emit(SystemEvents.NAF_RECEIVED, payload)
      })

      // Setup NAFR listener
      channel.on('nafr', (payload: unknown) => {
        if (this.appSettings.debugMode) {
          this.logger.debug('[NAFR RECEIVED]', payload)
        }
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
          this.logger.error(`Error in message handler for "${type}":`, error)
        }
      }
    }
  }

  async sendMessage(message: string): Promise<void> {
    const channel = this.connectionManager.getHubChannel()
    if (!channel) {
      throw new Error('Not connected to hub')
    }

    const messageData = { body: message, type: 'chat' }
    if (this.appSettings.debugMode) {
      this.logger.debug('[MESSAGE SENT]', messageData)
    }

    // Fire and forget - don't wait for response
    channel.push('message', messageData)
    this.eventBus.emit(SystemEvents.MESSAGE_SENT, { body: message })
  }

  async sendNAF(data: NAFMessage): Promise<void> {
    const channel = this.connectionManager.getHubChannel()
    if (!channel) {
      throw new Error('Not connected to hub')
    }

    if (this.appSettings.debugMode) {
      this.logger.debug('[NAF SENT]', data)
    }

    // Fire and forget - don't wait for response
    channel.push('naf', data)
  }

  async sendNAFR(data: NAFMessage): Promise<void> {
    const channel = this.connectionManager.getHubChannel()
    if (!channel) {
      throw new Error('Not connected to hub')
    }

    const nafrData = { naf: JSON.stringify(data) }
    if (this.appSettings.debugMode) {
      this.logger.debug('[NAFR SENT]', nafrData)
    }

    // Fire and forget - don't wait for response
    channel.push('nafr', nafrData)
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
