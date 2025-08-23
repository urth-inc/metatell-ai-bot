import { getLogger } from '../../sdk/logging/index.js'
import { NafMessageBuilder } from '../builders/NafMessageBuilder.js'
import type {
  AvatarState,
  IAvatarController,
  Position,
  Rotation,
} from '../interfaces/IAvatarController.js'
import type { IConfigurationProvider } from '../interfaces/IConfigurationProvider.js'
import { type IEventBus, SystemEvents } from '../interfaces/IEventBus.js'
import type { IMessageService } from '../interfaces/IMessageService.js'

// Constants for default values
const DEFAULT_TEMPLATE = '#remote-avatar'
const DEFAULT_AVATAR_TYPE = 'skinnable'

export class AvatarController implements IAvatarController {
  private state: AvatarState | null = null
  private sessionId: string | null = null
  private logger = getLogger('AvatarController')

  constructor(
    private messageService: IMessageService,
    private configProvider: IConfigurationProvider,
    private eventBus: IEventBus,
  ) {
    // Listen for room joined to get session ID
    this.eventBus.on(SystemEvents.ROOM_JOINED, (data: unknown) => {
      this.sessionId = (data as { session_id: string }).session_id
    })
  }

  async spawn(avatarId: string, position?: Position): Promise<void> {
    if (!this.sessionId) {
      throw new Error('Cannot spawn avatar: Not connected to room')
    }

    const config = this.configProvider.getConfiguration()
    const timestamp = Date.now()
    const networkId = this.sessionId
    const spawnPosition = position || { x: 0, y: 0.2, z: 0 }

    // Get storage URL from config or use default
    const storageUrl = config.storageUrl || 'https://storage.metatell.app:443'

    // Update internal state
    this.state = {
      networkId,
      position: spawnPosition,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      avatarId,
      avatarSrc: `${storageUrl}/api/v1/avatars/${avatarId}/avatar.gltf?v=${timestamp}`,
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
    this.logger.debug(`✅ Avatar spawned with ID: ${avatarId}`)
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
}
