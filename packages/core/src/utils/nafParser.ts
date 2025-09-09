/**
 * NAF (Networked A-Frame) message parser utilities
 * Uses strongly-typed NAF component definitions for type-safe parsing
 */

import { NafComponentId } from '../builders/NafMessageBuilder.js'
import type { EulerRotation, NAFComponentMap, Position3D, Quaternion } from '../types/naf.js'
import { extractAvatarData, extractBodyRotation, extractPosition } from '../types/naf.js'

export interface ParsedNAFData {
  position?: Position3D
  rotation?: Quaternion
  avatarId?: string
  nickname?: string
  headRotation?: EulerRotation
  bodyRotation?: EulerRotation
}

/**
 * Parse NAF message components into structured data
 * @param components The components object from NAF message
 * @returns Parsed NAF data
 */
export function parseNAFComponents(
  components: Record<string, unknown> | NAFComponentMap,
): ParsedNAFData {
  const result: ParsedNAFData = {}

  // Use type-safe component map
  const typedComponents = components as NAFComponentMap

  // Parse position using type-safe helper
  result.position = extractPosition(typedComponents)

  // Parse head rotation (supports both direct and wrapped components)
  const headRotComponent = typedComponents[NafComponentId.HeadRotation]
  if (headRotComponent) {
    const data = (headRotComponent as { components?: unknown }).components ?? headRotComponent
    if (Array.isArray(data) && data.length >= 3) {
      const [x = 0, y = 0, z = 0] = data
      result.headRotation = { x, y, z }
    } else if (
      typeof data === 'object' &&
      data !== null &&
      'x' in data &&
      'y' in data &&
      'z' in data
    ) {
      const obj = data as { x: number; y: number; z: number }
      result.headRotation = { x: obj.x, y: obj.y, z: obj.z }
    }
  }

  // Parse body rotation and convert to quaternion (NAF uses degrees)
  const bodyRotation = extractBodyRotation(typedComponents)
  if (bodyRotation) {
    result.bodyRotation = bodyRotation
    // Convert degrees to radians for quaternion conversion
    const deg2rad = Math.PI / 180
    result.rotation = eulerToQuaternion(
      bodyRotation.x * deg2rad,
      bodyRotation.y * deg2rad,
      bodyRotation.z * deg2rad,
    )
  }

  // Parse avatar component using type-safe helper
  const avatarData = extractAvatarData(typedComponents)
  if (avatarData) {
    // Extract avatar ID from src URL if present
    const match = avatarData.avatarSrc.match(/avatar_id=([^&]+)/)
    if (match) {
      result.avatarId = match[1]
    }
  }

  // Note: Nickname is not part of standard NAF components in our schema
  // It may be in a custom component or separate message

  return result
}

/**
 * Convert Euler angles to quaternion
 * Note: This function expects radians. NAF uses degrees, so convert before calling.
 * @param x Rotation around X axis (radians)
 * @param y Rotation around Y axis (radians)
 * @param z Rotation around Z axis (radians)
 * @returns Quaternion representation
 */
export function eulerToQuaternion(
  x: number,
  y: number,
  z: number,
): { x: number; y: number; z: number; w: number } {
  // Half angles
  const hx = x * 0.5
  const hy = y * 0.5
  const hz = z * 0.5

  // Trigonometric values
  const cx = Math.cos(hx)
  const cy = Math.cos(hy)
  const cz = Math.cos(hz)
  const sx = Math.sin(hx)
  const sy = Math.sin(hy)
  const sz = Math.sin(hz)

  // Quaternion components
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  }
}

/**
 * Normalize a quaternion
 * @param q Quaternion to normalize
 * @returns Normalized quaternion
 */
export function normalizeQuaternion(q: { x: number; y: number; z: number; w: number }): {
  x: number
  y: number
  z: number
  w: number
} {
  const magnitude = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w)

  if (magnitude === 0) {
    return { x: 0, y: 0, z: 0, w: 1 }
  }

  return {
    x: q.x / magnitude,
    y: q.y / magnitude,
    z: q.z / magnitude,
    w: q.w / magnitude,
  }
}

/**
 * Calculate distance between two 3D positions
 * @param pos1 First position
 * @param pos2 Second position
 * @returns Distance between positions
 */
export function calculateDistance(
  pos1: { x: number; y: number; z: number },
  pos2: { x: number; y: number; z: number },
): number {
  const dx = pos1.x - pos2.x
  const dy = pos1.y - pos2.y
  const dz = pos1.z - pos2.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}
