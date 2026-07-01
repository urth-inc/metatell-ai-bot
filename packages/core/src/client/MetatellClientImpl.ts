import { EventEmitter } from 'node:events'
import { CoreServiceFactory } from '../CoreServiceFactory.js'
import { AnimationService, type IAnimationService } from '../interfaces/IAnimationService.js'
import { AppSettings } from '../interfaces/IAppSettings.js'
import { AvatarController, type IAvatarController } from '../interfaces/IAvatarController.js'
import {
  ConfigurationProvider,
  type IConfigurationProvider,
} from '../interfaces/IConfigurationProvider.js'
import { ConnectionManager, type IConnectionManager } from '../interfaces/IConnectionManager.js'
import { EventBus, type IEventBus, SystemEvents } from '../interfaces/IEventBus.js'
import { type IMessageService, MessageService } from '../interfaces/IMessageService.js'
import {
  type IOrganizationService,
  OrganizationService,
} from '../interfaces/IOrganizationService.js'
import { type IPresenceManager, PresenceManager } from '../interfaces/IPresenceManager.js'
import { type IUserAvatarManager, UserAvatarManager } from '../interfaces/IUserAvatarManager.js'
import { getLogger } from '../logging/index.js'
import type { Logger } from '../logging/spi.js'
import type {
  Animation,
  AvatarAsset,
  BotInfo,
  Euler,
  MetatellClient,
  MetatellClientEvents,
  PcmInputOptions,
  PlaybackControls,
  User,
  Vec3,
} from '../types/client.js'

// Rate limiting classes (these might need to be moved to core too)
class RateLimitedQueue {
  private rates = new Map<string, number>()

  async execute(_key: string, fn: () => Promise<void>): Promise<void> {
    // Simple rate limiting implementation.
    await fn()
  }

  getRate(key: string): number | undefined {
    return this.rates.get(key)
  }

  setRate(key: string, rate: number): void {
    this.rates.set(key, rate)
  }
}

// Error types
export class MetatellError extends Error {
  constructor(
    public code: string,
    message: string,
    public cause?: unknown,
  ) {
    super(message)
    this.name = 'MetatellError'
  }
}

export class AuthError extends MetatellError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, cause)
    this.name = 'AuthError'
  }
}

export class NetworkError extends MetatellError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, cause)
    this.name = 'NetworkError'
  }
}

export class NotFoundError extends MetatellError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, cause)
    this.name = 'NotFoundError'
  }
}

// Message event data type
interface MessageEventData {
  type: string
  body?: string
  senderId?: string
}

// Fallback used when neither an organization avatar nor avatarId can be resolved.
// Because this is not a UUID, spawn treats it as a personal avatar from storage and keeps the connection alive.
const DEFAULT_FALLBACK_AVATAR_ID = 'default'

// Create client options
export interface CreateClientOptions {
  serverUrl: string
  roomId: string
  token?: string
  username?: string
  avatarId?: string
  /** GLTF URL passed to spawn when avatarId is an organization avatar UUID. */
  avatarSrc?: string
  /** Fallback avatar ID used when neither an organization avatar nor avatarId is available. Non-UUID values are treated as personal avatars. */
  defaultAvatarId?: string
  debug?: boolean
}

/**
 * MetatellClient implementation
 */
export class MetatellClientImpl extends EventEmitter implements MetatellClient {
  private serviceFactory: CoreServiceFactory
  private connectionManager: IConnectionManager
  private messageService: IMessageService
  private avatarController: IAvatarController
  private presenceManager: IPresenceManager
  private organizationService: IOrganizationService
  private animationService: IAnimationService
  private eventBus: IEventBus
  private configProvider: IConfigurationProvider
  private userAvatarManager: IUserAvatarManager
  private rateLimiter = new RateLimitedQueue()
  private logger: Logger
  private orgAvatarUrlCache = new Map<string, string>()
  private voiceMuted = false

  constructor(private options: CreateClientOptions) {
    super()

    // Initialize logger
    this.logger = getLogger('MetatellClient')

    // Enable logging in debug mode.
    if (options.debug) {
      process.env.DEBUG = 'metatell:*'
    }

    // Initialize CoreServiceFactory.
    this.serviceFactory = new CoreServiceFactory({
      serverUrl: options.serverUrl,
      hubUrl: options.serverUrl.replace(/^ws/, 'http'), // Convert WebSocket URL to HTTP URL.
      hubId: options.roomId,
      profile: {
        displayName: options.username || 'MetatellBot',
        avatarId: options.avatarId || '', // Resolved from the organization avatar later.
      },
      botAccessKey: options.token,
      debug: options.debug || false,
    })

    // Resolve required services.
    const container = this.serviceFactory.getContainer()
    this.connectionManager = container.get(ConnectionManager) as IConnectionManager
    this.messageService = container.get(MessageService) as IMessageService
    this.avatarController = container.get(AvatarController) as IAvatarController
    this.presenceManager = container.get(PresenceManager) as IPresenceManager
    this.userAvatarManager = container.get(UserAvatarManager) as IUserAvatarManager
    this.organizationService = container.get(OrganizationService) as IOrganizationService
    this.animationService = container.get(AnimationService) as IAnimationService
    this.eventBus = container.get(EventBus) as IEventBus
    this.configProvider = container.get(ConfigurationProvider) as IConfigurationProvider

    // Update AppSettings log level in debug mode.
    if (options.debug) {
      const appSettings = container.get(AppSettings)
      ;(appSettings as unknown as { setLogLevel: (level: string) => void }).setLogLevel('debug')
      ;(appSettings as unknown as { setDebugMode: (enabled: boolean) => void }).setDebugMode(true)
    }

    // Set up event proxies.
    this.setupEventProxies()

    // Voice mute state synchronization
    this.eventBus.on('voice:mute-changed', ({ muted }: { muted: boolean }) => {
      this.applyVoiceMute(muted)
    })
  }

  /**
   * Parse mention from message body
   * Format: `[@displayName](session-id) message`
   * Example: `[@MetatellCLI](b754ca96-d395-4b80-adb1-77cb0240a43d) hello`
   */
  private parseMessageMention(body: string): {
    text: string
    mention?: {
      sessionId: string
      name: string
    }
  } {
    const mentionPattern = /\[@([^\]]+)\]\(([^)]+)\)\s*(.*)$/
    const match = body.match(mentionPattern)

    if (match) {
      return {
        text: match[3].trim(),
        mention: {
          name: match[1],
          sessionId: match[2],
        },
      }
    }

    return { text: body }
  }

  private setupEventProxies(): void {
    // Map core events to client events.
    this.eventBus.on(SystemEvents.CONNECTION_ESTABLISHED, () => {
      this.emit('connected')
    })

    this.eventBus.on(SystemEvents.CONNECTION_LOST, () => {
      this.emit('disconnected')
    })

    this.eventBus.on(SystemEvents.MESSAGE_RECEIVED, (data: unknown) => {
      const messageData = data as MessageEventData
      this.emit('message', messageData)

      // For chat messages, parse detailed information and emit a separate event.
      if (messageData.type === 'chat' && messageData.body) {
        const parsed = this.parseMessageMention(messageData.body)

        // Get sender information from PresenceManager.
        const users = this.presenceManager.getUsers()
        const sender = users.find((u) => u.id === messageData.senderId)

        // Debug information.
        if (this.options.debug) {
          this.logger.debug('Message sender lookup:', {
            senderId: messageData.senderId,
            foundSender: !!sender,
            senderData: sender,
            allUsers: users.map((u) => ({ id: u.id, name: u.profile?.displayName })),
          })
        }

        const senderName = sender?.profile?.displayName || sender?.id.split('#')[0] || 'Unknown'

        this.emit('chat-message', {
          from: {
            id: messageData.senderId || '',
            name: senderName,
            isBot: false,
          },
          text: parsed.text,
          mention: parsed.mention,
        })
      }
    })

    this.eventBus.on(SystemEvents.USER_JOINED, (data: unknown) => {
      // Convert PresenceUser data to the User type.
      const presenceUser = data as import('../interfaces/IPresenceManager.js').PresenceUser
      // Get avatar information from UserAvatarManager.
      const avatar = this.userAvatarManager.getUser(presenceUser.id)

      const user: User = {
        id: presenceUser.id,
        name: presenceUser.profile?.displayName || presenceUser.id.split('#')[0] || presenceUser.id,
        isBot: false,
        position: avatar?.position,
        rotation: avatar?.rotation,
      }
      this.emit('user-join', user)
      // Resync the avatar when a new user enters the room.
      this.resyncAvatarForNewUser()
    })

    this.eventBus.on(SystemEvents.USER_LEFT, (data: unknown) => {
      // Convert PresenceUser data to the User type.
      const presenceUser = data as import('../interfaces/IPresenceManager.js').PresenceUser
      // Get avatar information from UserAvatarManager.
      const avatar = this.userAvatarManager.getUser(presenceUser.id)

      const user: User = {
        id: presenceUser.id,
        name: presenceUser.profile?.displayName || presenceUser.id.split('#')[0] || presenceUser.id,
        isBot: false,
        position: avatar?.position,
        rotation: avatar?.rotation,
      }
      this.emit('user-leave', user)
    })
  }

  private async resyncAvatarForNewUser(): Promise<void> {
    try {
      // Resync only when the avatar has been spawned.
      if (this.avatarController.getState()) {
        await this.avatarController.resyncAvatar()
        this.logger.debug('Avatar resynced for new user')
      }
    } catch (error) {
      this.logger.warn('Failed to resync avatar for new user', error)
    }
  }

  async connect(): Promise<void> {
    try {
      await this.connectionManager.connect({
        serverUrl: this.options.serverUrl,
        hubId: this.options.roomId,
      })

      // Fetch organization information.
      const orgInfo = await this.organizationService.getOrganizationInfo(
        this.options.serverUrl.replace(/^ws/, 'http'),
        this.options.roomId,
      )

      // Select an organization avatar when no avatar ID is specified.
      let avatarId = this.options.avatarId
      // Explicit GLTF URL passed to spawn when an organization avatar UUID is provided directly.
      let avatarUrl: string | undefined = this.options.avatarSrc

      if (!avatarId && orgInfo.organizationId) {
        try {
          // Fetch organization avatars.
          const avatars = await this.organizationService.fetchOrganizationAvatars(
            this.options.serverUrl.replace(/^ws/, 'http'),
            orgInfo.organizationId,
          )

          if (avatars.length > 0) {
            // Use the first avatar.
            const defaultAvatar = avatars[0]
            avatarId = defaultAvatar.id
            avatarUrl = defaultAvatar.gltf.avatar
          }
        } catch (error) {
          // Continue if organization avatar fetching fails.
          this.logger.debug('Failed to fetch organization avatars', error)
        }
      }

      // Fall back to the default avatar when no organization avatar or avatarId is available.
      // Non-UUID IDs are treated as personal avatars, so spawn builds a storage URL and keeps connecting.
      if (!avatarId) {
        avatarId = this.options.defaultAvatarId ?? DEFAULT_FALLBACK_AVATAR_ID
        this.logger.warn(
          'No organization avatar found and no avatarId specified; falling back to default avatar',
          { avatarId },
        )
      }

      // Spawn the avatar.
      if (avatarId) {
        // Update configuration.
        const config = this.configProvider.getConfiguration()
        config.profile.avatarId = avatarId
        if (avatarUrl) {
          config.organizationAvatarUrl = avatarUrl
        }

        await this.avatarController.spawn(avatarId, undefined, avatarUrl)
      }

      // Move from the lobby into the room.
      const hubChannel = this.connectionManager.getHubChannel()
      if (hubChannel) {
        hubChannel.push('events:entering', {})
        hubChannel.push('events:entered', {
          initialOccupantCount: 0,
          isNewDaily: true,
          isNewMonthly: true,
          isNewDayWindow: true,
          isNewMonthWindow: true,
          entryDisplayType: 'Bot',
          userAgent: 'MetatellBot/1.0',
        })
      }
    } catch (error) {
      // Convert the error to the appropriate type.
      if (error instanceof Error && error.message.includes('auth')) {
        throw new AuthError('AUTH_FAILED', 'Authentication failed', error)
      }
      throw new NetworkError('CONNECTION_FAILED', 'Failed to connect', error)
    }
  }

  async disconnect(): Promise<void> {
    await this.connectionManager.disconnect()
  }

  readonly room = {
    getUsers: async (): Promise<User[]> => {
      return this.buildUserList()
    },

    getNearbyUsers: async (radius: number = 10): Promise<User[]> => {
      // Get the current avatar position.
      const currentPosition = this.avatar.getPosition()
      if (!currentPosition) {
        // Return all users when the avatar has not been spawned.
        return this.room.getUsers()
      }

      // Get users within range from UserAvatarManager.
      const nearbyAvatars = this.userAvatarManager.getUsersInRange(currentPosition, radius)

      // Convert UserAvatar values to the User type.
      return nearbyAvatars.map((avatar) => ({
        id: avatar.id,
        name: avatar.nickname || avatar.id.split('#')[0] || avatar.id,
        isBot: false,
        position: avatar.position,
        rotation: avatar.rotation,
      }))
    },
  }

  readonly chat = {
    send: async (text: string): Promise<void> => {
      await this.rateLimiter.execute('messages', async () => {
        await this.messageService.sendMessage(text)
      })
    },

    onMessage: (
      handler: (event: {
        from: User
        text: string
        mention?: {
          sessionId: string
          name: string
        }
        reply: (text: string) => Promise<void>
      }) => void,
    ): void => {
      // Subscribe to message received events.
      this.eventBus.on(SystemEvents.MESSAGE_RECEIVED, async (data: unknown) => {
        const messageData = data as MessageEventData

        if (messageData.type === 'chat' && messageData.body) {
          const parsed = this.parseMessageMention(messageData.body)

          // Get sender information from PresenceManager.
          const users = this.presenceManager.getUsers()
          const sender = users.find((u) => u.id === messageData.senderId)
          const senderName = sender?.profile?.displayName || sender?.id.split('#')[0] || 'Unknown'

          const user: User = {
            id: messageData.senderId || '',
            name: senderName,
            isBot: false,
          }

          handler({
            from: user,
            text: parsed.text,
            mention: parsed.mention,
            reply: async (replyText: string) => {
              await this.messageService.sendMessage(replyText)
            },
          })
        }
      })
    },
  }

  readonly avatar = {
    select: async (assetId: string): Promise<void> => {
      // Changing avatars requires calling spawn again.
      const state = this.avatarController.getState()

      try {
        // Try spawning as a regular avatar first.
        await this.avatarController.spawn(assetId, state?.position)
      } catch (error) {
        // Treat it as an organization avatar only when avatarSrc is required.
        if (
          error instanceof Error &&
          error.message.includes('Organization avatar requires avatarSrc URL')
        ) {
          // Check the cache.
          let avatarSrc = this.orgAvatarUrlCache.get(assetId)

          if (!avatarSrc) {
            // Fetch from OrganizationService when the URL is not cached.
            const hubUrl = this.configProvider.getConfiguration().hubUrl
            const orgInfo = await this.organizationService.getOrganizationInfo(
              hubUrl,
              this.configProvider.getConfiguration().hubId,
            )

            if (!orgInfo.organizationId) {
              throw new Error(`Cannot fetch organization avatars: organization ID not found`)
            }

            const avatars = await this.organizationService.fetchOrganizationAvatars(
              hubUrl,
              orgInfo.organizationId,
            )
            const targetAvatar = avatars.find((a) => a.id === assetId)

            if (!targetAvatar) {
              throw new Error(`Organization avatar not found: ${assetId}`)
            }

            avatarSrc = targetAvatar.gltf.avatar
            // Save the URL to the cache.
            this.orgAvatarUrlCache.set(assetId, avatarSrc)
            this.logger.debug('Cached organization avatar URL', { assetId, avatarSrc })
          } else {
            this.logger.debug('Using cached organization avatar URL', { assetId, avatarSrc })
          }

          // Retry spawn with avatarSrc.
          await this.avatarController.spawn(assetId, state?.position, avatarSrc)
        } else {
          // Re-throw all other errors.
          throw error
        }
      }
    },

    play: async (animation: Animation): Promise<void> => {
      try {
        // Convert animation options.
        const playOptions = {
          loop: animation.loop || false,
          duration: animation.duration,
          transitionDuration: animation.transitionDuration,
        }

        if ('id' in animation && animation.id) {
          await this.avatarController.playAnimation(animation.id, playOptions)
        } else if ('url' in animation && animation.url) {
          // URL-based animations are not supported by the current interface.
          // They must be handled as custom animations.
          throw new NotFoundError(
            'ANIMATION_NOT_FOUND',
            'URL-based animations are not yet supported',
          )
        } else {
          throw new NotFoundError('ANIMATION_NOT_FOUND', 'Animation must have either id or url')
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          throw new NotFoundError('ANIMATION_NOT_FOUND', error.message, error)
        }
        throw error
      }
    },

    moveTo: async (position: Vec3): Promise<void> => {
      await this.rateLimiter.execute('moves', async () => {
        await this.avatarController.move(position)
      })
    },

    rotateTo: async (rotation: Euler): Promise<void> => {
      // Convert Euler angles in degrees to radians.
      const xRad = (rotation.x * Math.PI) / 180
      const yRad = (rotation.y * Math.PI) / 180
      const zRad = (rotation.z * Math.PI) / 180

      // Convert Euler angles to a quaternion in ZYX order.
      const cx = Math.cos(xRad / 2)
      const sx = Math.sin(xRad / 2)
      const cy = Math.cos(yRad / 2)
      const sy = Math.sin(yRad / 2)
      const cz = Math.cos(zRad / 2)
      const sz = Math.sin(zRad / 2)

      const quaternion = {
        x: sx * cy * cz - cx * sy * sz,
        y: cx * sy * cz + sx * cy * sz,
        z: cx * cy * sz - sx * sy * cz,
        w: cx * cy * cz + sx * sy * sz,
      }

      // Use the AvatarController rotate method.
      await this.avatarController.rotate(quaternion)
    },

    lookAt: async (target: Vec3): Promise<void> => {
      await this.rateLimiter.execute('looks', async () => {
        // Get the current position.
        const state = this.avatarController.getState()
        if (!state) {
          throw new MetatellError('AVATAR_NOT_SPAWNED', 'Avatar is not spawned')
        }

        // Calculate the direction vector to the target.
        const dx = target.x - state.position.x
        const dz = target.z - state.position.z

        // Calculate the rotation angle around the Y axis in radians.
        const yRotation = Math.atan2(dx, dz)

        // Convert radians to a quaternion for Y-axis rotation only.
        const halfAngle = yRotation / 2
        const quaternion = {
          x: 0,
          y: Math.sin(halfAngle),
          z: 0,
          w: Math.cos(halfAngle),
        }

        // Apply the rotation.
        await this.avatarController.rotate(quaternion)
      })
    },

    getPosition: (): Vec3 | null => {
      const state = this.avatarController.getState()
      return state ? { ...state.position } : null
    },

    getAvailableAssets: async (): Promise<AvatarAsset[]> => {
      // hubUrl and hubId are required to fetch organizationInfo.
      const config = this.configProvider.getConfiguration()
      const orgInfo = await this.organizationService.getOrganizationInfo(
        config.hubUrl,
        config.hubId,
      )
      if (!orgInfo.organizationId) {
        // Return an empty array when no organization ID is available.
        return []
      }

      const avatars = await this.organizationService.fetchOrganizationAvatars(
        config.hubUrl,
        orgInfo.organizationId,
      )
      return avatars.map((avatar) => ({
        id: avatar.id,
        name: avatar.name,
        thumbnailUrl: avatar.images?.preview?.url || avatar.thumbnail_url || '',
        modelUrl: avatar.gltf.avatar,
      }))
    },

    getAvailableAnimations: async (): Promise<Animation[]> => {
      // Get the current avatar ID.
      const state = this.avatarController.getState()
      if (!state) {
        return []
      }

      this.logger.debug('Getting available animations for avatar', { avatarId: state.avatarId })

      const animations = await this.animationService.getAvailableAnimations(state.avatarId)

      this.logger.debug('Retrieved animations', {
        avatarId: state.avatarId,
        animationCount: animations.length,
        animations: animations.map((a) => ({ id: a.id, name: a.name })),
      })

      return animations.map((anim) => ({
        id: anim.id,
        name: anim.name || 'Unknown Animation',
        duration: anim.duration,
      }))
    },
  }

  readonly voice = {
    playPcm: async (_input: unknown, _options: PcmInputOptions): Promise<PlaybackControls> => {
      // Voice features are implemented in a separate package, @metatell/realtime.
      // Return a placeholder here.
      const finishedPromise = new Promise<void>((resolve) => {
        setTimeout(resolve, 1000)
      })

      return {
        stop: async () => {
          // Audio stopping is implemented in a separate package.
        },
        finished: finishedPromise,
      }
    },
  }

  async getInfo(): Promise<BotInfo> {
    const config = this.configProvider.getConfiguration()
    const sessionId = this.getSessionId()
    return {
      name: config.profile?.displayName || 'MetatellBot',
      version: '1.0.0',
      roomId: config.hubId,
      sessionId: sessionId || undefined,
    }
  }

  private buildUserList(): User[] {
    const users = this.presenceManager.getUsers()
    const currentSessionId = this.connectionManager.getSessionId()

    return users.map((u) => {
      if (u.id === currentSessionId) {
        const avatarState = this.avatarController.getState()
        return {
          id: u.id,
          name: u.profile?.displayName || u.id.split('#')[0] || u.id,
          isBot: false,
          position: avatarState?.position,
          rotation: avatarState?.rotation
            ? {
                x: (avatarState.rotation.x * 180) / Math.PI,
                y: (avatarState.rotation.y * 180) / Math.PI,
                z: (avatarState.rotation.z * 180) / Math.PI,
                w: 1, // Simplified.
              }
            : undefined,
        }
      }

      const avatar = this.userAvatarManager.getUser(u.id)

      return {
        id: u.id,
        name: u.profile?.displayName || u.id.split('#')[0] || u.id,
        isBot: false,
        position: avatar?.position,
        rotation: avatar?.rotation,
      }
    })
  }

  getStatus(): { connected: boolean; connecting: boolean } {
    const sessionId = this.connectionManager.getSessionId()
    return {
      connected: !!sessionId,
      connecting: !sessionId,
    }
  }

  getUsers(): User[] {
    return this.buildUserList()
  }

  getRateLimit(key: 'messages' | 'moves' | 'looks'): number | undefined {
    return this.rateLimiter.getRate(key)
  }

  setRateLimit(key: 'messages' | 'moves' | 'looks', perSecond: number): void {
    this.rateLimiter.setRate(key, perSecond)
  }

  getSessionId(): string | null {
    // Get the session ID from the connection manager.
    return this.connectionManager.getSessionId()
  }

  private applyVoiceMute(muted: boolean): void {
    if (this.voiceMuted === muted) {
      // Do nothing when the state has not changed.
      return
    }

    this.voiceMuted = muted
    this.logger.info(`Voice ${muted ? 'muted' : 'unmuted'}`)

    // Notify as a client event.
    this.emit('voice:mute-changed', { muted })
  }

  async muteVoice(muted: boolean): Promise<void> {
    this.logger.debug('Voice mute requested', { muted })
    // Only emit to the event bus; state and public event are updated via subscription
    this.eventBus.emit('voice:mute-changed', { muted })
  }

  async sendVoiceFrame(_pcm: Int16Array): Promise<void> {
    if (this.voiceMuted) {
      this.logger.debug('Ignoring voice frame because microphone is muted')
      return
    }

    // The implementation is patched at runtime by an external package.
    throw new Error('Voice functionality not available - enable voice first with enableVoice()')
  }

  // Override EventEmitter methods.
  on<E extends keyof MetatellClientEvents>(event: E, listener: MetatellClientEvents[E]): this {
    // EventEmitter expects generic types, so casting is required.
    // Cast the event to string and treat the listener as a function.
    return super.on(event as string, listener as (...args: unknown[]) => void)
  }

  off<E extends keyof MetatellClientEvents>(event: E, listener: MetatellClientEvents[E]): this {
    // EventEmitter expects generic types, so casting is required.
    return super.off(event as string, listener as (...args: unknown[]) => void)
  }
}

/**
 * Create MetatellClient instance
 * @param options Client configuration
 * @returns MetatellClient instance
 * @throws {MetatellError} If configuration is invalid
 */
export function createMetatellClient(options: CreateClientOptions): MetatellClient {
  // Validate configuration.
  if (!options.serverUrl || !options.roomId) {
    throw new MetatellError('INVALID_CONFIG', 'serverUrl and roomId are required')
  }

  return new MetatellClientImpl(options)
}
