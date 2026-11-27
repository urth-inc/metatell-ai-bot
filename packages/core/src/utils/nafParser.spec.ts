/**
 * Test for NAF parser utilities
 */

import { describe, expect, it } from 'vitest'
import { calculateDistance, eulerToQuaternion, normalizeQuaternion } from './nafParser.js'

describe('nafParser', () => {
  describe('normalizeQuaternion', () => {
    it('should normalize a quaternion', () => {
      const q = { x: 1, y: 0, z: 0, w: 1 }
      const normalized = normalizeQuaternion(q)

      const magnitude = Math.sqrt(
        normalized.x ** 2 + normalized.y ** 2 + normalized.z ** 2 + normalized.w ** 2,
      )
      expect(magnitude).toBeCloseTo(1, 5)
    })

    it('should handle zero quaternion', () => {
      const q = { x: 0, y: 0, z: 0, w: 0 }
      const normalized = normalizeQuaternion(q)

      expect(normalized).toEqual({ x: 0, y: 0, z: 0, w: 1 })
    })

    it('should preserve direction when normalizing', () => {
      const q = { x: 2, y: 0, z: 0, w: 2 }
      const normalized = normalizeQuaternion(q)

      expect(normalized.x / normalized.w).toBeCloseTo(1, 5)
    })
  })

  describe('calculateDistance', () => {
    it('should calculate distance between two points', () => {
      const pos1 = { x: 0, y: 0, z: 0 }
      const pos2 = { x: 3, y: 4, z: 0 }

      const distance = calculateDistance(pos1, pos2)

      expect(distance).toBe(5) // 3-4-5 triangle
    })

    it('should return 0 for same position', () => {
      const pos1 = { x: 5, y: 10, z: -3 }
      const pos2 = { x: 5, y: 10, z: -3 }

      const distance = calculateDistance(pos1, pos2)

      expect(distance).toBe(0)
    })

    it('should calculate 3D distance', () => {
      const pos1 = { x: 0, y: 0, z: 0 }
      const pos2 = { x: 1, y: 1, z: 1 }

      const distance = calculateDistance(pos1, pos2)

      expect(distance).toBeCloseTo(Math.sqrt(3), 5)
    })
  })

  describe('eulerToQuaternion', () => {
    it('should convert euler angles to quaternion', () => {
      // Convert 90 degrees to radians for Y axis rotation
      const radians = Math.PI / 2
      const quat = eulerToQuaternion(0, radians, 0)

      expect(quat.x).toBeCloseTo(0, 5)
      expect(quat.y).toBeCloseTo(Math.SQRT1_2, 3)
      expect(quat.z).toBeCloseTo(0, 5)
      expect(quat.w).toBeCloseTo(Math.SQRT1_2, 3)
    })

    it('should handle zero rotation', () => {
      const quat = eulerToQuaternion(0, 0, 0)

      expect(quat.x).toBeCloseTo(0, 5)
      expect(quat.y).toBeCloseTo(0, 5)
      expect(quat.z).toBeCloseTo(0, 5)
      expect(quat.w).toBeCloseTo(1, 5)
    })

    it('should handle complex rotations', () => {
      const quat = eulerToQuaternion(45, 30, 60)

      // Just verify it returns a valid quaternion
      expect(quat.x).toBeDefined()
      expect(quat.y).toBeDefined()
      expect(quat.z).toBeDefined()
      expect(quat.w).toBeDefined()

      // Check quaternion is normalized (magnitude ≈ 1)
      const magnitude = Math.sqrt(quat.x ** 2 + quat.y ** 2 + quat.z ** 2 + quat.w ** 2)
      expect(magnitude).toBeCloseTo(1, 5)
    })
  })
})
