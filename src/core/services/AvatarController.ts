import { 
  IAvatarController, 
  AvatarState, 
  Position, 
  Rotation 
} from '../interfaces/IAvatarController'
import { IMessageService } from '../interfaces/IMessageService'
import { IConfigurationProvider } from '../interfaces/IConfigurationProvider'
import { IEventBus, SystemEvents } from '../interfaces/IEventBus'

export class AvatarController implements IAvatarController {
  private state: AvatarState | null = null
  private sessionId: string | null = null

  constructor(
    private messageService: IMessageService,
    private configProvider: IConfigurationProvider,
    private eventBus: IEventBus
  ) {
    // Listen for room joined to get session ID
    this.eventBus.on(SystemEvents.ROOM_JOINED, (data: any) => {
      this.sessionId = data.session_id
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
      displayName: config.profile.displayName
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
          '3': { // player-info
            avatarSrc: this.state.avatarSrc,
            avatarType: 'skinnable',
            muted: false,
            isSharingAvatarCamera: false
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
          '14': { x: 0, y: 0, z: 0 } // networked-avatar
        }
      }
    }
    await this.messageService.sendNAF(nafMessage)

    // Send NAFR message (dataType: 'um') for updates
    const nafrData = {
      dataType: 'um',
      data: {
        d: [{
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
              isSharingAvatarCamera: false
            },
            '14': { x: 0, y: 0, z: 0 }
          }
        }]
      }
    }
    await this.messageService.sendNAFR(nafrData)

    // Emit event
    this.eventBus.emit(SystemEvents.AVATAR_SPAWNED, this.state)
    console.log(`✅ Avatar spawned with ID: ${avatarId}`)
  }

  async move(position: Position): Promise<void> {
    if (!this.state || !this.sessionId) {
      throw new Error('Avatar not spawned')
    }

    this.state.position = position

    const nafData = {
      dataType: 'um',
      data: {
        d: [{
          networkId: this.state.networkId,
          owner: this.sessionId,
          creator: this.sessionId,
          lastOwnerTime: Date.now(),
          template: '#remote-avatar',
          persistent: false,
          parent: null,
          components: {
            '0': { isVector3: true, ...position }
          }
        }]
      }
    }

    await this.messageService.sendNAFR(nafData)
    this.eventBus.emit(SystemEvents.AVATAR_MOVED, this.state)
    console.log(`Avatar moved to position (${position.x}, ${position.y}, ${position.z})`)
  }

  async rotate(rotation: Rotation): Promise<void> {
    if (!this.state || !this.sessionId) {
      throw new Error('Avatar not spawned')
    }

    this.state.rotation = rotation

    const nafData = {
      dataType: 'um',
      data: {
        d: [{
          networkId: this.state.networkId,
          owner: this.sessionId,
          creator: this.sessionId,
          lastOwnerTime: Date.now(),
          template: '#remote-avatar',
          persistent: false,
          parent: null,
          components: {
            '1': { x: rotation.x, y: rotation.y, z: rotation.z }
          }
        }]
      }
    }

    await this.messageService.sendNAFR(nafData)
    this.eventBus.emit(SystemEvents.AVATAR_UPDATED, this.state)
  }

  async updateState(state: Partial<AvatarState>): Promise<void> {
    if (!this.state || !this.sessionId) {
      throw new Error('Avatar not spawned')
    }

    this.state = { ...this.state, ...state }

    const components: any = {}
    
    if (state.position) {
      components['0'] = { isVector3: true, ...state.position }
    }
    
    if (state.rotation) {
      components['1'] = { 
        x: state.rotation.x, 
        y: state.rotation.y, 
        z: state.rotation.z 
      }
    }

    if (state.avatarSrc || state.avatarId) {
      components['3'] = {
        avatarSrc: this.state.avatarSrc,
        avatarType: 'skinnable',
        muted: false,
        isSharingAvatarCamera: false
      }
    }

    const nafData = {
      dataType: 'um',
      data: {
        d: [{
          networkId: this.state.networkId,
          owner: this.sessionId,
          creator: this.sessionId,
          lastOwnerTime: Date.now(),
          template: '#remote-avatar',
          persistent: false,
          parent: null,
          components
        }]
      }
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
}