/**
 * Test helper functions for rotation and quaternion expectations
 */

import { eulerToQuaternion } from '../utils/nafParser.js'

/**
 * Convert Euler angles (degrees) to quaternion for test expectations
 * This ensures consistent deg→rad conversion in all tests
 *
 * @param xDeg X rotation in degrees
 * @param yDeg Y rotation in degrees
 * @param zDeg Z rotation in degrees
 * @returns Quaternion object for test expectations
 */
export const expectQuatFromDegrees = (xDeg: number, yDeg: number, zDeg: number) => {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const { x, y, z, w } = eulerToQuaternion(toRad(xDeg), toRad(yDeg), toRad(zDeg))
  return { x, y, z, w }
}

/**
 * Convert single Y-axis rotation (degrees) to quaternion
 * Commonly used for avatar body rotation tests
 *
 * @param yDeg Y rotation in degrees
 * @returns Quaternion object for Y-axis rotation
 */
export const expectQuatFromYDegrees = (yDeg: number) => {
  return expectQuatFromDegrees(0, yDeg, 0)
}
