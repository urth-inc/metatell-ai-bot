/**
 * Unit tests for OwnerMatchResolver
 */

import { describe, expect, it } from 'vitest'
import type { PresenceUser } from '../../../interfaces/IPresenceManager.js'
import type { NAFComponent } from '../../../types/index.js'
import { OwnerMatchResolver } from '../OwnerMatchResolver.js'

describe('OwnerMatchResolver', () => {
  const resolver = new OwnerMatchResolver()

  const createMockUsers = (userIds: string[]): PresenceUser[] =>
    userIds.map((id) => ({
      id,
      displayName: `User ${id}`,
      presence: {
        x: 0,
        y: 0,
        z: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        rw: 1,
      },
      muted: false,
    }))

  const createNafData = (owner?: string, creator?: string): NAFComponent => ({
    networkId: 'test-network-id',
    owner,
    creator,
    position: { x: 0, y: 0, z: 0 },
  })

  describe('basic functionality', () => {
    it('should have correct name and priority', () => {
      expect(resolver.getName()).toBe('owner-match')
      expect(resolver.getPriority()).toBe(3)
    })
  })

  describe('owner matching', () => {
    const users = createMockUsers(['owner-123', 'owner-456', 'other-user'])

    it('should match user when owner field matches', () => {
      const nafData = createNafData('owner-123')
      const result = resolver.resolve('any-network-id', users, nafData)

      expect(result.userId).toBe('owner-123')
      expect(result.strategy).toBe('owner-match')
      expect(result.confidence).toBe('high')
    })

    it('should return none when owner field does not match any user', () => {
      const nafData = createNafData('nonexistent-owner')
      const result = resolver.resolve('any-network-id', users, nafData)

      expect(result.userId).toBeUndefined()
      expect(result.strategy).toBeUndefined()
      expect(result.confidence).toBe('none')
    })

    it('should ignore networkId parameter', () => {
      const nafData = createNafData('owner-456')

      const result1 = resolver.resolve('different-network-id', users, nafData)
      const result2 = resolver.resolve('completely-different', users, nafData)

      expect(result1.userId).toBe('owner-456')
      expect(result2.userId).toBe('owner-456')
    })
  })

  describe('NAF data validation', () => {
    const users = createMockUsers(['valid-owner'])

    it('should return none when NAF data is undefined', () => {
      const result = resolver.resolve('network-id', users, undefined)
      expect(result.confidence).toBe('none')
    })

    it('should return none when NAF data is null', () => {
      const result = resolver.resolve('network-id', users, null as unknown as NAFComponent)
      expect(result.confidence).toBe('none')
    })

    it('should return none when owner field is undefined', () => {
      const nafData = createNafData(undefined, 'some-creator')
      const result = resolver.resolve('network-id', users, nafData)
      expect(result.confidence).toBe('none')
    })

    it('should return none when owner field is null', () => {
      const nafData = createNafData(null as unknown as string, 'some-creator')
      const result = resolver.resolve('network-id', users, nafData)
      expect(result.confidence).toBe('none')
    })

    it('should return none when owner field is empty string', () => {
      const nafData = createNafData('', 'some-creator')
      const result = resolver.resolve('network-id', users, nafData)
      expect(result.confidence).toBe('none')
    })

    it('should work when only owner field is present', () => {
      const nafDataWithOnlyOwner: NAFComponent = {
        networkId: 'test-id',
        owner: 'valid-owner',
      }

      const result = resolver.resolve('network-id', users, nafDataWithOnlyOwner)
      expect(result.confidence).toBe('high')
      expect(result.userId).toBe('valid-owner')
    })
  })

  describe('user list handling', () => {
    it('should handle empty user list', () => {
      const nafData = createNafData('some-owner')
      const result = resolver.resolve('network-id', [], nafData)
      expect(result.confidence).toBe('none')
    })

    it('should handle users with null/undefined IDs', () => {
      const usersWithNullIds: PresenceUser[] = [
        {
          id: null as unknown as string,
          displayName: 'Null ID User',
          presence: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, rw: 1 },
          muted: false,
        },
        {
          id: undefined as unknown as string,
          displayName: 'Undefined ID User',
          presence: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, rw: 1 },
          muted: false,
        },
        {
          id: 'valid-owner',
          displayName: 'Valid Owner',
          presence: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, rw: 1 },
          muted: false,
        },
      ]

      const nafData = createNafData('valid-owner')
      const result = resolver.resolve('network-id', usersWithNullIds, nafData)

      expect(result.confidence).toBe('high')
      expect(result.userId).toBe('valid-owner')
    })

    it('should return first match when multiple users have same ID', () => {
      const duplicateUsers: PresenceUser[] = [
        {
          id: 'duplicate-owner',
          displayName: 'First Owner',
          presence: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, rw: 1 },
          muted: false,
        },
        {
          id: 'duplicate-owner',
          displayName: 'Second Owner',
          presence: { x: 1, y: 1, z: 1, rx: 0, ry: 0, rz: 0, rw: 1 },
          muted: true,
        },
      ]

      const nafData = createNafData('duplicate-owner')
      const result = resolver.resolve('network-id', duplicateUsers, nafData)

      expect(result.confidence).toBe('high')
      expect(result.userId).toBe('duplicate-owner')
    })
  })

  describe('case sensitivity', () => {
    const users = createMockUsers(['Owner-123', 'OWNER-456', 'owner-789'])

    it('should perform case-sensitive matching', () => {
      const nafData1 = createNafData('Owner-123')
      const result1 = resolver.resolve('network-id', users, nafData1)
      expect(result1.confidence).toBe('high')
      expect(result1.userId).toBe('Owner-123')

      const nafData2 = createNafData('owner-123') // lowercase
      const result2 = resolver.resolve('network-id', users, nafData2)
      expect(result2.confidence).toBe('none')

      const nafData3 = createNafData('OWNER-456')
      const result3 = resolver.resolve('network-id', users, nafData3)
      expect(result3.confidence).toBe('high')
      expect(result3.userId).toBe('OWNER-456')
    })
  })

  describe('special characters and formats', () => {
    const specialUsers = createMockUsers([
      'owner@example.com',
      'owner-with-hyphens',
      'owner_with_underscores',
      'owner.with.dots',
      '987-654-321',
      'propriétaire-français',
      'オーナー',
      'owner👤emoji',
    ])

    it('should match email-like owner IDs', () => {
      const nafData = createNafData('owner@example.com')
      const result = resolver.resolve('network-id', specialUsers, nafData)
      expect(result.confidence).toBe('high')
      expect(result.userId).toBe('owner@example.com')
    })

    it('should match owner IDs with various separators', () => {
      expect(resolver.resolve('n', specialUsers, createNafData('owner-with-hyphens')).userId).toBe(
        'owner-with-hyphens',
      )
      expect(
        resolver.resolve('n', specialUsers, createNafData('owner_with_underscores')).userId,
      ).toBe('owner_with_underscores')
      expect(resolver.resolve('n', specialUsers, createNafData('owner.with.dots')).userId).toBe(
        'owner.with.dots',
      )
    })

    it('should match numeric owner IDs', () => {
      const nafData = createNafData('987-654-321')
      const result = resolver.resolve('network-id', specialUsers, nafData)
      expect(result.confidence).toBe('high')
      expect(result.userId).toBe('987-654-321')
    })

    it('should match Unicode owner IDs', () => {
      expect(
        resolver.resolve('n', specialUsers, createNafData('propriétaire-français')).userId,
      ).toBe('propriétaire-français')
      expect(resolver.resolve('n', specialUsers, createNafData('オーナー')).userId).toBe('オーナー')
      expect(resolver.resolve('n', specialUsers, createNafData('owner👤emoji')).userId).toBe(
        'owner👤emoji',
      )
    })
  })

  describe('owner vs creator distinction', () => {
    const users = createMockUsers(['creator-user', 'owner-user', 'both-user'])

    it('should only match owner field, not creator field', () => {
      const nafData = createNafData('owner-user', 'creator-user')
      const result = resolver.resolve('network-id', users, nafData)

      expect(result.confidence).toBe('high')
      expect(result.userId).toBe('owner-user')
      expect(result.strategy).toBe('owner-match')
    })

    it('should ignore creator field when owner is present', () => {
      const nafData = createNafData('owner-user', 'different-creator')
      const result = resolver.resolve('network-id', users, nafData)

      expect(result.userId).toBe('owner-user')
      expect(result.confidence).toBe('high')
    })

    it('should not match creator field when owner is missing', () => {
      const nafData = createNafData(undefined, 'creator-user')
      const result = resolver.resolve('network-id', users, nafData)

      expect(result.confidence).toBe('none')
    })

    it('should work when creator and owner are the same person', () => {
      const nafData = createNafData('both-user', 'both-user')
      const result = resolver.resolve('network-id', users, nafData)

      expect(result.confidence).toBe('high')
      expect(result.userId).toBe('both-user')
    })
  })

  describe('priority comparison with CreatorMatchResolver', () => {
    it('should have lower priority than CreatorMatchResolver', () => {
      // OwnerMatchResolver should have priority 3, CreatorMatchResolver should have priority 2
      expect(resolver.getPriority()).toBe(3)
      expect(resolver.getPriority()).toBeGreaterThan(2) // Assuming CreatorMatchResolver has priority 2
    })
  })

  describe('edge cases', () => {
    it('should handle very long owner IDs', () => {
      const longOwnerId = `owner-${'b'.repeat(1000)}`
      const users = createMockUsers([longOwnerId])
      const nafData = createNafData(longOwnerId)

      const result = resolver.resolve('network-id', users, nafData)
      expect(result.confidence).toBe('high')
      expect(result.userId).toBe(longOwnerId)
    })

    it('should handle whitespace in owner IDs', () => {
      const users = createMockUsers([' owner with spaces ', '\towner\twith\ttabs\t'])

      const result1 = resolver.resolve('n', users, createNafData(' owner with spaces '))
      expect(result1.confidence).toBe('high')

      const result2 = resolver.resolve('n', users, createNafData('\towner\twith\ttabs\t'))
      expect(result2.confidence).toBe('high')
    })

    it('should handle owner ID that is just whitespace', () => {
      const users = createMockUsers([' ', '\t', '\n'])

      const result1 = resolver.resolve('n', users, createNafData(' '))
      expect(result1.confidence).toBe('high')
      expect(result1.userId).toBe(' ')
    })

    it('should handle performance with large user lists', () => {
      const largeUserList = createMockUsers(
        Array.from({ length: 1000 }, (_, i) => `owner-${i.toString().padStart(4, '0')}`),
      )

      const nafData = createNafData('owner-0750')
      const result = resolver.resolve('network-id', largeUserList, nafData)

      expect(result.confidence).toBe('high')
      expect(result.userId).toBe('owner-0750')
    })
  })

  describe('complex NAF data scenarios', () => {
    const users = createMockUsers(['test-owner'])

    it('should work with minimal NAF data', () => {
      const minimalNafData: NAFComponent = {
        networkId: 'minimal-id',
        owner: 'test-owner',
      }

      const result = resolver.resolve('network-id', users, minimalNafData)
      expect(result.confidence).toBe('high')
    })

    it('should work with complete NAF data', () => {
      const completeNafData: NAFComponent = {
        networkId: 'complete-id',
        owner: 'test-owner',
        creator: 'some-creator',
        position: { x: 1, y: 2, z: 3 },
        rotation: { x: 0, y: 1, z: 0, w: 0 },
        scale: { x: 1, y: 1, z: 1 },
      }

      const result = resolver.resolve('network-id', users, completeNafData)
      expect(result.confidence).toBe('high')
      expect(result.userId).toBe('test-owner')
    })
  })
})
