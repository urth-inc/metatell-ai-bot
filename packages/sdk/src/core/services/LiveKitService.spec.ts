import { Room, RoomEvent } from 'livekit-client'
import { beforeEach, describe, expect, it, type Mock, type MockedObject, vi } from 'vitest'
import type { IAppSettings } from '../interfaces/IAppSettings.js'
import type { IConnectionManager } from '../interfaces/IConnectionManager.js'
import type { IEventBus } from '../interfaces/IEventBus.js'
import { LiveKitEvents, LiveKitService } from './LiveKitService.js'

// Mock livekit-client
vi.mock('livekit-client', () => ({
  Room: vi.fn(() => ({
    state: 'disconnected',
    on: vi.fn(),
    prepareConnection: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    startAudio: vi.fn(),
    localParticipant: {
      publishTrack: vi.fn(),
      unpublishTrack: vi.fn(),
    },
  })),
  RoomEvent: {
    Connected: 'connected',
    Disconnected: 'disconnected',
    TrackSubscribed: 'track_subscribed',
    TrackUnsubscribed: 'track_unsubscribed',
  },
  Track: {
    Kind: {
      Audio: 'audio',
      Video: 'video',
    },
  },
  createLocalAudioTrack: vi.fn().mockResolvedValue({
    setEnabled: vi.fn(),
  }),
  DisconnectReason: {
    toString: vi.fn(),
  },
}))

// Global fetch mock
global.fetch = vi.fn()

describe('LiveKitService', () => {
  let service: LiveKitService
  let mockEventBus: MockedObject<IEventBus>
  let mockConnectionManager: MockedObject<IConnectionManager>
  let mockAppSettings: MockedObject<IAppSettings>
  let mockRoom: ReturnType<typeof Room>

  beforeEach(() => {
    vi.clearAllMocks()

    // Reset fetch mock
    ;(global.fetch as Mock).mockReset()

    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    }

    mockConnectionManager = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnected: vi.fn(),
      getSocket: vi.fn(),
      getHubChannel: vi.fn(),
      waitForConnection: vi.fn(),
      on: vi.fn(),
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
    }

    mockAppSettings = {
      debugMode: false,
      logLevel: 'info',
      livekitUrl: 'wss://test.livekit.cloud',
      apiBaseUrl: 'https://api.test.com',
      onDebugModeChanged: vi.fn(),
      setDebugMode: vi.fn(),
      setLogLevel: vi.fn(),
    }

    // Mock Room instance
    mockRoom = new Room()
    vi.mocked(Room).mockImplementation(() => mockRoom)

    service = new LiveKitService(mockEventBus, mockConnectionManager, mockAppSettings)
  })

  describe('initialize', () => {
    it('should initialize with room ID and create Room instance', () => {
      service.initialize('test-room')
      expect(Room).toHaveBeenCalledWith({
        adaptiveStream: true,
        dynacast: true,
      })
      expect(mockRoom.on).toHaveBeenCalled()
    })

    it('should setup event handlers', () => {
      service.initialize('test-room')

      // Check if event handlers are registered
      expect(mockRoom.on).toHaveBeenCalledWith(RoomEvent.Connected, expect.any(Function))
      expect(mockRoom.on).toHaveBeenCalledWith(RoomEvent.Disconnected, expect.any(Function))
      expect(mockRoom.on).toHaveBeenCalledWith(RoomEvent.TrackSubscribed, expect.any(Function))
      expect(mockRoom.on).toHaveBeenCalledWith(RoomEvent.TrackUnsubscribed, expect.any(Function))
    })

    it('should apply custom audio configuration', () => {
      const customConfig = {
        adaptiveStream: false,
        dynacast: false,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }

      const customService = new LiveKitService(
        mockEventBus,
        mockConnectionManager,
        mockAppSettings,
        customConfig,
      )

      customService.initialize('test-room')

      expect(Room).toHaveBeenCalledWith({
        adaptiveStream: false,
        dynacast: false,
      })
    })
  })

  describe('connect', () => {
    beforeEach(() => {
      ;(global.fetch as Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'test-livekit-token' }),
      })
    })

    it('should throw if not initialized', async () => {
      await expect(service.connect()).rejects.toThrow('LiveKit service not initialized')
    })

    it('should throw if session ID not available', async () => {
      service.initialize('test-room')
      mockConnectionManager.getSessionId.mockReturnValue(null)

      await expect(service.connect()).rejects.toThrow('Session ID not available')
    })

    it('should successfully connect with token', async () => {
      service.initialize('test-room')
      mockRoom.connect.mockResolvedValue(undefined)

      await service.connect()

      // Verify token fetch
      expect(global.fetch).toHaveBeenCalledWith('https://api.test.com/livekit/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomName: 'microphone:test-room',
          identity: 'test-session-id',
        }),
      })

      // Verify connection
      expect(mockRoom.prepareConnection).toHaveBeenCalledWith(
        'wss://test.livekit.cloud',
        'test-livekit-token',
      )
      expect(mockRoom.connect).toHaveBeenCalledWith(
        'wss://test.livekit.cloud',
        'test-livekit-token',
      )
    })

    it('should handle token fetch error', async () => {
      service.initialize('test-room')
      ;(global.fetch as Mock).mockResolvedValue({
        ok: false,
        status: 500,
      })

      await expect(service.connect()).rejects.toThrow('Failed to get LiveKit token')
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        LiveKitEvents.CONNECTION_ERROR,
        expect.any(Error),
      )
    })

    it('should add audio unlock listener', async () => {
      service.initialize('test-room')
      mockRoom.connect.mockResolvedValue(undefined)

      const addEventListenerSpy = vi.spyOn(window.document, 'addEventListener')

      await service.connect()

      expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function), {
        once: true,
      })
    })
  })

  describe('disconnect', () => {
    it('should disconnect and cleanup', async () => {
      service.initialize('test-room')
      mockRoom.state = 'connected'
      mockRoom.disconnect.mockResolvedValue(undefined)

      await service.disconnect()

      expect(mockRoom.disconnect).toHaveBeenCalled()
    })
  })

  describe('isConnected', () => {
    it('should return false when not initialized', () => {
      expect(service.isConnected()).toBe(false)
    })

    it('should return true when connected', () => {
      service.initialize('test-room')
      mockRoom.state = 'connected'

      expect(service.isConnected()).toBe(true)
    })

    it('should return false when disconnected', () => {
      service.initialize('test-room')
      mockRoom.state = 'disconnected'

      expect(service.isConnected()).toBe(false)
    })
  })

  describe('publishMicrophone', () => {
    it('should throw if not connected', async () => {
      service.initialize('test-room')
      mockRoom.state = 'disconnected'

      await expect(service.publishMicrophone()).rejects.toThrow('Not connected to LiveKit room')
    })

    it('should publish microphone track', async () => {
      const mockTrack = { setEnabled: vi.fn() }
      const mockPublication = { track: mockTrack }

      const { createLocalAudioTrack } = await import('livekit-client')
      vi.mocked(createLocalAudioTrack).mockResolvedValue(mockTrack)
      mockRoom.localParticipant.publishTrack.mockResolvedValue(mockPublication)

      service.initialize('test-room')
      mockRoom.state = 'connected'

      const publication = await service.publishMicrophone()

      expect(createLocalAudioTrack).toHaveBeenCalledWith({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      })
      expect(mockRoom.localParticipant.publishTrack).toHaveBeenCalledWith(mockTrack)
      expect(mockEventBus.emit).toHaveBeenCalledWith(LiveKitEvents.MICROPHONE_PUBLISHED)
      expect(publication).toBe(mockPublication)
    })
  })

  describe('unpublishMicrophone', () => {
    it('should unpublish microphone track', async () => {
      const mockTrack = { setEnabled: vi.fn() }
      const mockPublication = { track: mockTrack }

      service.initialize('test-room')
      mockRoom.state = 'connected'

      // Simulate having a published microphone
      const { createLocalAudioTrack } = await import('livekit-client')
      vi.mocked(createLocalAudioTrack).mockResolvedValue(mockTrack)
      mockRoom.localParticipant.publishTrack.mockResolvedValue(mockPublication)
      await service.publishMicrophone()

      // Now unpublish
      await service.unpublishMicrophone()

      expect(mockRoom.localParticipant.unpublishTrack).toHaveBeenCalledWith(mockTrack)
      expect(mockEventBus.emit).toHaveBeenCalledWith(LiveKitEvents.MICROPHONE_UNPUBLISHED)
    })

    it('should do nothing if microphone not published', async () => {
      service.initialize('test-room')
      mockRoom.state = 'connected'

      await service.unpublishMicrophone()

      expect(mockRoom.localParticipant.unpublishTrack).not.toHaveBeenCalled()
    })
  })

  describe('setSpeakerVolume', () => {
    it('should set volume on all audio elements', () => {
      service.initialize('test-room')

      // Simulate having audio elements
      const mockAudioElement1 = { volume: 1, play: vi.fn(), pause: vi.fn(), remove: vi.fn() }
      const _mockAudioElement2 = { volume: 1, play: vi.fn(), pause: vi.fn(), remove: vi.fn() }

      // We need to simulate audio track subscription
      const mockTrack = {
        sid: 'track-1',
        kind: 'audio',
        attach: vi.fn().mockReturnValue(mockAudioElement1),
        detach: vi.fn(),
      }

      // Get the handler from the mock
      const connectedHandler = mockRoom.on.mock.calls.find(
        (call: unknown[]) => call[0] === RoomEvent.TrackSubscribed,
      )?.[1]

      // Simulate track subscription
      connectedHandler?.(mockTrack, {})

      service.setSpeakerVolume(0.5)

      expect(mockAudioElement1.volume).toBe(0.5)
    })

    it('should clamp volume between 0 and 1', () => {
      service.initialize('test-room')

      service.setSpeakerVolume(-1)
      expect(service.getSpeakerVolume()).toBe(0)

      service.setSpeakerVolume(2)
      expect(service.getSpeakerVolume()).toBe(1)
    })
  })

  describe('event handling', () => {
    beforeEach(() => {
      service.initialize('test-room')
    })

    it('should emit CONNECTED event when room connects', () => {
      const connectedHandler = mockRoom.on.mock.calls.find(
        (call: unknown[]) => call[0] === RoomEvent.Connected,
      )?.[1]

      connectedHandler?.()

      expect(mockEventBus.emit).toHaveBeenCalledWith(LiveKitEvents.CONNECTED)
    })

    it('should emit DISCONNECTED event with reason', () => {
      const disconnectedHandler = mockRoom.on.mock.calls.find(
        (call: unknown[]) => call[0] === RoomEvent.Disconnected,
      )?.[1]

      disconnectedHandler?.('connection lost')

      expect(mockEventBus.emit).toHaveBeenCalledWith(LiveKitEvents.DISCONNECTED, {
        reason: 'connection lost',
      })
    })

    it('should handle audio track subscription', () => {
      const mockAudioElement = { volume: 1, play: vi.fn().mockResolvedValue(undefined) }
      const mockTrack = {
        sid: 'track-1',
        kind: 'audio',
        attach: vi.fn().mockReturnValue(mockAudioElement),
      }

      const subscribeHandler = mockRoom.on.mock.calls.find(
        (call: unknown[]) => call[0] === RoomEvent.TrackSubscribed,
      )?.[1]

      subscribeHandler?.(mockTrack, {})

      expect(mockTrack.attach).toHaveBeenCalled()
      expect(mockAudioElement.play).toHaveBeenCalled()
      expect(mockEventBus.emit).toHaveBeenCalledWith(LiveKitEvents.AUDIO_TRACK_SUBSCRIBED, {
        trackSid: 'track-1',
      })
    })

    it('should ignore non-audio tracks', () => {
      const mockTrack = {
        sid: 'track-1',
        kind: 'video',
        attach: vi.fn(),
      }

      const subscribeHandler = mockRoom.on.mock.calls.find(
        (call: unknown[]) => call[0] === RoomEvent.TrackSubscribed,
      )?.[1]

      subscribeHandler?.(mockTrack, {})

      expect(mockTrack.attach).not.toHaveBeenCalled()
      expect(mockEventBus.emit).not.toHaveBeenCalledWith(
        LiveKitEvents.AUDIO_TRACK_SUBSCRIBED,
        expect.any(Object),
      )
    })

    it('should handle audio track unsubscription', () => {
      const mockAudioElement = { volume: 1, play: vi.fn(), pause: vi.fn(), remove: vi.fn() }
      const mockTrack = {
        sid: 'track-1',
        kind: 'audio',
        attach: vi.fn().mockReturnValue(mockAudioElement),
        detach: vi.fn(),
      }

      // First subscribe
      const subscribeHandler = mockRoom.on.mock.calls.find(
        (call: unknown[]) => call[0] === RoomEvent.TrackSubscribed,
      )?.[1]
      subscribeHandler?.(mockTrack, {})

      // Then unsubscribe
      const unsubscribeHandler = mockRoom.on.mock.calls.find(
        (call: unknown[]) => call[0] === RoomEvent.TrackUnsubscribed,
      )?.[1]
      unsubscribeHandler?.(mockTrack)

      expect(mockTrack.detach).toHaveBeenCalledWith(mockAudioElement)
      expect(mockEventBus.emit).toHaveBeenCalledWith(LiveKitEvents.AUDIO_TRACK_UNSUBSCRIBED, {
        trackSid: 'track-1',
      })
    })
  })
})
