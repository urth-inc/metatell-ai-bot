/**
 * Test for MetatellClient implementation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMetatellClient, type MetatellClient } from './client.js'
import type { CreateClientOptions } from './types.js'

// Mock modules
vi.mock('@metatell/bot-core', () => {
  const mockServiceFactory = {
    getContainer: vi.fn(),
  }

  // サービスクラスのモック（nameプロパティを持つ）
  const createMockClass = (name: string) => {
    const MockClass = vi.fn()
    MockClass.mockName = name
    Object.defineProperty(MockClass, 'name', { value: name })
    return MockClass
  }

  return {
    AnimationService: createMockClass('AnimationService'),
    AppSettings: createMockClass('AppSettings'),
    AvatarController: createMockClass('AvatarController'),
    ConfigurationProvider: createMockClass('ConfigurationProvider'),
    ConnectionManager: createMockClass('ConnectionManager'),
    DefaultLoggerProvider: vi.fn(),
    CoreServiceFactory: vi.fn(() => mockServiceFactory),
    EventBus: createMockClass('EventBus'),
    MessageService: createMockClass('MessageService'),
    OrganizationService: createMockClass('OrganizationService'),
    PresenceManager: createMockClass('PresenceManager'),
    registerLoggerProvider: vi.fn(),
    SystemEvents: {
      CONNECTION_ESTABLISHED: 'connection:established',
      CONNECTION_LOST: 'connection:lost',
      MESSAGE_RECEIVED: 'message:received',
      USER_JOINED: 'user:joined',
      USER_LEFT: 'user:left',
    },
    UserAvatarManager: createMockClass('UserAvatarManager'),
  }
})

vi.mock('./sdk/logging/index.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Helper to create mock services
function createMockServices() {
  const eventBus = {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  }

  const connectionManager = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getSessionId: vi.fn().mockReturnValue('test-session-id'),
  }

  const messageService = {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  }

  const avatarController = {
    spawn: vi.fn().mockResolvedValue(undefined),
    playAnimation: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockResolvedValue(undefined),
    rotate: vi.fn().mockResolvedValue(undefined),
    resyncAvatar: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockReturnValue({
      avatarId: 'test-avatar-id',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    }),
  }

  const presenceManager = {
    getUsers: vi.fn().mockReturnValue([
      {
        id: 'user1',
        profile: { displayName: 'User 1' },
      },
      {
        id: 'user2',
        profile: { displayName: 'User 2' },
      },
    ]),
  }

  const organizationService = {
    getOrganizationInfo: vi.fn().mockResolvedValue({
      organizationId: 'test-org-id',
    }),
    fetchOrganizationAvatars: vi.fn().mockResolvedValue([
      {
        id: 'org-avatar-1',
        name: 'Organization Avatar 1',
        gltf: { avatar: 'https://example.com/avatar1.glb' },
        images: { preview: { url: 'https://example.com/preview1.jpg' } },
      },
    ]),
  }

  const animationService = {
    getAvailableAnimations: vi.fn().mockResolvedValue([
      {
        id: 'anim1',
        name: 'Animation 1',
        duration: 1000,
      },
      {
        id: 'anim2',
        name: 'Animation 2',
        duration: 2000,
      },
    ]),
  }

  const userAvatarManager = {
    getUser: vi.fn().mockReturnValue({
      id: 'user1',
      position: { x: 5, y: 0, z: 5 },
      rotation: { x: 0, y: 90, z: 0, w: Math.SQRT1_2 },
    }),
    getUsersInRange: vi.fn().mockReturnValue([
      {
        id: 'user1',
        nickname: 'User 1',
        position: { x: 5, y: 0, z: 5 },
        rotation: { x: 0, y: 90, z: 0, w: Math.SQRT1_2 },
      },
    ]),
  }

  const configProvider = {
    getConfiguration: vi.fn().mockReturnValue({
      serverUrl: 'wss://metatell.app',
      hubUrl: 'https://metatell.app',
      hubId: 'test-room',
      profile: {
        displayName: 'TestBot',
        avatarId: 'test-avatar-id',
      },
    }),
  }

  const appSettings = {
    setLogLevel: vi.fn(),
    setDebugMode: vi.fn(),
  }

  const container = {
    get: vi.fn((serviceType) => {
      const services: Record<string, unknown> = {
        ConnectionManager: connectionManager,
        MessageService: messageService,
        AvatarController: avatarController,
        PresenceManager: presenceManager,
        OrganizationService: organizationService,
        AnimationService: animationService,
        EventBus: eventBus,
        ConfigurationProvider: configProvider,
        UserAvatarManager: userAvatarManager,
        AppSettings: appSettings,
      }

      // serviceTypeがクラスの場合はnameプロパティを使用
      const serviceName = typeof serviceType === 'function' ? serviceType.name : serviceType
      return services[serviceName]
    }),
  }

  const serviceFactory = {
    getContainer: vi.fn().mockReturnValue(container),
  }

  // getContainer()が正しくcontainerを返すように設定
  serviceFactory.getContainer.mockReturnValue(container)

  return {
    serviceFactory,
    container,
    eventBus,
    connectionManager,
    messageService,
    avatarController,
    presenceManager,
    organizationService,
    animationService,
    userAvatarManager,
    configProvider,
    appSettings,
  }
}

describe('createMetatellClient', () => {
  it('should throw error when serverUrl is missing', () => {
    expect(() => createMetatellClient({ roomId: 'test-room' } as CreateClientOptions)).toThrow(
      'serverUrl and roomId are required',
    )
  })

  it('should throw error when roomId is missing', () => {
    expect(() =>
      createMetatellClient({ serverUrl: 'wss://test.com' } as CreateClientOptions),
    ).toThrow('serverUrl and roomId are required')
  })

  it('should create client with valid options', async () => {
    const mocks = createMockServices()
    const { CoreServiceFactory } = await import('@metatell/bot-core')
    vi.mocked(CoreServiceFactory).mockImplementation(
      () => mocks.serviceFactory as ReturnType<typeof CoreServiceFactory>,
    )

    const client = createMetatellClient({
      serverUrl: 'wss://test.metatell.app',
      roomId: 'test-room',
    })
    expect(client).toBeDefined()
    expect(client.connect).toBeDefined()
    expect(client.disconnect).toBeDefined()
  })

  it('should remove subdomain from serverUrl', async () => {
    const mocks = createMockServices()
    const { CoreServiceFactory } = await import('@metatell/bot-core')
    const MockedCoreServiceFactory = vi.mocked(CoreServiceFactory)
    MockedCoreServiceFactory.mockImplementation(
      () => mocks.serviceFactory as ReturnType<typeof CoreServiceFactory>,
    )

    createMetatellClient({
      serverUrl: 'wss://subdomain.metatell.app',
      roomId: 'test-room',
    })

    expect(MockedCoreServiceFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        serverUrl: 'wss://metatell.app',
      }),
    )
  })

  it('should handle invalid URL gracefully', async () => {
    const mocks = createMockServices()
    const { CoreServiceFactory } = await import('@metatell/bot-core')
    const MockedCoreServiceFactory = vi.mocked(CoreServiceFactory)
    MockedCoreServiceFactory.mockImplementation(
      () => mocks.serviceFactory as ReturnType<typeof CoreServiceFactory>,
    )

    createMetatellClient({
      serverUrl: 'invalid-url',
      roomId: 'test-room',
    })

    expect(MockedCoreServiceFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        serverUrl: 'invalid-url',
      }),
    )
  })
})

describe('MetatellClient', () => {
  let client: MetatellClient
  let mocks: ReturnType<typeof createMockServices>
  const defaultOptions: CreateClientOptions = {
    serverUrl: 'wss://metatell.app',
    roomId: 'test-room',
    username: 'TestBot',
    avatarId: 'test-avatar-id',
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    mocks = createMockServices()

    const { CoreServiceFactory } = await import('@metatell/bot-core')
    vi.mocked(CoreServiceFactory).mockImplementation(
      () => mocks.serviceFactory as ReturnType<typeof CoreServiceFactory>,
    )

    client = createMetatellClient(defaultOptions)
  })

  describe('connect', () => {
    it('should connect to server', async () => {
      await client.connect()

      expect(mocks.connectionManager.connect).toHaveBeenCalledWith({
        serverUrl: defaultOptions.serverUrl,
        hubId: defaultOptions.roomId,
      })
    })

    it('should fetch organization avatars when avatarId is not specified', async () => {
      const optionsWithoutAvatar = { ...defaultOptions, avatarId: undefined }
      client = createMetatellClient(optionsWithoutAvatar)

      await client.connect()

      expect(mocks.organizationService.getOrganizationInfo).toHaveBeenCalled()
      expect(mocks.organizationService.fetchOrganizationAvatars).toHaveBeenCalled()
      expect(mocks.avatarController.spawn).toHaveBeenCalledWith(
        'org-avatar-1',
        undefined,
        'https://example.com/avatar1.glb',
      )
    })

    it('should throw error when no avatar is available', async () => {
      mocks.organizationService.fetchOrganizationAvatars.mockResolvedValue([])
      const optionsWithoutAvatar = { ...defaultOptions, avatarId: undefined }
      client = createMetatellClient(optionsWithoutAvatar)

      await expect(client.connect()).rejects.toThrow('Failed to connect')
    })

    it('should handle authentication errors', async () => {
      mocks.connectionManager.connect.mockRejectedValue(new Error('auth failed'))

      await expect(client.connect()).rejects.toThrow('Authentication failed')
    })

    it('should handle network errors', async () => {
      mocks.connectionManager.connect.mockRejectedValue(new Error('network error'))

      await expect(client.connect()).rejects.toThrow('Failed to connect')
    })
  })

  describe('disconnect', () => {
    it('should disconnect from server', async () => {
      await client.disconnect()
      expect(mocks.connectionManager.disconnect).toHaveBeenCalled()
    })
  })

  describe('room', () => {
    it('should get users in room', async () => {
      const users = await client.room.getUsers()

      expect(users).toHaveLength(2)
      expect(users[0]).toMatchObject({
        id: 'user1',
        name: 'User 1',
        isBot: false,
      })
    })

    it('should get nearby users', async () => {
      const users = await client.room.getNearbyUsers(10)

      expect(mocks.userAvatarManager.getUsersInRange).toHaveBeenCalledWith({ x: 0, y: 0, z: 0 }, 10)
      expect(users).toHaveLength(1)
    })

    it('should return all users when avatar is not spawned', async () => {
      mocks.avatarController.getState.mockReturnValue(null)

      const users = await client.room.getNearbyUsers(10)

      expect(users).toHaveLength(2) // Falls back to getUsers()
    })
  })

  describe('chat', () => {
    it('should send message', async () => {
      await client.chat.send('Hello world')

      expect(mocks.messageService.sendMessage).toHaveBeenCalledWith('Hello world')
    })

    it('should handle message events', async () => {
      const handler = vi.fn()
      client.chat.onMessage(handler)

      // eventBus.onの呼び出しを確認
      await vi.waitFor(() => {
        expect(mocks.eventBus.on).toHaveBeenCalled()
      })

      // Simulate message received
      const messageData = {
        type: 'chat',
        body: 'Hello bot',
        senderId: 'user1',
      }

      // 最後のeventBus.onの呼び出しを取得（chat.onMessageからのもの）
      const lastCall = mocks.eventBus.on.mock.calls[mocks.eventBus.on.mock.calls.length - 1]
      const eventHandler = lastCall?.[1]

      // イベントハンドラを手動で呼び出し
      await eventHandler?.(messageData)

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.objectContaining({
            id: 'user1',
            name: 'User 1',
          }),
          text: 'Hello bot',
          reply: expect.any(Function),
        }),
      )
    })

    it('should parse mentions in messages', async () => {
      const handler = vi.fn()
      client.chat.onMessage(handler)

      const messageData = {
        type: 'chat',
        body: '[@TestBot](test-session-id) Hello!',
        senderId: 'user1',
      }

      // 最後のeventBus.onの呼び出しを取得
      const lastCall = mocks.eventBus.on.mock.calls[mocks.eventBus.on.mock.calls.length - 1]
      const eventHandler = lastCall?.[1]
      await eventHandler?.(messageData)

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hello!',
          mention: {
            name: 'TestBot',
            sessionId: 'test-session-id',
          },
        }),
      )
    })
  })

  describe('avatar', () => {
    it('should select regular avatar', async () => {
      await client.avatar.select('new-avatar-id')

      expect(mocks.avatarController.spawn).toHaveBeenCalledWith(
        'new-avatar-id',
        {
          x: 0,
          y: 0,
          z: 0,
        },
        undefined,
      )
    })

    it('should select organization avatar with URL', async () => {
      const orgAvatarId = '69030ac8-1089-4686-82b2-1068bc4c776c'
      const avatarUrl = 'https://example.com/avatar.gltf'

      // Mock organization service responses
      mocks.organizationService.getOrganizationInfo.mockResolvedValue({
        organizationId: 'org-123',
        realmId: 'realm-123',
      })
      mocks.organizationService.fetchOrganizationAvatars.mockResolvedValue([
        {
          id: orgAvatarId,
          name: 'Test Avatar',
          gltf: { avatar: avatarUrl },
          preview_url: 'https://example.com/preview.png',
        },
      ])
      mocks.configProvider.getConfiguration.mockReturnValue({
        hubUrl: 'https://test.metatell.app',
        hubId: 'test-hub',
        profile: { displayName: 'TestBot', avatarId: '' },
      })

      await client.avatar.select(orgAvatarId)

      expect(mocks.organizationService.getOrganizationInfo).toHaveBeenCalledWith(
        'https://test.metatell.app',
        'test-hub',
      )
      expect(mocks.organizationService.fetchOrganizationAvatars).toHaveBeenCalledWith(
        'https://test.metatell.app',
        'org-123',
      )
      expect(mocks.avatarController.spawn).toHaveBeenCalledWith(
        orgAvatarId,
        {
          x: 0,
          y: 0,
          z: 0,
        },
        avatarUrl,
      )
    })

    it('should throw error for organization avatar not found', async () => {
      const orgAvatarId = '69030ac8-1089-4686-82b2-1068bc4c776c'

      mocks.organizationService.getOrganizationInfo.mockResolvedValue({
        organizationId: 'org-123',
        realmId: 'realm-123',
      })
      mocks.organizationService.fetchOrganizationAvatars.mockResolvedValue([])
      mocks.configProvider.getConfiguration.mockReturnValue({
        hubUrl: 'https://test.metatell.app',
        hubId: 'test-hub',
        profile: { displayName: 'TestBot', avatarId: '' },
      })

      await expect(client.avatar.select(orgAvatarId)).rejects.toThrow(
        `Organization avatar not found: ${orgAvatarId}`,
      )
    })

    it('should play animation by id', async () => {
      await client.avatar.play({ id: 'wave', loop: true })

      expect(mocks.avatarController.playAnimation).toHaveBeenCalledWith('wave', {
        loop: true,
        duration: undefined,
        transitionDuration: undefined,
      })
    })

    it('should throw error for URL-based animations', async () => {
      await expect(
        client.avatar.play({ url: 'https://example.com/animation.fbx' }),
      ).rejects.toThrow('URL-based animations are not yet supported')
    })

    it('should throw error for invalid animation', async () => {
      await expect(
        client.avatar.play({} as Parameters<typeof client.avatar.play>[0]),
      ).rejects.toThrow('Animation must have either id or url')
    })

    it('should move to position', async () => {
      await client.avatar.moveTo({ x: 10, y: 0, z: 5 })

      expect(mocks.avatarController.move).toHaveBeenCalledWith({ x: 10, y: 0, z: 5 })
    })

    it('should rotate to euler angles', async () => {
      await client.avatar.rotateTo({ x: 0, y: 90, z: 0 })

      // クォータニオンに変換されているか確認
      expect(mocks.avatarController.rotate).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 0,
          y: expect.closeTo(Math.SQRT1_2, 3),
          z: 0,
          w: expect.closeTo(Math.SQRT1_2, 3),
        }),
      )
    })

    it('should look at target', async () => {
      await client.avatar.lookAt({ x: 10, y: 0, z: 0 })

      expect(mocks.avatarController.rotate).toHaveBeenCalled()
    })

    it('should throw error when avatar not spawned for lookAt', async () => {
      mocks.avatarController.getState.mockReturnValue(null)

      await expect(client.avatar.lookAt({ x: 10, y: 0, z: 0 })).rejects.toThrow(
        'Avatar is not spawned',
      )
    })

    it('should get position', () => {
      const position = client.avatar.getPosition()

      expect(position).toEqual({ x: 0, y: 0, z: 0 })
    })

    it('should return null when avatar not spawned', () => {
      mocks.avatarController.getState.mockReturnValue(null)

      const position = client.avatar.getPosition()

      expect(position).toBeNull()
    })

    it('should get available assets', async () => {
      const assets = await client.avatar.getAvailableAssets()

      expect(assets).toHaveLength(1)
      expect(assets[0]).toMatchObject({
        id: 'org-avatar-1',
        name: 'Organization Avatar 1',
        thumbnailUrl: 'https://example.com/preview1.jpg',
        modelUrl: 'https://example.com/avatar1.glb',
      })
    })

    it('should get available animations', async () => {
      const animations = await client.avatar.getAvailableAnimations()

      expect(animations).toHaveLength(2)
      expect(animations[0]).toMatchObject({
        id: 'anim1',
        name: 'Animation 1',
        duration: 1000,
      })
    })
  })

  describe('voice', () => {
    it('should play PCM data', async () => {
      const pcmData = new Int16Array([0, 1, 2, 3])
      const controls = await client.voice.playPcm(pcmData, {
        sampleRate: 48000,
        channels: 1,
      })

      expect(controls.stop).toBeDefined()
      expect(controls.finished).toBeDefined()
    })
  })

  describe('getInfo', () => {
    it('should return bot info', async () => {
      const info = await client.getInfo()

      expect(info).toMatchObject({
        name: 'TestBot',
        version: '1.0.0',
        roomId: 'test-room',
        sessionId: 'test-session-id',
      })
    })
  })

  describe('getStatus', () => {
    it('should return connection status', () => {
      const status = client.getStatus()

      expect(status).toEqual({
        connected: true,
        connecting: false,
      })
    })
  })

  describe('getUsers', () => {
    it('should return users synchronously', () => {
      const users = client.getUsers()

      expect(users).toHaveLength(2)
      expect(users[0]).toMatchObject({
        id: 'user1',
        name: 'User 1',
        isBot: false,
      })
    })

    it('should include self position from avatar controller', () => {
      mocks.connectionManager.getSessionId.mockReturnValue('user1')

      const users = client.getUsers()
      const self = users.find((u) => u.id === 'user1')

      expect(self?.position).toEqual({ x: 0, y: 0, z: 0 })
    })
  })

  describe('rate limiting', () => {
    it('should get rate limit', () => {
      const rate = client.getRateLimit('messages')
      expect(rate).toBeUndefined() // Default is undefined
    })

    it('should set rate limit', () => {
      client.setRateLimit('messages', 5)
      const rate = client.getRateLimit('messages')
      expect(rate).toBe(5)
    })
  })

  describe('getSessionId', () => {
    it('should return session ID', () => {
      const sessionId = client.getSessionId()
      expect(sessionId).toBe('test-session-id')
    })
  })

  describe('event handling', () => {
    it('should emit connected event', () => {
      const handler = vi.fn()
      client.on('connected', handler)

      // Trigger connection established event
      const eventHandler = mocks.eventBus.on.mock.calls.find(
        (call) => call[0] === 'connection:established',
      )?.[1]
      eventHandler?.()

      expect(handler).toHaveBeenCalled()
    })

    it('should emit disconnected event', () => {
      const handler = vi.fn()
      client.on('disconnected', handler)

      // Trigger connection lost event
      const eventHandler = mocks.eventBus.on.mock.calls.find(
        (call) => call[0] === 'connection:lost',
      )?.[1]
      eventHandler?.()

      expect(handler).toHaveBeenCalled()
    })

    it('should emit user-join event', () => {
      const handler = vi.fn()
      client.on('user-join', handler)

      // Trigger user joined event
      const eventHandler = mocks.eventBus.on.mock.calls.find(
        (call) => call[0] === 'user:joined',
      )?.[1]
      eventHandler?.({
        id: 'new-user',
        profile: { displayName: 'New User' },
      })

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new-user',
          name: 'New User',
          isBot: false,
        }),
      )
    })

    it('should resync avatar when new user joins', () => {
      // Trigger user joined event
      const eventHandler = mocks.eventBus.on.mock.calls.find(
        (call) => call[0] === 'user:joined',
      )?.[1]
      eventHandler?.({
        id: 'new-user',
        profile: { displayName: 'New User' },
      })

      expect(mocks.avatarController.resyncAvatar).toHaveBeenCalled()
    })

    it('should emit user-leave event', () => {
      const handler = vi.fn()
      client.on('user-leave', handler)

      // Trigger user left event
      const eventHandler = mocks.eventBus.on.mock.calls.find((call) => call[0] === 'user:left')?.[1]
      eventHandler?.({
        id: 'leaving-user',
        profile: { displayName: 'Leaving User' },
      })

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'leaving-user',
          name: 'Leaving User',
          isBot: false,
        }),
      )
    })

    it('should emit chat-message event', () => {
      const handler = vi.fn()
      client.on('chat-message', handler)

      // Trigger message received event
      const eventHandler = mocks.eventBus.on.mock.calls.find(
        (call) => call[0] === 'message:received',
      )?.[1]
      eventHandler?.({
        type: 'chat',
        body: 'Test message',
        senderId: 'user1',
      })

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.objectContaining({
            id: 'user1',
            name: 'User 1',
          }),
          text: 'Test message',
        }),
      )
    })

    it('should handle off method', () => {
      const handler = vi.fn()
      client.on('connected', handler)
      client.off('connected', handler)

      // EventEmitter internally tracks listeners, just verify method exists
      expect(client.off).toBeDefined()
    })
  })

  describe('debug mode', () => {
    it('should enable debug mode', () => {
      const debugOptions: CreateClientOptions = {
        ...defaultOptions,
        debug: true,
      }

      client = createMetatellClient(debugOptions)

      expect(process.env.DEBUG).toBe('metatell:*')
      expect(mocks.appSettings.setLogLevel).toHaveBeenCalledWith('debug')
      expect(mocks.appSettings.setDebugMode).toHaveBeenCalledWith(true)
    })
  })
})
