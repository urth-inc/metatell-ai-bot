/**
 * NAF (Networked A-Frame) message parser utilities
 */

export interface ParsedNAFData {
  position?: { x: number; y: number; z: number }
  rotation?: { x: number; y: number; z: number; w: number }
  avatarId?: string
  nickname?: string
}

/**
 * Parse NAF message components into structured data
 * @param components The components object from NAF message
 * @returns Parsed NAF data
 */
export function parseNAFComponents(components: Record<string, unknown>): ParsedNAFData {
  const result: ParsedNAFData = {}

  // Parse position
  if (components[1]) {
    const pos = components[1] as { x?: number; y?: number; z?: number }
    result.position = {
      x: pos.x || 0,
      y: pos.y || 0,
      z: pos.z || 0,
    }
  }

  // Parse rotation (quaternion or euler)
  if (components[2]) {
    const rot = components[2] as { x?: number; y?: number; z?: number; w?: number }
    if ('w' in rot) {
      // Quaternion
      result.rotation = {
        x: rot.x || 0,
        y: rot.y || 0,
        z: rot.z || 0,
        w: rot.w || 1,
      }
    } else {
      // Euler angles - convert to quaternion
      result.rotation = eulerToQuaternion(rot.x || 0, rot.y || 0, rot.z || 0)
    }
  }

  // Parse avatar ID
  if (components[6]) {
    const comp6 = components[6] as { data?: { src?: string } }
    if (comp6.data?.src) {
      const match = comp6.data.src.match(/avatar_id=([^&]+)/)
      if (match) {
        result.avatarId = match[1]
      }
    }
  }

  // Parse nickname from nametag
  if (components[8]) {
    const comp8 = components[8] as { text?: string }
    if (comp8.text) {
      result.nickname = comp8.text
    }
  }

  return result
}

/**
 * Convert Euler angles to quaternion
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
