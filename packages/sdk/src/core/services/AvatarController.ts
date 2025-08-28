import { v4 as uuidv4 } from 'uuid'
import { getLogger } from '../../sdk/logging/index.js'
import { NafMessageBuilder } from '../builders/NafMessageBuilder.js'
import { AnimationNotFoundError, AvatarNotSpawnedError } from '../errors/animation-errors.js'
import type { IAnimationService } from '../interfaces/IAnimationService.js'
import type {
  AvatarState,
  IAvatarController,
  Position,
  Rotation,
} from '../interfaces/IAvatarController.js'
import type { IConfigurationProvider } from '../interfaces/IConfigurationProvider.js'
import { type IEventBus, SystemEvents } from '../interfaces/IEventBus.js'
import type { IMessageService } from '../interfaces/IMessageService.js'
import type { AnimationPlaybackResult, AnimationPlayOptions } from '../types/animation.js'

// Constants for default values
const DEFAULT_TEMPLATE = '#remote-avatar'
const DEFAULT_AVATAR_TYPE = 'skinnable'

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

  async spawn(avatarId: string, position?: Position, avatarSrc?: string): Promise<void> {
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
      // Organization avatar (UUID format) - should not reach here if avatarSrc is provided
      this.logger.warn('Organization avatar without avatarSrc provided, using fallback URL', {
        avatarId,
      })
      const hubUrl = new URL(config.hubUrl || '')
      finalAvatarSrc = `${hubUrl.origin}/api/v1/avatars/${avatarId}/avatar.gltf?v=${timestamp}`
    } else {
      // Individual avatar (non-UUID format) - use storage URL
      let storageUrl = config.storageUrl
      if (!storageUrl && config.hubUrl) {
        storageUrl = this.determineStorageUrl(config.hubUrl)
      }
      storageUrl = storageUrl || 'https://storage.metatell.app:443'
      finalAvatarSrc = `${storageUrl}/api/v1/avatars/${avatarId}/avatar.gltf?v=${timestamp}`
    }

    // Update internal state
    this.state = {
      networkId,
      position: spawnPosition,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      avatarId,
      avatarSrc: finalAvatarSrc,
      displayName: config.profile.displayName,
    }

    // Send initial NAF message (unreliable) for immediate visibility
    const nafMessage = new NafMessageBuilder()
      .withDataType('u')
      .withNetworkId(networkId)
      .withOwner(this.sessionId)
      .withCreator(this.sessionId)
      .withFirstSync(true)
      .withPosition(spawnPosition)
      .withAvatar({
        avatarSrc: this.state.avatarSrc || '',
        avatarType: DEFAULT_AVATAR_TYPE,
        muted: false,
        isSharingAvatarCamera: false,
      })
      .build()

    await this.messageService.sendNAF(nafMessage)

    // Send NAFR message (reliable) to ensure critical spawn data arrives
    const nafrMessage = new NafMessageBuilder()
      .withDataType('um')
      .withNetworkId(networkId)
      .withOwner(this.sessionId)
      .withCreator(this.sessionId)
      .withPosition(spawnPosition)
      .withAvatar({
        avatarSrc: this.state.avatarSrc || '',
        avatarType: DEFAULT_AVATAR_TYPE,
        muted: false,
        isSharingAvatarCamera: false,
      })
      .build()

    await this.messageService.sendNAFR(nafrMessage)

    // Emit event
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
        return 'https://storage.metatell-stg.app:443'
      } else if (hostname.includes('metatell-dev.app') || hostname.includes('-dev.')) {
        return 'https://storage.metatell-dev.app:443'
      } else {
        // Production or default
        return 'https://storage.metatell.app:443'
      }
    } catch (error) {
      this.logger.warn('Failed to parse hub URL for storage URL determination', { hubUrl, error })
      return 'https://storage.metatell.app:443'
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

    this.state.position = position

    // Send position update via NAFR (reliable) to ensure movement is received
    // Position updates are critical for avatar synchronization
    const nafMessage = new NafMessageBuilder()
      .withDataType('um')
      .withNetworkId(this.state.networkId)
      .withOwner(this.sessionId)
      .withCreator(this.sessionId)
      .withPosition(position)
      .build()

    await this.messageService.sendNAFR(nafMessage)
    this.eventBus.emit(SystemEvents.AVATAR_MOVED, this.state)
    this.logger.debug(`Avatar moved to position (${position.x}, ${position.y}, ${position.z})`)
  }

  async rotate(rotation: Rotation): Promise<void> {
    if (!this.state || !this.sessionId) {
      throw new Error('Avatar not spawned')
    }

    this.state.rotation = rotation

    // クォータニオンをオイラー角（度数）に変換
    const euler = this.quaternionToEuler(rotation)

    const nafMessage = new NafMessageBuilder()
      .withDataType('um')
      .withNetworkId(this.state.networkId)
      .withOwner(this.sessionId)
      .withCreator(this.sessionId)
      .withBodyRotation(euler) // ブラウザクライアント準拠（オイラー角、度数）
      .build()

    await this.messageService.sendNAFR(nafMessage)
    this.eventBus.emit(SystemEvents.AVATAR_UPDATED, this.state)
  }

  private quaternionToEuler(rotation: Rotation): { x: number; y: number; z: number } {
    // クォータニオンからオイラー角への変換（ZYX順、度数）
    const { x, y, z, w } = rotation

    // wがundefinedの場合は正規化されたクォータニオンから計算
    const normalizedW = w ?? Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z))

    // Y軸回転のみの場合の簡略化された変換
    const yaw = Math.atan2(2 * (normalizedW * y + x * z), 1 - 2 * (y * y + z * z))

    return {
      x: 0, // X軸回転（ピッチ）
      y: yaw * (180 / Math.PI), // Y軸回転（ヨー）を度数に変換
      z: 0, // Z軸回転（ロール）
    }
  }

  async updateState(state: Partial<AvatarState>): Promise<void> {
    if (!this.state || !this.sessionId) {
      throw new Error('Avatar not spawned')
    }

    this.state = { ...this.state, ...state }

    // Use builder pattern for consistent NAF message construction
    let builder = new NafMessageBuilder()
      .withDataType('um')
      .withNetworkId(this.state.networkId)
      .withOwner(this.sessionId)
      .withCreator(this.sessionId)

    if (state.position) {
      builder = builder.withPosition(state.position)
    }

    if (state.rotation) {
      const euler = this.quaternionToEuler(state.rotation)
      builder = builder.withBodyRotation(euler)
    }

    if (state.avatarSrc || state.avatarId) {
      builder = builder.withAvatar({
        avatarSrc: this.state.avatarSrc || '',
        avatarType: 'skinnable',
        muted: false,
        isSharingAvatarCamera: false,
      })
    }

    const nafMessage = builder.build()
    await this.messageService.sendNAFR(nafMessage)
    this.eventBus.emit(SystemEvents.AVATAR_UPDATED, this.state)
  }

  getState(): AvatarState | null {
    return this.state ? { ...this.state } : null
  }

  async destroy(): Promise<void> {
    this.state = null
    // Additional cleanup if needed
  }

  async resyncAvatar(): Promise<void> {
    if (!this.state || !this.sessionId) {
      throw new Error('Avatar not spawned')
    }

    // Build NAF message using the builder pattern
    const nafMessage = new NafMessageBuilder()
      .withDataType('u')
      .withNetworkId(this.state.networkId)
      .withOwner(this.sessionId)
      .withCreator(this.sessionId)
      .withLastOwnerTime()
      .withTemplate(DEFAULT_TEMPLATE)
      .withPersistent(false)
      .withFirstSync(true) // Important: Set first sync flag for new users
      .withPosition(this.state.position)
      .withVelocity({ x: 0, y: 0, z: 0 })
      .withScale({ x: 1, y: 1, z: 1 })
      .withAvatar({
        avatarSrc: this.state.avatarSrc || '',
        avatarType: DEFAULT_AVATAR_TYPE,
        muted: false,
        isSharingAvatarCamera: false,
      })
      .withHeadRotation({ x: 0, y: 0, z: 0, w: 1 })
      .withLeftHandRotation({ x: 0, y: 0, z: 0, w: 1 })
      .withRightHandRotation({ x: 0, y: 0, z: 0, w: 1 })
      .withLeftHandPosition({ x: 0, y: 0, z: 0 })
      .withRightHandPosition({ x: 0, y: 0, z: 0 })
      .withHandRaised(false)
      .withPinPosition({ x: 0, y: 0, z: 0 })
      .withPinScale({ x: 1, y: 1, z: 1 })
      .withFaceSnapshotEnabled(false)
      .withFaceSnapshot(null)
      .withBodyRotation({ x: 0, y: 0, z: 0 })
      .withMegaphone(false)
      .withTemporaryMegaphone(false)
      .build()

    await this.messageService.sendNAF(nafMessage)

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

    // v-air_clientと同じ形式でNAFメッセージを構築
    // vrm-avatar-status-managerコンポーネント（インデックス13）を使用
    const nafMessage = new NafMessageBuilder()
      .withDataType('um')
      .withNetworkId(this.state.networkId)
      .withOwner(this.sessionId)
      .withCreator(this.sessionId)
      .build()

    // components[13]にアニメーション情報を設定
    if (nafMessage.data && 'components' in nafMessage.data && nafMessage.data.components) {
      nafMessage.data.components[13] = {
        status: animationId,
        animationRunId: playbackId,
      }
    } else if (
      nafMessage.data &&
      'd' in nafMessage.data &&
      nafMessage.data.d &&
      nafMessage.data.d.length > 0
    ) {
      nafMessage.data.d[0].components[13] = {
        status: animationId,
        animationRunId: playbackId,
      }
    }

    // Send via NAFR for reliability
    await this.messageService.sendNAFR(nafMessage)

    // Emit event
    this.eventBus.emit('animation:played', {
      animationId,
      playbackId,
      options,
    })

    this.logger.info('Animation played', {
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

    // v-air_clientと同じ形式でNAFメッセージを構築
    const nafMessage = new NafMessageBuilder()
      .withDataType('um')
      .withNetworkId(this.state.networkId)
      .withOwner(this.sessionId)
      .withCreator(this.sessionId)
      .build()

    // components[13]にアニメーション情報を設定（idleに戻る）
    if (nafMessage.data && 'components' in nafMessage.data && nafMessage.data.components) {
      nafMessage.data.components[13] = {
        status: 'idle',
        animationRunId: playbackId,
      }
    } else if (
      nafMessage.data &&
      'd' in nafMessage.data &&
      nafMessage.data.d &&
      nafMessage.data.d.length > 0
    ) {
      nafMessage.data.d[0].components[13] = {
        status: 'idle',
        animationRunId: playbackId,
      }
    }

    await this.messageService.sendNAFR(nafMessage)

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
