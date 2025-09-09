/**
 * Test for MetatellClient implementation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type CreateClientOptions,
  createMetatellClient,
  type MetatellClient,
  MetatellClientImpl,
} from './MetatellClientImpl.js'

// Mock the logging system
vi.mock('../logging/index.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Mock the CoreServiceFactory and related dependencies
vi.mock('../CoreServiceFactory.js', () => ({
  CoreServiceFactory: vi.fn(),
}))

// Import service classes for mocking
vi.mock('../interfaces/IConnectionManager.js', () => ({
  ConnectionManager: vi.fn(),
}))

vi.mock('../interfaces/IMessageService.js', () => ({
  MessageService: vi.fn(),
}))

vi.mock('../interfaces/IAvatarController.js', () => ({
  AvatarController: vi.fn(),
}))

vi.mock('../interfaces/IPresenceManager.js', () => ({
  PresenceManager: vi.fn(),
}))

vi.mock('../interfaces/IOrganizationService.js', () => ({
  OrganizationService: vi.fn(),
}))

vi.mock('../interfaces/IAnimationService.js', () => ({
  AnimationService: vi.fn(),
}))

vi.mock('../interfaces/IEventBus.js', () => ({
  EventBus: vi.fn(),
}))

vi.mock('../interfaces/IConfigurationProvider.js', () => ({
  ConfigurationProvider: vi.fn(),
}))

vi.mock('../interfaces/IUserAvatarManager.js', () => ({
  UserAvatarManager: vi.fn(),
}))

vi.mock('../interfaces/IAppSettings.js', () => ({
  AppSettings: vi.fn(),
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
      // Map service classes to mock instances
      const serviceMap = new Map([
        ['ConnectionManager', connectionManager],
        ['MessageService', messageService],
        ['AvatarController', avatarController],
        ['PresenceManager', presenceManager],
        ['OrganizationService', organizationService],
        ['AnimationService', animationService],
        ['EventBus', eventBus],
        ['ConfigurationProvider', configProvider],
        ['UserAvatarManager', userAvatarManager],
        ['AppSettings', appSettings],
      ])

      // Get service name from constructor function
      const serviceName = serviceType?.name || serviceType
      return serviceMap.get(serviceName)
    }),
  }

  const serviceFactory = {
    getContainer: vi.fn().mockReturnValue(container),
  }

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

  it('should create client with valid options', () => {
    const client = createMetatellClient({
      serverUrl: 'wss://test.metatell.app',
      roomId: 'test-room',
    })
    expect(client).toBeInstanceOf(MetatellClientImpl)
    expect(client.connect).toBeDefined()
    expect(client.disconnect).toBeDefined()
  })

  it('should process subdomain in serverUrl', () => {
    const client = createMetatellClient({
      serverUrl: 'wss://subdomain.metatell.app',
      roomId: 'test-room',
    })
    expect(client).toBeInstanceOf(MetatellClientImpl)
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

    const { CoreServiceFactory } = await import('../CoreServiceFactory.js')
    vi.mocked(CoreServiceFactory).mockImplementation(
      () => mocks.serviceFactory as ReturnType<typeof CoreServiceFactory>,
    )

    client = createMetatellClient(defaultOptions)
  })

  describe('basic functionality', () => {
    it('should have required methods', () => {
      expect(client.connect).toBeDefined()
      expect(client.disconnect).toBeDefined()
      expect(client.getSessionId).toBeDefined()
      expect(client.muteVoice).toBeDefined()
      expect(client.sendVoiceFrame).toBeDefined()
    })

    it('should implement VoiceCapableClient interface', () => {
      expect(typeof client.getSessionId).toBe('function')
      expect(typeof client.muteVoice).toBe('function')
      expect(typeof client.sendVoiceFrame).toBeDefined()
    })
  })

  describe('getSessionId', () => {
    it('should return session ID', () => {
      const sessionId = client.getSessionId()
      expect(sessionId).toBe('test-session-id')
    })
  })

  describe('voice methods', () => {
    it('should implement muteVoice method', async () => {
      if (client.muteVoice) {
        await expect(client.muteVoice(true)).resolves.not.toThrow()
        await expect(client.muteVoice(false)).resolves.not.toThrow()
      }
    })

    it('should throw error for sendVoiceFrame when not enabled', async () => {
      const pcmData = new Int16Array([1, 2, 3, 4])
      if (client.sendVoiceFrame) {
        await expect(client.sendVoiceFrame(pcmData)).rejects.toThrow(
          'Voice functionality not available',
        )
      }
    })
  })
})
