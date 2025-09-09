/**
 * Comprehensive NAF (Networked A-Frame) type definitions
 * Provides type-safe interfaces for all NAF message components
 */

import { NafComponentId } from '../builders/NafMessageBuilder.js'

// ============================================================================
// Component Value Types
// ============================================================================

/**
 * 3D vector as array or object
 */
export type Vec3 = [number, number, number] | { x: number; y: number; z: number }

/**
 * Quaternion as array or object
 */
export type Quat = [number, number, number, number] | { x: number; y: number; z: number; w: number }

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
 * Euler angles rotation (in degrees)
 * Note: NAF uses degrees for browser compatibility
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
export interface PositionComponent extends NAFComponent<Vec3> {}

/**
 * Velocity component (ID: 1)
 */
export interface VelocityComponent extends NAFComponent<Vec3> {}

/**
 * Scale component (ID: 2)
 */
export interface ScaleComponent extends NAFComponent<Vec3> {}

/**
 * Avatar component (ID: 3)
 */
export interface AvatarComponent extends NAFComponent<AvatarComponentData | string> {}

/**
 * Head rotation component (ID: 4)
 * Can be Euler angles (3 values) or Quaternion (4 values)
 */
export interface HeadRotationComponent extends NAFComponent<Vec3 | Quat> {}

/**
 * Hand rotation components (IDs: 5, 6)
 */
export interface HandRotationComponent extends NAFComponent<Quat> {}

/**
 * Hand position components (IDs: 7, 8)
 */
export interface HandPositionComponent extends NAFComponent<Vec3> {}

/**
 * Hand raised component (ID: 9)
 */
export interface HandRaisedComponent extends NAFComponent<boolean> {}

/**
 * Pin position component (ID: 10)
 */
export interface PinPositionComponent extends NAFComponent<Vec3> {}

/**
 * Pin scale component (ID: 11)
 */
export interface PinScaleComponent extends NAFComponent<Vec3> {}

/**
 * Face snapshot enabled component (ID: 12)
 */
export interface FaceSnapshotEnabledComponent extends NAFComponent<boolean> {}

/**
 * Face snapshot component (ID: 13)
 * Note: Also used for VRM avatar status (animation state) for compatibility
 */
export interface FaceSnapshotComponent
  extends NAFComponent<FaceSnapshotData | { status: string; animationRunId: string }> {}

/**
 * Alias for FaceSnapshot when used for VRM avatar status
 */
export type VrmAvatarStatusComponent = FaceSnapshotComponent

/**
 * Body rotation component (ID: 14)
 */
export interface BodyRotationComponent extends NAFComponent<Vec3> {}

// ============================================================================
// NAF Message Component Maps
// ============================================================================

/**
 * Type-safe mapping of component IDs to their respective types
 * Supports both direct values and wrapped components for backward compatibility
 */
export interface NAFComponentMap {
  [NafComponentId.Position]?:
    | Vec3
    | PositionComponent
    | { x: number; y: number; z: number; isVector3?: boolean }
  [NafComponentId.Velocity]?: Vec3 | VelocityComponent
  [NafComponentId.Scale]?: Vec3 | ScaleComponent | { x: number; y: number; z: number }
  [NafComponentId.Avatar]?: AvatarComponentData | string | AvatarComponent
  [NafComponentId.HeadRotation]?: Vec3 | Quat | HeadRotationComponent
  [NafComponentId.LeftHandRotation]?: Quat | HandRotationComponent
  [NafComponentId.RightHandRotation]?: Quat | HandRotationComponent
  [NafComponentId.LeftHandPosition]?: Vec3 | HandPositionComponent
  [NafComponentId.RightHandPosition]?: Vec3 | HandPositionComponent
  [NafComponentId.HandRaised]?: boolean | HandRaisedComponent
  [NafComponentId.PinPosition]?: Vec3 | PinPositionComponent
  [NafComponentId.PinScale]?: Vec3 | PinScaleComponent
  [NafComponentId.FaceSnapshotEnabled]?: boolean | FaceSnapshotEnabledComponent
  [NafComponentId.FaceSnapshot]?:
    | FaceSnapshotData
    | { status: string; animationRunId: string }
    | FaceSnapshotComponent
  [NafComponentId.BodyRotation]?: Vec3 | BodyRotationComponent | { x: number; y: number; z: number }
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
 * Extract scale from NAF components (supports direct values, wrapped components, arrays and objects)
 */
export function extractScale(components: NAFComponentMap): Scale3D | undefined {
  const scaleComponent = components[NafComponentId.Scale]
  if (!scaleComponent) return undefined

  // Handle direct value or wrapped component
  const data = (scaleComponent as { components?: unknown }).components ?? scaleComponent

  if (Array.isArray(data)) {
    const [x = 1, y = 1, z = 1] = data
    return { x, y, z }
  } else if (
    typeof data === 'object' &&
    data !== null &&
    'x' in data &&
    'y' in data &&
    'z' in data
  ) {
    const obj = data as { x: number; y: number; z: number }
    return { x: obj.x, y: obj.y, z: obj.z }
  }
  return undefined
}

/**
 * Extract head rotation from NAF components (supports direct values, wrapped components, Euler and Quaternion)
 */
export function extractHeadRotation(
  components: NAFComponentMap,
): EulerRotation | Quaternion | undefined {
  const rotComponent = components[NafComponentId.HeadRotation]
  if (!rotComponent) return undefined

  // Handle direct value or wrapped component
  const data = (rotComponent as { components?: unknown }).components ?? rotComponent

  if (Array.isArray(data)) {
    if (data.length === 4) {
      const [x = 0, y = 0, z = 0, w = 1] = data
      return { x, y, z, w }
    } else {
      const [x = 0, y = 0, z = 0] = data
      return { x, y, z }
    }
  } else if (typeof data === 'object' && data !== null) {
    if ('w' in data) {
      const quat = data as { x: number; y: number; z: number; w: number }
      return { x: quat.x, y: quat.y, z: quat.z, w: quat.w }
    } else if ('x' in data && 'y' in data && 'z' in data) {
      const euler = data as { x: number; y: number; z: number }
      return { x: euler.x, y: euler.y, z: euler.z }
    }
  }
  return undefined
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract position from NAF components (supports direct values, wrapped components, arrays and objects)
 */
export function extractPosition(components: NAFComponentMap): Position3D | undefined {
  const posComponent = components[NafComponentId.Position]
  if (!posComponent) return undefined

  // Handle direct value (array or object) or wrapped component
  const data = (posComponent as { components?: unknown }).components ?? posComponent

  if (Array.isArray(data)) {
    const [x = 0, y = 0, z = 0] = data
    return { x, y, z }
  } else if (
    typeof data === 'object' &&
    data !== null &&
    'x' in data &&
    'y' in data &&
    'z' in data
  ) {
    const obj = data as { x: number; y: number; z: number }
    return { x: obj.x, y: obj.y, z: obj.z }
  }
  return undefined
}

/**
 * Extract avatar data from NAF components (supports direct values and wrapped components)
 */
export function extractAvatarData(components: NAFComponentMap): AvatarComponentData | undefined {
  const avatarComponent = components[NafComponentId.Avatar]
  if (!avatarComponent) return undefined

  // Handle direct value or wrapped component
  const data = (avatarComponent as { components?: unknown }).components ?? avatarComponent

  if (typeof data === 'string') {
    return { avatarSrc: data }
  }
  if (typeof data === 'object' && data !== null && 'avatarSrc' in data) {
    return data as AvatarComponentData
  }
  return undefined
}

/**
 * Extract body rotation from NAF components (supports direct values, wrapped components, arrays and objects)
 */
export function extractBodyRotation(components: NAFComponentMap): EulerRotation | undefined {
  const rotComponent = components[NafComponentId.BodyRotation]
  if (!rotComponent) return undefined

  // Handle direct value or wrapped component
  const data = (rotComponent as { components?: unknown }).components ?? rotComponent

  if (Array.isArray(data)) {
    const [x = 0, y = 0, z = 0] = data
    return { x, y, z }
  } else if (
    typeof data === 'object' &&
    data !== null &&
    'x' in data &&
    'y' in data &&
    'z' in data
  ) {
    const obj = data as { x: number; y: number; z: number }
    return { x: obj.x, y: obj.y, z: obj.z }
  }
  return undefined
}
