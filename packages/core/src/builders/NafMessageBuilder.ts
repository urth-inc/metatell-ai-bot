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
  FaceSnapshot = '13', // Also used for VRM avatar status (animation state) for compatibility
  VrmAvatarStatus = '13', // Alias for FaceSnapshot when used for animation state
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
  files?: Record<string, unknown> // v-air_client互換用
}

/**
 * NAF Message data types
 */
export type NafDataType = 'u' | 'um' | 'r'

/**
 * NAF Message structure
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

  constructor() {
    // Set default components
    this.components[NafComponentId.Position] = { isVector3: true, x: 0, y: 0, z: 0 }
    this.components[NafComponentId.Scale] = { x: 1, y: 1, z: 1 }
    this.components[NafComponentId.HandRaised] = false
  }

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
      ...(config.files ? { files: config.files } : {}),
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
   * Set custom component by ID
   * Use this for components not covered by specific methods
   */
  withCustomComponent(componentId: string, value: unknown): this {
    this.components[componentId as NafComponentId] = value
    return this
  }

  /**
   * Build the NAF message
   * @returns NAF message based on the dataType
   */
  build(): NafMessage {
    if (!this.networkId || !this.owner || !this.creator) {
      throw new Error('networkId, owner, and creator are required')
    }

    // Build components object including defaults set in constructor and any explicitly set components
    const mergedComponents = { ...this.components }

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
}
