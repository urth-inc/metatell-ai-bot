/**
 * Comprehensive NAF (Networked A-Frame) type definitions
 * Provides type-safe interfaces for all NAF message components
 */

import { NafComponentId } from '../builders/NafMessageBuilder.js'

// ============================================================================
// Component Value Types
// ============================================================================

/**
 * 3D position in world space
 */
export interface Position3D {
  x: number
  y: number
  z: number
}

/**
 * Quaternion rotation
 */
export interface Quaternion {
  x: number
  y: number
  z: number
  w: number
}

/**
 * Euler angles rotation (in radians)
 */
export interface EulerRotation {
  x: number
  y: number
  z: number
}

/**
 * 3D scale factors
 */
export interface Scale3D {
  x: number
  y: number
  z: number
}

/**
 * Avatar component configuration
 */
export interface AvatarComponentData {
  avatarSrc: string
  avatarType?: string
  muted?: boolean
  isSharingAvatarCamera?: boolean
}

/**
 * Face snapshot data
 */
export interface FaceSnapshotData {
  imageData: string // Base64 encoded image
  timestamp: number
}

// ============================================================================
// NAF Component Structures
// ============================================================================

/**
 * Base structure for a NAF component
 */
export interface NAFComponent<T = unknown> {
  components?: T
  forceRender?: boolean
}

/**
 * Position component (ID: 0)
 */
export interface PositionComponent extends NAFComponent<[number, number, number]> {}

/**
 * Velocity component (ID: 1)
 */
export interface VelocityComponent extends NAFComponent<[number, number, number]> {}

/**
 * Scale component (ID: 2)
 */
export interface ScaleComponent extends NAFComponent<[number, number, number]> {}

/**
 * Avatar component (ID: 3)
 */
export interface AvatarComponent extends NAFComponent<AvatarComponentData | string> {}

/**
 * Head rotation component (ID: 4)
 */
export interface HeadRotationComponent extends NAFComponent<[number, number, number]> {}

/**
 * Hand rotation components (IDs: 5, 6)
 */
export interface HandRotationComponent extends NAFComponent<[number, number, number, number]> {}

/**
 * Hand position components (IDs: 7, 8)
 */
export interface HandPositionComponent extends NAFComponent<[number, number, number]> {}

/**
 * Hand raised component (ID: 9)
 */
export interface HandRaisedComponent extends NAFComponent<boolean> {}

/**
 * Pin position component (ID: 10)
 */
export interface PinPositionComponent extends NAFComponent<[number, number, number]> {}

/**
 * Pin scale component (ID: 11)
 */
export interface PinScaleComponent extends NAFComponent<[number, number, number]> {}

/**
 * Face snapshot enabled component (ID: 12)
 */
export interface FaceSnapshotEnabledComponent extends NAFComponent<boolean> {}

/**
 * Face snapshot component (ID: 13)
 */
export interface FaceSnapshotComponent extends NAFComponent<FaceSnapshotData> {}

/**
 * Body rotation component (ID: 14)
 */
export interface BodyRotationComponent extends NAFComponent<[number, number, number]> {}

// ============================================================================
// NAF Message Component Maps
// ============================================================================

/**
 * Type-safe mapping of component IDs to their respective types
 */
export interface NAFComponentMap {
  [NafComponentId.Position]?: PositionComponent
  [NafComponentId.Velocity]?: VelocityComponent
  [NafComponentId.Scale]?: ScaleComponent
  [NafComponentId.Avatar]?: AvatarComponent
  [NafComponentId.HeadRotation]?: HeadRotationComponent
  [NafComponentId.LeftHandRotation]?: HandRotationComponent
  [NafComponentId.RightHandRotation]?: HandRotationComponent
  [NafComponentId.LeftHandPosition]?: HandPositionComponent
  [NafComponentId.RightHandPosition]?: HandPositionComponent
  [NafComponentId.HandRaised]?: HandRaisedComponent
  [NafComponentId.PinPosition]?: PinPositionComponent
  [NafComponentId.PinScale]?: PinScaleComponent
  [NafComponentId.FaceSnapshotEnabled]?: FaceSnapshotEnabledComponent
  [NafComponentId.FaceSnapshot]?: FaceSnapshotComponent
  [NafComponentId.BodyRotation]?: BodyRotationComponent
}

// ============================================================================
// NAF Message Types
// ============================================================================

/**
 * NAF message data types
 * - 'u': Create/update entity
 * - 'um': Update multiple entities
 * - 'r': Remove entity
 */
export type NAFDataType = 'u' | 'um' | 'r'

/**
 * Base NAF entity data
 */
export interface NAFEntityData {
  networkId: string
  owner: string
  creator: string
  lastOwnerTime: number
  template: string
  persistent: boolean
  parent?: unknown // Can be string, object, or null depending on context
  components: NAFComponentMap
}

/**
 * NAF create/update message ('u' type)
 */
export interface NAFCreateMessage {
  dataType: 'u'
  data: NAFEntityData & {
    isFirstSync?: boolean
    forceRender?: boolean
    megaphone?: boolean
    temporaryMegaphone?: boolean
  }
}

/**
 * NAF multi-update message ('um' type)
 */
export interface NAFMultiUpdateMessage {
  dataType: 'um'
  data: {
    d: NAFEntityData[]
  }
}

/**
 * NAF remove message ('r' type)
 */
export interface NAFRemoveMessage {
  dataType: 'r'
  data: {
    networkId: string
  }
}

/**
 * Union type for all NAF message types
 */
export type TypedNAFMessage = NAFCreateMessage | NAFMultiUpdateMessage | NAFRemoveMessage

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for NAF create message
 */
export function isNAFCreateMessage(msg: unknown): msg is NAFCreateMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'dataType' in msg &&
    msg.dataType === 'u' &&
    'data' in msg &&
    typeof msg.data === 'object'
  )
}

/**
 * Type guard for NAF multi-update message
 */
export function isNAFMultiUpdateMessage(msg: unknown): msg is NAFMultiUpdateMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'dataType' in msg &&
    msg.dataType === 'um' &&
    'data' in msg &&
    typeof msg.data === 'object' &&
    msg.data !== null &&
    'd' in msg.data &&
    Array.isArray(msg.data.d)
  )
}

/**
 * Type guard for NAF remove message
 */
export function isNAFRemoveMessage(msg: unknown): msg is NAFRemoveMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'dataType' in msg &&
    msg.dataType === 'r' &&
    'data' in msg &&
    typeof msg.data === 'object' &&
    msg.data !== null &&
    'networkId' in msg.data
  )
}

/**
 * Type guard for any typed NAF message
 */
export function isTypedNAFMessage(msg: unknown): msg is TypedNAFMessage {
  return isNAFCreateMessage(msg) || isNAFMultiUpdateMessage(msg) || isNAFRemoveMessage(msg)
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract position from NAF components
 */
export function extractPosition(components: NAFComponentMap): Position3D | undefined {
  const posComponent = components[NafComponentId.Position]
  if (posComponent?.components && Array.isArray(posComponent.components)) {
    const [x = 0, y = 0, z = 0] = posComponent.components
    return { x, y, z }
  }
  return undefined
}

/**
 * Extract avatar data from NAF components
 */
export function extractAvatarData(components: NAFComponentMap): AvatarComponentData | undefined {
  const avatarComponent = components[NafComponentId.Avatar]
  if (avatarComponent?.components) {
    if (typeof avatarComponent.components === 'string') {
      return { avatarSrc: avatarComponent.components }
    }
    if (typeof avatarComponent.components === 'object') {
      return avatarComponent.components as AvatarComponentData
    }
  }
  return undefined
}

/**
 * Extract body rotation from NAF components
 */
export function extractBodyRotation(components: NAFComponentMap): EulerRotation | undefined {
  const rotComponent = components[NafComponentId.BodyRotation]
  if (rotComponent?.components && Array.isArray(rotComponent.components)) {
    const [x = 0, y = 0, z = 0] = rotComponent.components
    return { x, y, z }
  }
  return undefined
}
