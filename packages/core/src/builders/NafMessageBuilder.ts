/**
 * NAF component IDs of the browser client's `#remote-avatar` networked schema.
 *
 * NAF sends each component under its index in that schema, so these values must follow the
 * browser's order. Rotations are Euler angles in degrees (the A-Frame `rotation` component).
 */
export enum NafComponentId {
  /** Avatar rig position in meters */
  Position = '0',
  /** Avatar rig rotation */
  Rotation = '1',
  /** Avatar rig scale */
  Scale = '2',
  /** `player-info`: avatar model and profile flags */
  Avatar = '3',
  /** `networked-avatar`: VR hand poses and the head camera follow flag */
  NetworkedAvatar = '4',
  /** Head (`.camera`) position relative to the rig */
  HeadPosition = '5',
  /** Head (`.camera`) rotation relative to the rig */
  HeadRotation = '6',
  /** Left hand (`.left-controller`) position relative to the rig */
  LeftHandPosition = '7',
  /** Left hand (`.left-controller`) rotation relative to the rig */
  LeftHandRotation = '8',
  /** Whether the left hand is shown. Browser users without a VR controller send `false`. */
  LeftHandVisible = '9',
  /** Right hand (`.right-controller`) position relative to the rig */
  RightHandPosition = '10',
  /** Right hand (`.right-controller`) rotation relative to the rig */
  RightHandRotation = '11',
  /** Whether the right hand is shown. Browser users without a VR controller send `false`. */
  RightHandVisible = '12',
  /** `vrm-avatar-status-manager`: the animation state */
  VrmAvatarStatus = '13',
  /** Avatar model (`.model`) rotation relative to the rig: the direction the body faces */
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
 * Hand state in the browser's `#remote-avatar` schema
 */
export interface NafHandState {
  /** Position relative to the rig in meters */
  position?: { x: number; y: number; z: number }
  /** Rotation relative to the rig (Euler angles in degrees) */
  rotation?: { x: number; y: number; z: number }
  visible?: boolean
}

/**
 * Value of the `vrm-avatar-status-manager` component
 */
export interface NafVrmAvatarStatus {
  /** Animation ID, or `idle` */
  status: string
  /** Changes on every play so that the same animation can be played again */
  animationRunId: string
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
    // Set default components. Position is not defaulted: an update without it must not move
    // the avatar to the origin.
    this.components[NafComponentId.Scale] = { x: 1, y: 1, z: 1 }
    // Bots have no VR controllers. Hide both hands as a desktop browser user does; a hand left
    // visible has no pose to follow and flickers.
    this.components[NafComponentId.LeftHandVisible] = false
    this.components[NafComponentId.RightHandVisible] = false
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
   * Set the avatar rig rotation (Euler angles in degrees)
   */
  withRotation(rotation: { x: number; y: number; z: number }): this {
    this.components[NafComponentId.Rotation] = rotation
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
   * Set the direction the body faces: the model rotation relative to the rig (Euler angles in degrees)
   */
  withBodyRotation(rotation: { x: number; y: number; z: number }): this {
    this.components[NafComponentId.BodyRotation] = rotation
    return this
  }

  /**
   * Set the head position relative to the rig
   */
  withHeadPosition(position: { x: number; y: number; z: number }): this {
    this.components[NafComponentId.HeadPosition] = position
    return this
  }

  /**
   * Set the head rotation relative to the rig (Euler angles in degrees)
   */
  withHeadRotation(rotation: { x: number; y: number; z: number }): this {
    this.components[NafComponentId.HeadRotation] = rotation
    return this
  }

  /**
   * Set the left hand pose relative to the rig (rotation in degrees). Omitted fields are not sent.
   */
  withLeftHand(hand: NafHandState): this {
    return this.withHand(
      hand,
      NafComponentId.LeftHandPosition,
      NafComponentId.LeftHandRotation,
      NafComponentId.LeftHandVisible,
    )
  }

  /**
   * Set the right hand pose relative to the rig (rotation in degrees). Omitted fields are not sent.
   */
  withRightHand(hand: NafHandState): this {
    return this.withHand(
      hand,
      NafComponentId.RightHandPosition,
      NafComponentId.RightHandRotation,
      NafComponentId.RightHandVisible,
    )
  }

  private withHand(
    hand: NafHandState,
    positionId: NafComponentId,
    rotationId: NafComponentId,
    visibleId: NafComponentId,
  ): this {
    if (hand.position) this.components[positionId] = hand.position
    if (hand.rotation) this.components[rotationId] = hand.rotation
    if (hand.visible !== undefined) this.components[visibleId] = hand.visible
    return this
  }

  /**
   * Set the VRM avatar animation state
   */
  withVrmAvatarStatus(status: NafVrmAvatarStatus): this {
    this.components[NafComponentId.VrmAvatarStatus] = status
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
