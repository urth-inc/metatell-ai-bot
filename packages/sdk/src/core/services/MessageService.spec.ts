import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DefaultLoggerProvider, registerLoggerProvider } from '../../sdk/logging/index.js'

// Register logger provider for tests
registerLoggerProvider(new DefaultLoggerProvider(), { allowOverwrite: true })

import type { MockChannel } from '../../../../../test-utils/mocks.js'
import { findChannelCall, findEventBusCall } from '../../../../../test-utils/mocks.js'
import type { IAppSettings } from '../interfaces/IAppSettings.js'
import type { IConnectionManager } from '../interfaces/IConnectionManager.js'
import type { IEventBus } from '../interfaces/IEventBus.js'
import { SystemEvents } from '../interfaces/IEventBus.js'
import { MessageService } from './MessageService.js'

describe('MessageService', () => {
  let messageService: MessageService
  let mockConnectionManager: IConnectionManager
  let mockEventBus: IEventBus
  let mockChannel: MockChannel
  let mockAppSettings: IAppSettings

  beforeEach(() => {
    // Mock channel
    mockChannel = {
      on: vi.fn(),
      push: vi.fn(),
      leave: vi.fn(),
      join: vi.fn().mockReturnValue({ receive: vi.fn().mockReturnThis() }),
    }

    // Mock connection manager
    mockConnectionManager = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      joinRoom: vi.fn(),
      getHubChannel: vi.fn(() => mockChannel),
      getAuthChannel: vi.fn(),
      isConnected: vi.fn(() => true),
    }

    // Mock event bus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn(),
    }

    // Mock app settings
    mockAppSettings = {
      debugMode: false,
      logLevel: 'info' as const,
      onDebugModeChanged: vi.fn(),
      setDebugMode: vi.fn(),
    }

    messageService = new MessageService(mockConnectionManager, mockEventBus, mockAppSettings)
  })

  describe('constructor and setup', () => {
    it('should setup channel listeners on room join', () => {
      // Get the ROOM_JOINED handler
      const roomJoinedCall = findEventBusCall(mockEventBus.on, SystemEvents.ROOM_JOINED)
      expect(roomJoinedCall).toBeDefined()

      // Simulate room join
      const roomJoinedHandler = roomJoinedCall?.[1]
      roomJoinedHandler?.()

      // Verify channel listeners were set up
      expect(mockChannel.on).toHaveBeenCalledWith('message', expect.any(Function))
      expect(mockChannel.on).toHaveBeenCalledWith('naf', expect.any(Function))
      expect(mockChannel.on).toHaveBeenCalledWith('nafr', expect.any(Function))
    })

    it('should not setup listeners if no channel available', () => {
      mockConnectionManager.getHubChannel = vi.fn(() => null)

      const roomJoinedCall = findEventBusCall(mockEventBus.on, SystemEvents.ROOM_JOINED)
      const roomJoinedHandler = roomJoinedCall?.[1]
      roomJoinedHandler?.()

      expect(mockChannel.on).not.toHaveBeenCalled()
    })
  })

  describe('sendMessage', () => {
    it('should send message through channel', async () => {
      await messageService.sendMessage('Hello world')

      expect(mockChannel.push).toHaveBeenCalledWith('message', {
        body: 'Hello world',
        type: 'chat',
      })
      expect(mockEventBus.emit).toHaveBeenCalledWith(SystemEvents.MESSAGE_SENT, {
        body: 'Hello world',
      })
    })

    it('should throw error when not connected', async () => {
      mockConnectionManager.getHubChannel = vi.fn(() => null)

      await expect(messageService.sendMessage('Hello')).rejects.toThrow('Not connected to hub')
    })
  })

  describe('sendNAF', () => {
    it('should send NAF message through channel', async () => {
      const nafData = { id: 'test-id', components: {} }
      await messageService.sendNAF(nafData)

      expect(mockChannel.push).toHaveBeenCalledWith('naf', nafData)
    })

    it('should throw error when not connected', async () => {
      mockConnectionManager.getHubChannel = vi.fn(() => null)

      await expect(messageService.sendNAF({ id: 'test' })).rejects.toThrow('Not connected to hub')
    })
  })

  describe('sendNAFR', () => {
    it('should send NAFR message with stringified NAF data', async () => {
      const nafData = { id: 'test-id', components: { position: { x: 0, y: 0, z: 0 } } }
      await messageService.sendNAFR(nafData)

      expect(mockChannel.push).toHaveBeenCalledWith('nafr', {
        naf: JSON.stringify(nafData),
      })
    })

    it('should throw error when not connected', async () => {
      mockConnectionManager.getHubChannel = vi.fn(() => null)

      await expect(messageService.sendNAFR({ id: 'test' })).rejects.toThrow('Not connected to hub')
    })
  })

  describe('typing indicators', () => {
    it('should send begin typing event', async () => {
      await messageService.beginTyping()

      expect(mockChannel.push).toHaveBeenCalledWith('events:typing', { typing: true })
    })

    it('should send end typing event', async () => {
      await messageService.endTyping()

      expect(mockChannel.push).toHaveBeenCalledWith('events:typing', { typing: false })
    })

    it('should throw error when not connected for typing', async () => {
      mockConnectionManager.getHubChannel = vi.fn(() => null)

      await expect(messageService.beginTyping()).rejects.toThrow('Not connected to hub')
      await expect(messageService.endTyping()).rejects.toThrow('Not connected to hub')
    })
  })

  describe('message handlers', () => {
    beforeEach(() => {
      // Setup channel listeners
      const roomJoinedCall = findEventBusCall(mockEventBus.on, SystemEvents.ROOM_JOINED)
      roomJoinedCall?.[1]()
    })

    it('should register and call message handler', () => {
      const handler = vi.fn()
      messageService.on('message', handler)

      // Get the channel message handler
      const messageCall = findChannelCall(mockChannel.on, 'message')
      const channelHandler = messageCall?.[1] as (payload: unknown) => void

      // Simulate incoming message
      const payload = { body: 'Test message' }
      channelHandler(payload)

      expect(handler).toHaveBeenCalledWith(payload)
      expect(mockEventBus.emit).toHaveBeenCalledWith(SystemEvents.MESSAGE_RECEIVED, payload)
    })

    it('should handle multiple handlers for same event', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      messageService.on('naf', handler1)
      messageService.on('naf', handler2)

      // Get the channel NAF handler
      const nafCall = findChannelCall(mockChannel.on, 'naf')
      const channelHandler = nafCall?.[1] as (payload: unknown) => void

      const payload = { id: 'test' }
      channelHandler(payload)

      expect(handler1).toHaveBeenCalledWith(payload)
      expect(handler2).toHaveBeenCalledWith(payload)
    })

    it('should unregister handler', () => {
      const handler = vi.fn()
      messageService.on('nafr', handler)
      messageService.off('nafr', handler)

      // Get the channel NAFR handler
      const nafrCall = findChannelCall(mockChannel.on, 'nafr')
      const channelHandler = nafrCall?.[1] as (payload: unknown) => void

      channelHandler({ data: 'test' })

      expect(handler).not.toHaveBeenCalled()
    })

    it('should catch errors in message handlers', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error')
      })
      const normalHandler = vi.fn()

      messageService.on('message', errorHandler)
      messageService.on('message', normalHandler)

      // Get the channel message handler
      const messageCall = findChannelCall(mockChannel.on, 'message')
      const channelHandler = messageCall?.[1] as (payload: unknown) => void

      channelHandler({ body: 'test' })

      expect(errorHandler).toHaveBeenCalled()
      expect(normalHandler).toHaveBeenCalled()
      // エラーがキャッチされ、他のハンドラーも実行されることを確認
    })

    it('should emit correct system events for each message type', () => {
      // Get channel handlers
      const messageCall = findChannelCall(mockChannel.on, 'message')
      const nafCall = findChannelCall(mockChannel.on, 'naf')
      const nafrCall = findChannelCall(mockChannel.on, 'nafr')

      const messageHandler = messageCall?.[1] as (payload: unknown) => void
      const nafHandler = nafCall?.[1] as (payload: unknown) => void
      const nafrHandler = nafrCall?.[1] as (payload: unknown) => void

      // Test each handler
      const messagePayload = { body: 'test' }
      messageHandler(messagePayload)
      expect(mockEventBus.emit).toHaveBeenCalledWith(SystemEvents.MESSAGE_RECEIVED, messagePayload)

      const nafPayload = { id: 'naf-test' }
      nafHandler(nafPayload)
      expect(mockEventBus.emit).toHaveBeenCalledWith(SystemEvents.NAF_RECEIVED, nafPayload)

      const nafrPayload = { data: 'nafr-test' }
      nafrHandler(nafrPayload)
      expect(mockEventBus.emit).toHaveBeenCalledWith(SystemEvents.NAFR_RECEIVED, nafrPayload)
    })
  })
})
