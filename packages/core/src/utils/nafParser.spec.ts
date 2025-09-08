/**
 * Test for NAF parser utilities
 */

import { describe, expect, it } from 'vitest'
import { NafComponentId } from '../builders/NafMessageBuilder.js'
import type { NAFComponentMap } from '../types/naf.js'
import {
  calculateDistance,
  eulerToQuaternion,
  normalizeQuaternion,
  parseNAFComponents,
} from './nafParser.js'

describe('nafParser', () => {
  describe('parseNAFComponents', () => {
    it('should parse position component', () => {
      const components: NAFComponentMap = {
        [NafComponentId.Position]: {
          components: [10, 0, -5],
        },
      }

      const result = parseNAFComponents(components)

      expect(result.position).toEqual({ x: 10, y: 0, z: -5 })
    })

    it('should parse head rotation component', () => {
      const components: NAFComponentMap = {
        [NafComponentId.HeadRotation]: {
          components: [45, 90, 0],
        },
      }

      const result = parseNAFComponents(components)

      expect(result.headRotation).toEqual({ x: 45, y: 90, z: 0 })
    })

    it('should parse body rotation and convert to quaternion', () => {
      const components: NAFComponentMap = {
        [NafComponentId.BodyRotation]: {
          components: [0, 90, 0], // Euler angles in array format
        },
      }

      const result = parseNAFComponents(components)

      expect(result.bodyRotation).toEqual({ x: 0, y: 90, z: 0 })
      expect(result.rotation).toBeDefined()
      // Note: The function expects angles in radians, not degrees
      // So we need to convert 90 degrees to radians for the assertion
      const expectedQuat = eulerToQuaternion(0, 90, 0) // This assumes radians
      expect(result.rotation?.y).toBeCloseTo(expectedQuat.y, 2)
    })

    it('should parse avatar data and extract ID from URL', () => {
      const components: NAFComponentMap = {
        [NafComponentId.Avatar]: {
          components: {
            avatarSrc: 'https://example.com/avatar.glb?avatar_id=avatar-123',
          },
        } as NAFComponentMap[NafComponentId.Avatar],
      }

      const result = parseNAFComponents(components)

      expect(result.avatarId).toBe('avatar-123')
    })

    it('should handle avatar without ID in URL', () => {
      const components: NAFComponentMap = {
        [NafComponentId.Avatar]: {
          components: {
            avatarSrc: 'https://example.com/avatar.glb',
          },
        } as NAFComponentMap[NafComponentId.Avatar],
      }

      const result = parseNAFComponents(components)

      expect(result.avatarId).toBeUndefined()
    })

    it('should handle empty components', () => {
      const components: NAFComponentMap = {}

      const result = parseNAFComponents(components)

      expect(result).toEqual({})
    })

    it('should handle missing head rotation components', () => {
      const components: NAFComponentMap = {
        [NafComponentId.HeadRotation]: {
          components: undefined as NAFComponentMap[NafComponentId.HeadRotation]['components'],
        },
      }

      const result = parseNAFComponents(components)

      expect(result.headRotation).toBeUndefined()
    })
  })

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
