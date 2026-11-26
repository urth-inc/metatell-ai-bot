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
 * Rig rotation component (ID: 1), Euler angles in degrees
 */
export interface RotationComponent extends NAFComponent<Vec3> {}

/**
 * Scale component (ID: 2)
 */
export interface ScaleComponent extends NAFComponent<Vec3> {}

/**
 * Avatar component (ID: 3)
 */
export interface AvatarComponent extends NAFComponent<AvatarComponentData | string> {}

/**
 * `networked-avatar` component data (ID: 4)
 */
export interface NetworkedAvatarData {
  /** Index of the VR left hand pose */
  left_hand_pose?: number
  /** Index of the VR right hand pose */
  right_hand_pose?: number
  /** Whether the avatar's head follows the head rotation (first-person camera) */
  head_camera_follow_enabled?: boolean
}

/**
 * `networked-avatar` component (ID: 4)
 */
export interface NetworkedAvatarComponent extends NAFComponent<NetworkedAvatarData> {}

/**
 * Head and hand position components (IDs: 5, 7, 10), relative to the rig
 */
export interface LocalPositionComponent extends NAFComponent<Vec3> {}

/**
 * Head and hand rotation components (IDs: 6, 8, 11), Euler angles in degrees relative to the rig
 */
export interface LocalRotationComponent extends NAFComponent<Vec3> {}

/**
 * Hand visibility components (IDs: 9, 12)
 */
export interface HandVisibleComponent extends NAFComponent<boolean> {}

/**
 * `vrm-avatar-status-manager` component data (ID: 13)
 */
export interface VrmAvatarStatusData {
  status: string
  animationRunId: string
}

/**
 * VRM avatar status component (ID: 13)
 */
export interface VrmAvatarStatusComponent extends NAFComponent<VrmAvatarStatusData> {}

/**
 * Body rotation component (ID: 14): the model rotation relative to the rig, Euler angles in degrees
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
  [NafComponentId.Rotation]?: Vec3 | RotationComponent
  [NafComponentId.Scale]?: Vec3 | ScaleComponent | { x: number; y: number; z: number }
  [NafComponentId.Avatar]?: AvatarComponentData | string | AvatarComponent
  [NafComponentId.NetworkedAvatar]?: NetworkedAvatarData | NetworkedAvatarComponent
  [NafComponentId.HeadPosition]?: Vec3 | LocalPositionComponent
  [NafComponentId.HeadRotation]?: Vec3 | LocalRotationComponent
  [NafComponentId.LeftHandPosition]?: Vec3 | LocalPositionComponent
  [NafComponentId.LeftHandRotation]?: Vec3 | LocalRotationComponent
  [NafComponentId.LeftHandVisible]?: boolean | HandVisibleComponent
  [NafComponentId.RightHandPosition]?: Vec3 | LocalPositionComponent
  [NafComponentId.RightHandRotation]?: Vec3 | LocalRotationComponent
  [NafComponentId.RightHandVisible]?: boolean | HandVisibleComponent
  [NafComponentId.VrmAvatarStatus]?: VrmAvatarStatusData | VrmAvatarStatusComponent
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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract the rig position (supports direct values, wrapped components, arrays and objects)
 */
export function extractPosition(components: NAFComponentMap): Position3D | undefined {
  return extractVec3(components[NafComponentId.Position])
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
 * Extract the direction the body faces: the model rotation relative to the rig (Euler angles in degrees)
 */
export function extractBodyRotation(components: NAFComponentMap): EulerRotation | undefined {
  return extractVec3(components[NafComponentId.BodyRotation])
}

/**
 * Extract the rig rotation (Euler angles in degrees)
 */
export function extractRotation(components: NAFComponentMap): EulerRotation | undefined {
  return extractVec3(components[NafComponentId.Rotation])
}

/**
 * Read a vector from a direct value (array or object) or a wrapped component
 */
function extractVec3(component: unknown): { x: number; y: number; z: number } | undefined {
  if (!component) return undefined
  const data = (component as { components?: unknown }).components ?? component
  if (Array.isArray(data)) {
    const [x = 0, y = 0, z = 0] = data
    return { x, y, z }
  }
  if (typeof data === 'object' && data !== null && 'x' in data && 'y' in data && 'z' in data) {
    const { x, y, z } = data as { x: number; y: number; z: number }
    return { x, y, z }
  }
  return undefined
}
