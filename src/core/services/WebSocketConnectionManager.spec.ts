import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { WebSocketConnectionManager } from './WebSocketConnectionManager'
import type { IEventBus } from '../interfaces/IEventBus'
import type { IConfigurationProvider, BotConfiguration } from '../interfaces/IConfigurationProvider'
import { SystemEvents } from '../interfaces/IEventBus'
import type { MockSocket, MockChannel, SocketOptions } from '../../test-utils/mocks'
import { noop } from '../../test-utils/helpers'

// Mock Phoenix Socket and Channel
vi.mock('phoenix', () => {
  const MockChannel = vi.fn().mockImplementation(() => ({
    join: vi.fn().mockReturnValue({
      receive: vi.fn().mockReturnThis(),
    }),
    leave: vi.fn(),
    on: vi.fn(),
    push: vi.fn(),
  }))

  const MockSocket = vi.fn().mockImplementation((_url: string, _options: SocketOptions) => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn(() => false),
    channel: vi.fn(() => new MockChannel()),
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onError: vi.fn(),
  }))

  return { Socket: MockSocket, Channel: MockChannel }
})

describe('WebSocketConnectionManager', () => {
  let connectionManager: WebSocketConnectionManager
  let mockEventBus: IEventBus
  let mockConfigProvider: IConfigurationProvider
  let mockSocket: MockSocket
  let mockChannel: MockChannel

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock event bus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn(),
    }

    // Mock config provider
    mockConfigProvider = {
      get: vi.fn(),
      set: vi.fn(),
      getConfiguration: vi.fn(
        () =>
          ({
            apiUrl: 'https://test.app',
            profile: { displayName: 'TestBot' },
            context: { mobile: false, embed: false, hmd: false },
          }) as BotConfiguration,
      ),
      updateProfile: vi.fn(),
      updateContext: vi.fn(),
    }

    connectionManager = new WebSocketConnectionManager(mockEventBus, mockConfigProvider)
  })

  describe('connect', () => {
    it('should establish WebSocket connection', async () => {
      // Import Socket to get the mocked instance
      const { Socket } = await import('phoenix')

      // Mock successful connection
      const mockSocketInstance = {
        connect: vi.fn(),
        isConnected: vi.fn(() => true),
        channel: vi.fn(() => {
          mockChannel = {
            join: vi.fn().mockReturnValue({
              receive: vi.fn((event, callback) => {
                if (event === 'ok') {
                  callback({ session_id: 'test-session-123' })
                }
                return { receive: vi.fn().mockReturnThis() }
              }),
            }),
            leave: vi.fn(),
            on: vi.fn(),
          }
          return mockChannel
        }),
        onOpen: vi.fn((callback) => callback()),
        onClose: vi.fn(),
        onError: vi.fn(),
      }

      ;(Socket as ReturnType<typeof vi.fn>).mockImplementation(() => mockSocketInstance)
      mockSocket = mockSocketInstance

      const config = {
        authUrl: 'https://test.app/auth',
        hubId: 'test-hub',
      }

      await connectionManager.connect(config)

      expect(Socket).toHaveBeenCalledWith('wss://test.app/socket', expect.any(Object))
      expect(mockSocket.connect).toHaveBeenCalled()
      expect(mockSocket.channel).toHaveBeenCalledWith('hub:test-hub', {
        profile: { displayName: 'TestBot' },
        context: { mobile: false, embed: false, hmd: false },
      })
      expect(mockEventBus.emit).toHaveBeenCalledWith(SystemEvents.CONNECTION_ESTABLISHED)
      expect(mockEventBus.emit).toHaveBeenCalledWith(SystemEvents.ROOM_JOINED, {
        session_id: 'test-session-123',
      })
    })

    it('should handle connection errors', async () => {
      const { Socket } = await import('phoenix')

      const mockSocketInstance = {
        connect: vi.fn(),
        isConnected: vi.fn(() => false),
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onError: vi.fn(),
      }

      ;(Socket as ReturnType<typeof vi.fn>).mockImplementation(() => mockSocketInstance)

      const config = {
        authUrl: 'https://test.app/auth',
        hubId: 'test-hub',
      }

      // Mock the isConnected method to always return false
      // Store original method before mocking
      connectionManager.isConnected = vi.fn(() => false)

      // Use a shorter timeout for the test
      const originalWaitForConnection = connectionManager.waitForConnection.bind(connectionManager)
      connectionManager.waitForConnection = vi.fn().mockImplementation(() => {
        return originalWaitForConnection(100) // Very short timeout
      })

      const promise = connectionManager.connect(config)
      await expect(promise).rejects.toThrow('Connection timeout')
    })

    it('should handle hub join errors', async () => {
      const { Socket } = await import('phoenix')

      // Mock console.error to suppress error output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(noop)

      const mockSocketInstance = {
        connect: vi.fn(),
        isConnected: vi.fn(() => true),
        channel: vi.fn(() => ({
          join: vi.fn().mockReturnValue({
            receive: vi.fn().mockImplementation(function (
              this: unknown,
              event: string,
              callback: (data?: unknown) => void,
            ) {
              if (event === 'error') {
                // Call the error callback immediately
                callback({ reason: 'unauthorized' })
              } else if (event === 'ok') {
                // Don't call the ok callback
              } else if (event === 'timeout') {
                // Don't call the timeout callback
              }
              return this
            }),
          }),
        })),
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onError: vi.fn(),
      }

      ;(Socket as ReturnType<typeof vi.fn>).mockImplementation(() => mockSocketInstance)

      const config = {
        authUrl: 'https://test.app/auth',
        hubId: 'test-hub',
      }

      await expect(connectionManager.connect(config)).rejects.toThrow('Failed to join hub')

      consoleErrorSpy.mockRestore()
    })
  })

  describe('disconnect', () => {
    it('should clean up connections', async () => {
      // Setup connected state
      const { Socket } = await import('phoenix')

      const mockChannelInstance = {
        join: vi.fn().mockReturnValue({
          receive: vi.fn((event, callback) => {
            if (event === 'ok') {
              callback({ session_id: 'test-123' })
            }
            return { receive: vi.fn().mockReturnThis() }
          }),
        }),
        leave: vi.fn(),
      }

      const mockSocketInstance = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        isConnected: vi.fn(() => true),
        channel: vi.fn(() => mockChannelInstance),
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onError: vi.fn(),
      }

      ;(Socket as ReturnType<typeof vi.fn>).mockImplementation(() => mockSocketInstance)

      await connectionManager.connect({
        authUrl: 'https://test.app/auth',
        hubId: 'test-hub',
      })

      await connectionManager.disconnect()

      expect(mockChannelInstance.leave).toHaveBeenCalled()
      expect(mockSocketInstance.disconnect).toHaveBeenCalled()
      expect(mockEventBus.emit).toHaveBeenCalledWith(SystemEvents.CONNECTION_LOST)
    })

    it('should handle disconnect when not connected', async () => {
      await expect(connectionManager.disconnect()).resolves.not.toThrow()
    })
  })

  describe('isConnected', () => {
    it('should return false when socket is null', () => {
      expect(connectionManager.isConnected()).toBe(false)
    })

    it('should return socket connection status', async () => {
      const { Socket } = await import('phoenix')

      const mockSocketInstance = {
        connect: vi.fn(),
        isConnected: vi.fn(() => true),
        channel: vi.fn(() => ({
          join: vi.fn().mockReturnValue({
            receive: vi.fn().mockImplementation(function (
              this: unknown,
              event: string,
              callback: (data?: unknown) => void,
            ) {
              if (event === 'ok') {
                callback({ session_id: 'test-123' })
              }
              return this
            }),
          }),
        })),
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onError: vi.fn(),
      }

      ;(Socket as ReturnType<typeof vi.fn>).mockImplementation(() => mockSocketInstance)

      // Connect successfully
      await connectionManager.connect({
        authUrl: 'https://test.app/auth',
        hubId: 'test-hub',
      })

      expect(connectionManager.isConnected()).toBe(true)
    })
  })

  describe('getSocket', () => {
    it('should return null when not connected', () => {
      expect(connectionManager.getSocket()).toBeNull()
    })

    it('should return socket after connection attempt', async () => {
      const { Socket } = await import('phoenix')

      const mockSocketInstance = {
        connect: vi.fn(),
        isConnected: vi.fn(() => true),
        channel: vi.fn(() => ({
          join: vi.fn().mockReturnValue({
            receive: vi.fn().mockImplementation(function (
              this: unknown,
              event: string,
              callback: (data?: unknown) => void,
            ) {
              if (event === 'ok') {
                callback({ session_id: 'test-123' })
              }
              return this
            }),
          }),
        })),
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onError: vi.fn(),
      }

      ;(Socket as ReturnType<typeof vi.fn>).mockImplementation(() => mockSocketInstance)

      await connectionManager.connect({
        authUrl: 'https://test.app/auth',
        hubId: 'test-hub',
      })

      expect(connectionManager.getSocket()).toBe(mockSocketInstance)
    })
  })

  describe('getHubChannel', () => {
    it('should return null when not connected', () => {
      expect(connectionManager.getHubChannel()).toBeNull()
    })

    it('should return channel after successful connection', async () => {
      const { Socket } = await import('phoenix')

      const mockChannelInstance = {
        join: vi.fn().mockReturnValue({
          receive: vi.fn((event, callback) => {
            if (event === 'ok') {
              callback({ session_id: 'test-123' })
            }
            return { receive: vi.fn().mockReturnThis() }
          }),
        }),
        leave: vi.fn(),
      }

      const mockSocketInstance = {
        connect: vi.fn(),
        isConnected: vi.fn(() => true),
        channel: vi.fn(() => mockChannelInstance),
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onError: vi.fn(),
      }

      ;(Socket as ReturnType<typeof vi.fn>).mockImplementation(() => mockSocketInstance)

      await connectionManager.connect({
        authUrl: 'https://test.app/auth',
        hubId: 'test-hub',
      })

      expect(connectionManager.getHubChannel()).toBe(mockChannelInstance)
    })
  })

  describe('waitForConnection', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should wait until connected', async () => {
      let isConnected = false
      connectionManager.isConnected = vi.fn(() => isConnected)

      const waitPromise = connectionManager.waitForConnection(1000)

      // Simulate connection after 300ms
      setTimeout(() => {
        isConnected = true
      }, 300)

      await vi.runAllTimersAsync()
      await expect(waitPromise).resolves.toBeUndefined()
    })

    it('should timeout if connection takes too long', async () => {
      connectionManager.isConnected = vi.fn(() => false)

      const waitPromise = connectionManager.waitForConnection(1000)

      // Advance timers to trigger timeout
      vi.advanceTimersByTime(1100)

      // Wait for the promise to reject
      await expect(waitPromise).rejects.toThrow('Connection timeout')
    })
  })

  describe('getSessionId', () => {
    it('should return null when not connected', () => {
      expect(connectionManager.getSessionId()).toBeNull()
    })

    it('should return session ID after joining hub', async () => {
      const { Socket } = await import('phoenix')

      const mockSocketInstance = {
        connect: vi.fn(),
        isConnected: vi.fn(() => true),
        channel: vi.fn(() => ({
          join: vi.fn().mockReturnValue({
            receive: vi.fn((event, callback) => {
              if (event === 'ok') {
                callback({ session_id: 'test-session-456' })
              }
              return { receive: vi.fn().mockReturnThis() }
            }),
          }),
        })),
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onError: vi.fn(),
      }

      ;(Socket as ReturnType<typeof vi.fn>).mockImplementation(() => mockSocketInstance)

      await connectionManager.connect({
        authUrl: 'https://test.app/auth',
        hubId: 'test-hub',
      })

      expect(connectionManager.getSessionId()).toBe('test-session-456')
    })
  })

  describe('event handlers', () => {
    it('should emit CONNECTION_ESTABLISHED on socket open', async () => {
      const { Socket } = await import('phoenix')

      let onOpenCallback: (() => void) | null = null

      const mockSocketInstance = {
        connect: vi.fn(),
        isConnected: vi.fn(() => true),
        channel: vi.fn(() => ({
          join: vi.fn().mockReturnValue({
            receive: vi.fn().mockReturnThis(),
          }),
        })),
        onOpen: vi.fn((callback) => {
          onOpenCallback = callback
        }),
        onClose: vi.fn(),
        onError: vi.fn(),
      }

      ;(Socket as ReturnType<typeof vi.fn>).mockImplementation(() => mockSocketInstance)

      connectionManager
        .connect({
          authUrl: 'https://test.app/auth',
          hubId: 'test-hub',
        })
        .catch(() => undefined)

      // Simulate socket open
      onOpenCallback?.()

      expect(mockEventBus.emit).toHaveBeenCalledWith(SystemEvents.CONNECTION_ESTABLISHED)
    })

    it('should emit CONNECTION_ERROR on socket error', async () => {
      const { Socket } = await import('phoenix')

      let onErrorCallback: ((error: unknown) => void) | null = null

      const mockSocketInstance = {
        connect: vi.fn(),
        isConnected: vi.fn(() => false),
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onError: vi.fn((callback) => {
          onErrorCallback = callback
        }),
      }

      ;(Socket as ReturnType<typeof vi.fn>).mockImplementation(() => mockSocketInstance)

      connectionManager
        .connect({
          authUrl: 'https://test.app/auth',
          hubId: 'test-hub',
        })
        .catch(() => undefined)

      // Simulate socket error
      const error = new Error('Socket error')
      onErrorCallback?.(error)

      expect(mockEventBus.emit).toHaveBeenCalledWith(SystemEvents.CONNECTION_ERROR, error)
    })

    it('should emit CONNECTION_LOST on socket close', async () => {
      const { Socket } = await import('phoenix')

      let onCloseCallback: (() => void) | null = null

      const mockSocketInstance = {
        connect: vi.fn(),
        isConnected: vi.fn(() => false),
        onOpen: vi.fn(),
        onClose: vi.fn((callback) => {
          onCloseCallback = callback
        }),
        onError: vi.fn(),
      }

      ;(Socket as ReturnType<typeof vi.fn>).mockImplementation(() => mockSocketInstance)

      connectionManager
        .connect({
          authUrl: 'https://test.app/auth',
          hubId: 'test-hub',
        })
        .catch(() => undefined)

      // Simulate socket close
      onCloseCallback?.()

      expect(mockEventBus.emit).toHaveBeenCalledWith(SystemEvents.CONNECTION_LOST)
    })
  })

  describe('on', () => {
    it('should register event on hub channel', async () => {
      const { Socket } = await import('phoenix')

      const mockChannelInstance = {
        join: vi.fn().mockReturnValue({
          receive: vi.fn().mockImplementation(function (
            this: unknown,
            event: string,
            callback: (data?: unknown) => void,
          ) {
            if (event === 'ok') {
              callback({ session_id: 'test-123' })
            }
            return this
          }),
        }),
        on: vi.fn(),
      }

      const mockSocketInstance = {
        connect: vi.fn(),
        isConnected: vi.fn(() => true),
        channel: vi.fn(() => mockChannelInstance),
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onError: vi.fn(),
      }

      ;(Socket as ReturnType<typeof vi.fn>).mockImplementation(() => mockSocketInstance)

      await connectionManager.connect({
        authUrl: 'https://test.app/auth',
        hubId: 'test-hub',
      })

      const callback = vi.fn()
      connectionManager.on('custom-event', callback)

      expect(mockChannelInstance.on).toHaveBeenCalledWith('custom-event', callback)
    })

    it('should not register event when no channel available', () => {
      const callback = vi.fn()
      connectionManager.on('custom-event', callback)

      // Should not throw, just silently fail
      expect(() => connectionManager.on('custom-event', callback)).not.toThrow()
    })
  })
})
