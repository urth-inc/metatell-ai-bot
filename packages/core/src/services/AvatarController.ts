import { v4 as uuidv4 } from 'uuid'
import { NafMessageBuilder } from '../builders/NafMessageBuilder.js'
import { AnimationNotFoundError, AvatarNotSpawnedError } from '../errors/animation-errors.js'
import type { IAnimationService } from '../interfaces/IAnimationService.js'
import type {
  AvatarPose,
  AvatarState,
  IAvatarController,
  Position,
  Rotation,
} from '../interfaces/IAvatarController.js'
import type { IConfigurationProvider } from '../interfaces/IConfigurationProvider.js'
import { type IEventBus, SystemEvents } from '../interfaces/IEventBus.js'
import type { IMessageService } from '../interfaces/IMessageService.js'
import { getLogger } from '../logging/index.js'
import type { AnimationPlaybackResult, AnimationPlayOptions } from '../types/animation.js'
import { quaternionToEulerDegrees, type RemoteAvatarComponents } from '../types/remote-avatar.js'

// Constants for default values
const DEFAULT_TEMPLATE = '#remote-avatar'
const DEFAULT_AVATAR_TYPE = 'skinnable'
const ORGANIZATION_AVATAR_TYPE = 'avatar-bot'

export class AvatarController implements IAvatarController {
  private state: AvatarState | null = null
  private sessionId: string | null = null
  private currentAnimation: string | null = null
  private logger = getLogger('AvatarController')

  constructor(
    private messageService: IMessageService,
    private configProvider: IConfigurationProvider,
    private eventBus: IEventBus,
    private animationService?: IAnimationService,
  ) {
    // Listen for room joined to get session ID
    this.eventBus.on(SystemEvents.ROOM_JOINED, (data: unknown) => {
      this.sessionId = (data as { session_id: string }).session_id
    })
  }

  async spawn(
    avatarId: string,
    position?: Position,
    avatarSrc?: string,
    pose?: Partial<AvatarPose>,
  ): Promise<void> {
    if (!this.sessionId) {
      throw new Error('Cannot spawn avatar: Not connected to room')
    }

    this.logger.debug('spawn() called with parameters:', {
      avatarId,
      position,
      avatarSrc,
    })

    const config = this.configProvider.getConfiguration()
    const timestamp = Date.now()
    const networkId = this.sessionId
    const spawnPosition = position || { x: 0, y: 0.2, z: 0 }

    // Determine avatar source URL
    let finalAvatarSrc: string
    if (avatarSrc) {
      // Use provided avatar source URL (organization avatar GLTF URLs are passed here)
      finalAvatarSrc = avatarSrc
      this.logger.debug('Using provided avatar source URL', { avatarSrc })
    } else if (this.isOrganizationAvatar(avatarId)) {
      // Organization avatar (UUID format) - avatarSrc must be provided
      throw new Error(`Organization avatar requires avatarSrc URL. Avatar ID: ${avatarId}`)
    } else {
      // Individual avatar (non-UUID format) - use storage URL
      let storageUrl = config.storageUrl
      if (!storageUrl && config.hubUrl) {
        storageUrl = this.determineStorageUrl(config.hubUrl)
      }
      storageUrl = storageUrl || 'https://storage.metatell.app'
      finalAvatarSrc = `${storageUrl}/api/v1/avatars/${avatarId}/avatar.gltf?v=${timestamp}`
    }

    // Update internal state
    this.state = {
      networkId,
      position: { ...spawnPosition },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      // A bot has no tracked controllers unless a caller supplies a pose.
      leftHandVisible: false,
      rightHandVisible: false,
      ...pose,
      avatarId,
      avatarSrc: finalAvatarSrc,
      displayName: config.profile.displayName,
    }

    this.currentAnimation = null
    await this.messageService.sendNAFR(this.buildMessage(this.state, true))

    // アニメーションサービスに現在のアバターIDを設定
    if (this.animationService) {
      this.animationService.setCurrentAvatarId(avatarId)
    }

    // Emit event after animation context is ready for subscribers.
    this.eventBus.emit(SystemEvents.AVATAR_SPAWNED, this.state)

    this.logger.debug(`✅ Avatar spawned with ID: ${avatarId}`, {
      avatarSrc: finalAvatarSrc,
      isOrganization: this.isOrganizationAvatar(avatarId),
    })
  }

  /**
   * Determine storage URL based on hub URL environment
   */
  private determineStorageUrl(hubUrl: string): string {
    try {
      const url = new URL(hubUrl)
      const hostname = url.hostname

      // Map hub domains to storage domains
      if (hostname.includes('metatell-stg.app') || hostname.includes('-stg.')) {
        return 'https://storage.metatell-stg.app'
      } else if (hostname.includes('metatell-dev.app') || hostname.includes('-dev.')) {
        return 'https://storage.metatell-dev.app'
      } else {
        // Production or default
        return 'https://storage.metatell.app'
      }
    } catch (error) {
      this.logger.warn('Failed to parse hub URL for storage URL determination', { hubUrl, error })
      return 'https://storage.metatell.app'
    }
  }

  /**
   * Check if avatar ID is organization avatar (UUID format)
   */
  private isOrganizationAvatar(avatarId: string): boolean {
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return uuidRegex.test(avatarId)
  }

  async move(position: Position): Promise<void> {
    if (!this.state || !this.sessionId) {
      throw new Error('Avatar not spawned')
    }

    this.state.position = { ...position }

    await this.messageService.sendNAF(this.buildMessage({ position }))
    this.eventBus.emit(SystemEvents.AVATAR_MOVED, this.state)
    // 移動ログは頻繁すぎるのでコメントアウト
    // this.logger.debug(`Avatar moved to position (${position.x}, ${position.y}, ${position.z})`)
  }

  async rotate(rotation: Rotation): Promise<void> {
    if (!this.state || !this.sessionId) {
      throw new Error('Avatar not spawned')
    }

    const message = this.buildMessage({ rotation })
    this.state.rotation = { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }
    await this.messageService.sendNAF(message)
    this.eventBus.emit(SystemEvents.AVATAR_UPDATED, this.state)
  }

  /** Shared full/delta serializer. Only supplied fields are visited for a delta. */
  private buildMessage(update: Partial<AvatarState>, firstSync = false) {
    const state = this.state!
    const fields: Partial<RemoteAvatarComponents> = {}
    for (const key of Object.keys(update) as (keyof AvatarState)[]) {
      if (update[key] === undefined) continue
      switch (key) {
        case 'rootRotation':
        case 'headRotation':
        case 'leftHandRotation':
        case 'rightHandRotation':
          fields[key] = quaternionToEulerDegrees(update[key]!)
          break
        case 'rotation':
          fields.bodyRotation = quaternionToEulerDegrees(update.rotation!)
          break
        case 'position':
        case 'scale':
        case 'networkedAvatar':
        case 'headPosition':
        case 'leftHandPosition':
        case 'rightHandPosition':
        case 'leftHandVisible':
        case 'rightHandVisible':
        case 'animation':
          Object.assign(fields, { [key]: update[key] })
          break
      }
    }
    if (update.avatarSrc !== undefined || update.avatarId !== undefined) {
      const avatarId = update.avatarId ?? state.avatarId
      const organization = this.isOrganizationAvatar(avatarId)
      fields.avatar = {
        avatarSrc: update.avatarSrc ?? state.avatarSrc ?? '',
        avatarType: organization ? ORGANIZATION_AVATAR_TYPE : DEFAULT_AVATAR_TYPE,
        muted: false,
        isSharingAvatarCamera: false,
        ...(organization ? { files: {} } : {}),
      }
    }
    return new NafMessageBuilder()
      .withDataType(firstSync ? 'u' : 'um')
      .withNetworkId(state.networkId)
      .withOwner(this.sessionId!)
      .withCreator(this.sessionId!)
      .withTemplate(DEFAULT_TEMPLATE)
      .withFirstSync(firstSync)
      .withRemoteAvatar(fields)
      .build()
  }

  async updateState(state: Partial<AvatarState>): Promise<void> {
    if (!this.state || !this.sessionId) {
      throw new Error('Avatar not spawned')
    }

    const message = this.buildMessage(state)
    this.state = { ...this.state, ...state }
    if (state.animation) {
      this.currentAnimation = state.animation.status === 'idle' ? null : state.animation.status
      this.state.currentAnimation = this.currentAnimation ?? undefined
    }
    if (Object.keys(message.data.d![0].components).length > 0) {
      await this.messageService.sendNAF(message)
    }

    if (state.avatarId && this.animationService) {
      this.animationService.setCurrentAvatarId(state.avatarId)
    }

    this.eventBus.emit(SystemEvents.AVATAR_UPDATED, this.state)
  }

  getState(): AvatarState | null {
    return this.state ? { ...this.state } : null
  }

  async destroy(): Promise<void> {
    this.state = null
    this.currentAnimation = null
  }

  async resyncAvatar(): Promise<void> {
    if (!this.state || !this.sessionId) {
      throw new Error('Avatar not spawned')
    }

    await this.messageService.sendNAFR(this.buildMessage(this.state, true))

    this.logger.debug(`✅ Avatar resynced for new user`)
  }

  /**
   * Play animation on the avatar
   */
  async playAnimation(
    animationId: string,
    options?: AnimationPlayOptions,
  ): Promise<AnimationPlaybackResult> {
    if (!this.state || !this.sessionId) {
      throw new AvatarNotSpawnedError()
    }

    // Validate animation exists (if animation service is available)
    if (this.animationService) {
      const isValid = await this.animationService.validateAnimation(animationId)
      if (!isValid) {
        throw new AnimationNotFoundError(animationId)
      }
    }

    const playbackId = uuidv4()
    const timestamp = Date.now()

    // Update internal state
    this.currentAnimation = animationId
    this.state.currentAnimation = animationId

    this.state.animation = { status: animationId, animationRunId: playbackId }
    await this.messageService.sendNAF(this.buildMessage({ animation: this.state.animation }))

    // Emit event
    this.eventBus.emit('animation:played', {
      animationId,
      playbackId,
      options,
    })

    this.logger.debug('Animation played', {
      animationId,
      playbackId,
      options,
    })

    return {
      playbackId,
      animationId,
      startedAt: timestamp,
      expectedDuration: await this.calculateExpectedDuration(animationId, options),
    }
  }

  /**
   * Get current animation
   */
  getCurrentAnimation(): string | null {
    return this.currentAnimation
  }

  /**
   * Stop current animation
   */
  async stopAnimation(): Promise<void> {
    if (!this.state || !this.sessionId) {
      throw new AvatarNotSpawnedError()
    }

    // Clear animation state
    this.currentAnimation = null
    this.state.currentAnimation = undefined

    const playbackId = uuidv4()

    this.state.animation = { status: 'idle', animationRunId: playbackId }
    await this.messageService.sendNAF(this.buildMessage({ animation: this.state.animation }))

    this.eventBus.emit('animation:stopped', {
      animationId: 'idle',
      playbackId,
    })

    this.logger.info('Animation stopped, returned to idle')
  }

  /**
   * Calculate expected animation duration
   */
  private async calculateExpectedDuration(
    animationId: string,
    options?: AnimationPlayOptions,
  ): Promise<number | undefined> {
    if (!this.animationService) {
      return undefined
    }

    try {
      const animation = await this.animationService.loadAnimation(animationId)
      if (animation.duration) {
        const timeScale = options?.timeScale || 1
        return animation.duration / timeScale
      }
    } catch {
      // Ignore errors, return undefined
    }

    return undefined
  }
}
