/**
 * NAF Component IDs - Mapping of component types to their numeric IDs
 */
export enum NafComponentId {
  Position = '0',
  Velocity = '1',
  Scale = '2',
  Avatar = '3',
  HeadRotation = '4',
  LeftHandRotation = '5',
  RightHandRotation = '6',
  LeftHandPosition = '7',
  RightHandPosition = '8',
  HandRaised = '9',
  PinPosition = '10',
  PinScale = '11',
  FaceSnapshotEnabled = '12',
  FaceSnapshot = '13',
  BodyRotation = '14',
}

/**
 * NAF Avatar configuration
 */
export interface NafAvatarConfig {
  avatarSrc: string
  avatarType?: string
  muted?: boolean
  isSharingAvatarCamera?: boolean
}

/**
 * NAF Message data types
 */
export type NafDataType = 'u' | 'um' | 'r'

/**
 * NAF Message structure (legacy - for backward compatibility)
 * @deprecated Use TypedNAFMessage from '../types/naf' for new code
 */
export interface NafMessage {
  dataType: NafDataType
  data: {
    networkId?: string
    owner?: string
    creator?: string
    lastOwnerTime?: number
    template?: string
    persistent?: boolean
    isFirstSync?: boolean
    forceRender?: boolean
    megaphone?: boolean
    temporaryMegaphone?: boolean
    parent?: unknown
    components?: Record<string, unknown>
    d?: Array<{
      networkId: string
      owner: string
      creator: string
      lastOwnerTime: number
      template: string
      persistent: boolean
      parent: unknown
      components: Record<string, unknown>
    }>
  }
}

// Import strongly-typed NAF definitions
import type { NAFComponentMap, TypedNAFMessage } from '../types/naf.js'

/**
 * Builder for constructing NAF messages with a fluent API
 */
export class NafMessageBuilder {
  private dataType: NafDataType = 'u'
  private networkId: string | null = null
  private owner: string | null = null
  private creator: string | null = null
  private lastOwnerTime: number = Date.now()
  private template: string = '#remote-avatar'
  private persistent: boolean = false
  private isFirstSync: boolean = false
  private forceRender: boolean = false
  private megaphone: boolean = false
  private temporaryMegaphone: boolean = false
  private parent: unknown = null
  private components: Partial<Record<NafComponentId, unknown>> = {}
  private isMultiData: boolean = false

  /**
   * Set the data type
   */
  withDataType(type: NafDataType): this {
    this.dataType = type
    this.isMultiData = type === 'um'
    return this
  }

  /**
   * Set network ID
   */
  withNetworkId(id: string): this {
    this.networkId = id
    return this
  }

  /**
   * Set owner
   */
  withOwner(owner: string): this {
    this.owner = owner
    return this
  }

  /**
   * Set creator
   */
  withCreator(creator: string): this {
    this.creator = creator
    return this
  }

  /**
   * Set last owner time
   */
  withLastOwnerTime(time?: number): this {
    this.lastOwnerTime = time ?? Date.now()
    return this
  }

  /**
   * Set template
   */
  withTemplate(template: string): this {
    this.template = template
    return this
  }

  /**
   * Set persistent flag
   */
  withPersistent(persistent: boolean): this {
    this.persistent = persistent
    return this
  }

  /**
   * Set first sync flag (for new users)
   */
  withFirstSync(isFirstSync: boolean): this {
    this.isFirstSync = isFirstSync
    return this
  }

  /**
   * Set position component
   */
  withPosition(position: { x: number; y: number; z: number }): this {
    this.components[NafComponentId.Position] = { isVector3: true, ...position }
    return this
  }

  /**
   * Set velocity component
   */
  withVelocity(velocity: { x: number; y: number; z: number }): this {
    this.components[NafComponentId.Velocity] = velocity
    return this
  }

  /**
   * Set scale component
   */
  withScale(scale: { x: number; y: number; z: number }): this {
    this.components[NafComponentId.Scale] = scale
    return this
  }

  /**
   * Set avatar component
   */
  withAvatar(config: NafAvatarConfig): this {
    this.components[NafComponentId.Avatar] = {
      avatarSrc: config.avatarSrc,
      avatarType: config.avatarType ?? 'skinnable',
      muted: config.muted ?? false,
      isSharingAvatarCamera: config.isSharingAvatarCamera ?? false,
    }
    return this
  }

  /**
   * Set body rotation (euler angles)
   */
  withBodyRotation(rotation: { x: number; y: number; z: number }): this {
    this.components[NafComponentId.BodyRotation] = rotation
    return this
  }

  /**
   * Set head rotation (quaternion)
   */
  withHeadRotation(rotation: { x: number; y: number; z: number; w: number }): this {
    this.components[NafComponentId.HeadRotation] = rotation
    return this
  }

  /**
   * Set left hand rotation (quaternion)
   */
  withLeftHandRotation(rotation: { x: number; y: number; z: number; w: number }): this {
    this.components[NafComponentId.LeftHandRotation] = rotation
    return this
  }

  /**
   * Set right hand rotation (quaternion)
   */
  withRightHandRotation(rotation: { x: number; y: number; z: number; w: number }): this {
    this.components[NafComponentId.RightHandRotation] = rotation
    return this
  }

  /**
   * Set left hand position
   */
  withLeftHandPosition(position: { x: number; y: number; z: number }): this {
    this.components[NafComponentId.LeftHandPosition] = position
    return this
  }

  /**
   * Set right hand position
   */
  withRightHandPosition(position: { x: number; y: number; z: number }): this {
    this.components[NafComponentId.RightHandPosition] = position
    return this
  }

  /**
   * Set hand raised state
   */
  withHandRaised(raised: boolean): this {
    this.components[NafComponentId.HandRaised] = raised
    return this
  }

  /**
   * Set pin position
   */
  withPinPosition(position: { x: number; y: number; z: number }): this {
    this.components[NafComponentId.PinPosition] = position
    return this
  }

  /**
   * Set pin scale
   */
  withPinScale(scale: { x: number; y: number; z: number }): this {
    this.components[NafComponentId.PinScale] = scale
    return this
  }

  /**
   * Set face snapshot enabled
   */
  withFaceSnapshotEnabled(enabled: boolean): this {
    this.components[NafComponentId.FaceSnapshotEnabled] = enabled
    return this
  }

  /**
   * Set face snapshot data
   */
  withFaceSnapshot(data: unknown): this {
    this.components[NafComponentId.FaceSnapshot] = data
    return this
  }

  /**
   * Set megaphone state
   */
  withMegaphone(enabled: boolean): this {
    this.megaphone = enabled
    return this
  }

  /**
   * Set temporary megaphone state
   */
  withTemporaryMegaphone(enabled: boolean): this {
    this.temporaryMegaphone = enabled
    return this
  }

  /**
   * Build the NAF message
   */
  build(): NafMessage {
    if (!this.networkId || !this.owner || !this.creator) {
      throw new Error('networkId, owner, and creator are required')
    }

    // Fill in default components if not set
    const defaultComponents: Record<NafComponentId, unknown> = {
      [NafComponentId.Position]: this.components[NafComponentId.Position] ?? {
        isVector3: true,
        x: 0,
        y: 0,
        z: 0,
      },
      [NafComponentId.Velocity]: this.components[NafComponentId.Velocity] ?? { x: 0, y: 0, z: 0 },
      [NafComponentId.Scale]: this.components[NafComponentId.Scale] ?? { x: 1, y: 1, z: 1 },
      [NafComponentId.Avatar]: this.components[NafComponentId.Avatar] ?? {
        avatarSrc: '',
        avatarType: 'skinnable',
        muted: false,
        isSharingAvatarCamera: false,
      },
      [NafComponentId.HeadRotation]: this.components[NafComponentId.HeadRotation] ?? {
        x: 0,
        y: 0,
        z: 0,
        w: 1,
      },
      [NafComponentId.LeftHandRotation]: this.components[NafComponentId.LeftHandRotation] ?? {
        x: 0,
        y: 0,
        z: 0,
        w: 1,
      },
      [NafComponentId.RightHandRotation]: this.components[NafComponentId.RightHandRotation] ?? {
        x: 0,
        y: 0,
        z: 0,
        w: 1,
      },
      [NafComponentId.LeftHandPosition]: this.components[NafComponentId.LeftHandPosition] ?? {
        x: 0,
        y: 0,
        z: 0,
      },
      [NafComponentId.RightHandPosition]: this.components[NafComponentId.RightHandPosition] ?? {
        x: 0,
        y: 0,
        z: 0,
      },
      [NafComponentId.HandRaised]: this.components[NafComponentId.HandRaised] ?? false,
      [NafComponentId.PinPosition]: this.components[NafComponentId.PinPosition] ?? {
        x: 0,
        y: 0,
        z: 0,
      },
      [NafComponentId.PinScale]: this.components[NafComponentId.PinScale] ?? { x: 1, y: 1, z: 1 },
      [NafComponentId.FaceSnapshotEnabled]:
        this.components[NafComponentId.FaceSnapshotEnabled] ?? false,
      [NafComponentId.FaceSnapshot]: this.components[NafComponentId.FaceSnapshot] ?? null,
      [NafComponentId.BodyRotation]: this.components[NafComponentId.BodyRotation] ?? {
        x: 0,
        y: 0,
        z: 0,
      },
    }

    const mergedComponents = { ...defaultComponents, ...this.components }

    if (this.isMultiData) {
      // Multi-data format (um)
      return {
        dataType: this.dataType,
        data: {
          d: [
            {
              networkId: this.networkId,
              owner: this.owner,
              creator: this.creator,
              lastOwnerTime: this.lastOwnerTime,
              template: this.template,
              persistent: this.persistent,
              parent: this.parent,
              components: mergedComponents,
            },
          ],
        },
      }
    } else {
      // Single data format (u, r)
      return {
        dataType: this.dataType,
        data: {
          networkId: this.networkId,
          owner: this.owner,
          creator: this.creator,
          lastOwnerTime: this.lastOwnerTime,
          template: this.template,
          persistent: this.persistent,
          isFirstSync: this.isFirstSync,
          forceRender: this.forceRender,
          megaphone: this.megaphone,
          temporaryMegaphone: this.temporaryMegaphone,
          parent: this.parent,
          components: mergedComponents,
        },
      }
    }
  }

  /**
   * Build a strongly-typed NAF message
   * @returns Type-safe NAF message based on the dataType
   */
  buildTyped(): TypedNAFMessage {
    const message = this.build()
    
    // Convert to strongly-typed format based on dataType
    if (this.dataType === 'u') {
      // For 'u' type, these fields are guaranteed by build() method
      if (!message.data.networkId || !message.data.owner || !message.data.creator) {
        throw new Error('Invalid message data for type u')
      }
      return {
        dataType: 'u',
        data: {
          networkId: message.data.networkId,
          owner: message.data.owner,
          creator: message.data.creator,
          lastOwnerTime: message.data.lastOwnerTime ?? Date.now(),
          template: message.data.template ?? '#remote-avatar',
          persistent: message.data.persistent ?? false,
          parent: message.data.parent,
          components: message.data.components as NAFComponentMap,
          isFirstSync: message.data.isFirstSync,
          forceRender: message.data.forceRender,
          megaphone: message.data.megaphone,
          temporaryMegaphone: message.data.temporaryMegaphone,
        }
      }
    } else if (this.dataType === 'um') {
      // For 'um' type, d array is guaranteed by build() method
      if (!message.data.d) {
        throw new Error('Invalid message data for type um')
      }
      return {
        dataType: 'um',
        data: {
          d: message.data.d.map(entity => ({
            networkId: entity.networkId,
            owner: entity.owner,
            creator: entity.creator,
            lastOwnerTime: entity.lastOwnerTime,
            template: entity.template,
            persistent: entity.persistent,
            parent: entity.parent,
            components: entity.components as NAFComponentMap,
          }))
        }
      }
    } else {
      // 'r' type - remove message
      if (!message.data.networkId) {
        throw new Error('Invalid message data for type r')
      }
      return {
        dataType: 'r',
        data: {
          networkId: message.data.networkId
        }
      }
    }
  }
}
