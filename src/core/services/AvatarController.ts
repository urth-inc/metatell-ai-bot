import { getLogger } from '../../sdk/logging/index.js'
import type {
  AvatarState,
  IAvatarController,
  Position,
  Rotation,
} from '../interfaces/IAvatarController.js'
import type { IConfigurationProvider } from '../interfaces/IConfigurationProvider.js'
import { type IEventBus, SystemEvents } from '../interfaces/IEventBus.js'
import type { IMessageService } from '../interfaces/IMessageService.js'
import { NafMessageBuilder, NafComponentId } from '../builders/NafMessageBuilder.js'

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

    // Update internal state
    this.state = {
      networkId,
      position: spawnPosition,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      avatarId,
      avatarSrc: `https://storage.metatell.app:443/api/v1/avatars/${avatarId}/avatar.gltf?v=${timestamp}`,
      displayName: config.profile.displayName,
    }

    // Send initial NAF message (dataType: 'u')
    const nafMessage = {
      dataType: 'u',
      data: {
        networkId,
        owner: this.sessionId,
        creator: this.sessionId,
        lastOwnerTime: timestamp,
        template: '#remote-avatar',
        persistent: false,
        isFirstSync: true,
        forceRender: false,
        megaphone: false,
        temporaryMegaphone: false,
        parent: null,
        components: {
          '0': { isVector3: true, ...spawnPosition }, // position
          '1': { x: 0, y: 0, z: 0 }, // rotation
          '2': { x: 1, y: 1, z: 1 }, // scale
          '3': {
            // player-info
            avatarSrc: this.state.avatarSrc,
            avatarType: 'skinnable',
            muted: false,
            isSharingAvatarCamera: false,
          },
          '4': { x: 0, y: 0, z: 0, w: 1 }, // head quaternion
          '5': { x: 0, y: 0, z: 0, w: 1 }, // left hand quaternion
          '6': { x: 0, y: 0, z: 0, w: 1 }, // right hand quaternion
          '7': { x: 0, y: 0, z: 0 }, // head position
          '8': { x: 0, y: 0, z: 0 }, // left hand position
          '9': false, // pinned
          '10': { x: 0, y: 0, z: 0 }, // right hand position
          '11': { x: 1, y: 1, z: 1 }, // scale
          '12': false, // visible
          '13': null, // media-loader
          '14': { x: 0, y: 0, z: 0 }, // networked-avatar
        },
      },
    }
    await this.messageService.sendNAF(nafMessage)

    // Send NAFR message (dataType: 'um') for updates
    const nafrData = {
      dataType: 'um',
      data: {
        d: [
          {
            networkId,
            owner: this.sessionId,
            creator: this.sessionId,
            lastOwnerTime: timestamp,
            template: '#remote-avatar',
            persistent: false,
            parent: null,
            components: {
              '0': { isVector3: true, ...spawnPosition },
              '1': { x: 0, y: 0, z: 0 },
              '3': {
                avatarSrc: this.state.avatarSrc,
                avatarType: 'skinnable',
                muted: false,
                isSharingAvatarCamera: false,
              },
              '14': { x: 0, y: 0, z: 0 },
            },
          },
        ],
      },
    }
    await this.messageService.sendNAFR(nafrData)

    // Emit event
    this.eventBus.emit(SystemEvents.AVATAR_SPAWNED, this.state)
    this.logger.debug(`✅ Avatar spawned with ID: ${avatarId}`)
  }

  async move(position: Position): Promise<void> {
    if (!this.state || !this.sessionId) {
      throw new Error('Avatar not spawned')
    }

    this.state.position = position

    const nafData = {
      dataType: 'um',
      data: {
        d: [
          {
            networkId: this.state.networkId,
            owner: this.sessionId,
            creator: this.sessionId,
            lastOwnerTime: Date.now(),
            template: '#remote-avatar',
            persistent: false,
            parent: null,
            components: {
              '0': { isVector3: true, ...position },
            },
          },
        ],
      },
    }

    await this.messageService.sendNAFR(nafData)
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

    const nafData = {
      dataType: 'um',
      data: {
        d: [
          {
            networkId: this.state.networkId,
            owner: this.sessionId,
            creator: this.sessionId,
            lastOwnerTime: Date.now(),
            template: '#remote-avatar',
            persistent: false,
            parent: null,
            components: {
              '14': { x: euler.x, y: euler.y, z: euler.z }, // ブラウザクライアント準拠（オイラー角、度数）
            },
          },
        ],
      },
    }

    await this.messageService.sendNAFR(nafData)
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

    const components: Partial<Record<NafComponentId, unknown>> = {}

    if (state.position) {
      components[NafComponentId.Position] = { isVector3: true, ...state.position }
    }

    if (state.rotation) {
      const euler = this.quaternionToEuler(state.rotation)
      components[NafComponentId.BodyRotation] = {
        x: euler.x,
        y: euler.y,
        z: euler.z,
      }
    }

    if (state.avatarSrc || state.avatarId) {
      components[NafComponentId.Avatar] = {
        avatarSrc: this.state.avatarSrc,
        avatarType: 'skinnable',
        muted: false,
        isSharingAvatarCamera: false,
      }
    }

    const nafData = {
      dataType: 'um' as const,
      data: {
        d: [
          {
            networkId: this.state.networkId,
            owner: this.sessionId,
            creator: this.sessionId,
            lastOwnerTime: Date.now(),
            template: '#remote-avatar',
            persistent: false,
            parent: null,
            components,
          },
        ],
      },
    }

    await this.messageService.sendNAFR(nafData)
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
      .withTemplate('#remote-avatar')
      .withPersistent(false)
      .withFirstSync(true)  // Important: Set first sync flag for new users
      .withPosition(this.state.position)
      .withVelocity({ x: 0, y: 0, z: 0 })
      .withScale({ x: 1, y: 1, z: 1 })
      .withAvatar({
        avatarSrc: this.state.avatarSrc || '',
        avatarType: 'skinnable',
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
