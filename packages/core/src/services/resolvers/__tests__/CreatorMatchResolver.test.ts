/**
 * Unit tests for CreatorMatchResolver
 */

import { describe, expect, it } from 'vitest'
import type { PresenceUser } from '../../../interfaces/IPresenceManager.js'
import type { NAFComponent } from '../../../types/index.js'
import { CreatorMatchResolver } from '../CreatorMatchResolver.js'

describe('CreatorMatchResolver', () => {
  const resolver = new CreatorMatchResolver()

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

  const createNafData = (creator?: string, owner?: string): NAFComponent => ({
    networkId: 'test-network-id',
    creator,
    owner,
    position: { x: 0, y: 0, z: 0 },
  })

  describe('basic functionality', () => {
    it('should have correct name and priority', () => {
      expect(resolver.getName()).toBe('creator-match')
      expect(resolver.getPriority()).toBe(2)
    })
  })

  describe('creator matching', () => {
    const users = createMockUsers(['creator-123', 'creator-456', 'other-user'])

    it('should match user when creator field matches', () => {
      const nafData = createNafData('creator-123')
      const result = resolver.resolve('any-network-id', users, nafData)

      expect(result.userId).toBe('creator-123')
      expect(result.strategy).toBe('creator-match')
      expect(result.confidence).toBe('high')
    })

    it('should return none when creator field does not match any user', () => {
      const nafData = createNafData('nonexistent-creator')
      const result = resolver.resolve('any-network-id', users, nafData)

      expect(result.userId).toBeUndefined()
      expect(result.strategy).toBeUndefined()
      expect(result.confidence).toBe('none')
    })

    it('should ignore networkId parameter', () => {
      const nafData = createNafData('creator-456')

      const result1 = resolver.resolve('different-network-id', users, nafData)
      const result2 = resolver.resolve('completely-different', users, nafData)

      expect(result1.userId).toBe('creator-456')
      expect(result2.userId).toBe('creator-456')
    })
  })

  describe('NAF data validation', () => {
    const users = createMockUsers(['valid-creator'])

    it('should return none when NAF data is undefined', () => {
      const result = resolver.resolve('network-id', users, undefined)
      expect(result.confidence).toBe('none')
    })

    it('should return none when NAF data is null', () => {
      const result = resolver.resolve('network-id', users, null as unknown as NAFComponent)
      expect(result.confidence).toBe('none')
    })

    it('should return none when creator field is undefined', () => {
      const nafData = createNafData(undefined, 'some-owner')
      const result = resolver.resolve('network-id', users, nafData)
      expect(result.confidence).toBe('none')
    })

    it('should return none when creator field is null', () => {
      const nafData = createNafData(null as unknown as string, 'some-owner')
      const result = resolver.resolve('network-id', users, nafData)
      expect(result.confidence).toBe('none')
    })

    it('should return none when creator field is empty string', () => {
      const nafData = createNafData('', 'some-owner')
      const result = resolver.resolve('network-id', users, nafData)
      expect(result.confidence).toBe('none')
    })

    it('should work when only creator field is present', () => {
      const nafDataWithOnlyCreator: NAFComponent = {
        networkId: 'test-id',
        creator: 'valid-creator',
      }

      const result = resolver.resolve('network-id', users, nafDataWithOnlyCreator)
      expect(result.confidence).toBe('high')
      expect(result.userId).toBe('valid-creator')
    })
  })

  describe('user list handling', () => {
    it('should handle empty user list', () => {
      const nafData = createNafData('some-creator')
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
          id: 'valid-creator',
          displayName: 'Valid Creator',
          presence: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, rw: 1 },
          muted: false,
        },
      ]

      const nafData = createNafData('valid-creator')
      const result = resolver.resolve('network-id', usersWithNullIds, nafData)

      expect(result.confidence).toBe('high')
      expect(result.userId).toBe('valid-creator')
    })

    it('should return first match when multiple users have same ID', () => {
      const duplicateUsers: PresenceUser[] = [
        {
          id: 'duplicate-creator',
          displayName: 'First Creator',
          presence: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, rw: 1 },
          muted: false,
        },
        {
          id: 'duplicate-creator',
          displayName: 'Second Creator',
          presence: { x: 1, y: 1, z: 1, rx: 0, ry: 0, rz: 0, rw: 1 },
          muted: true,
        },
      ]

      const nafData = createNafData('duplicate-creator')
      const result = resolver.resolve('network-id', duplicateUsers, nafData)

      expect(result.confidence).toBe('high')
      expect(result.userId).toBe('duplicate-creator')
    })
  })

  describe('case sensitivity', () => {
    const users = createMockUsers(['Creator-123', 'CREATOR-456', 'creator-789'])

    it('should perform case-sensitive matching', () => {
      const nafData1 = createNafData('Creator-123')
      const result1 = resolver.resolve('network-id', users, nafData1)
      expect(result1.confidence).toBe('high')
      expect(result1.userId).toBe('Creator-123')

      const nafData2 = createNafData('creator-123') // lowercase
      const result2 = resolver.resolve('network-id', users, nafData2)
      expect(result2.confidence).toBe('none')

      const nafData3 = createNafData('CREATOR-456')
      const result3 = resolver.resolve('network-id', users, nafData3)
      expect(result3.confidence).toBe('high')
      expect(result3.userId).toBe('CREATOR-456')
    })
  })

  describe('special characters and formats', () => {
    const specialUsers = createMockUsers([
      'creator@example.com',
      'creator-with-hyphens',
      'creator_with_underscores',
      'creator.with.dots',
      '123-456-789',
      'créateur-français',
      'クリエイター',
      'creator🚀emoji',
    ])

    it('should match email-like creator IDs', () => {
      const nafData = createNafData('creator@example.com')
      const result = resolver.resolve('network-id', specialUsers, nafData)
      expect(result.confidence).toBe('high')
      expect(result.userId).toBe('creator@example.com')
    })

    it('should match creator IDs with various separators', () => {
      expect(
        resolver.resolve('n', specialUsers, createNafData('creator-with-hyphens')).userId,
      ).toBe('creator-with-hyphens')
      expect(
        resolver.resolve('n', specialUsers, createNafData('creator_with_underscores')).userId,
      ).toBe('creator_with_underscores')
      expect(resolver.resolve('n', specialUsers, createNafData('creator.with.dots')).userId).toBe(
        'creator.with.dots',
      )
    })

    it('should match numeric creator IDs', () => {
      const nafData = createNafData('123-456-789')
      const result = resolver.resolve('network-id', specialUsers, nafData)
      expect(result.confidence).toBe('high')
      expect(result.userId).toBe('123-456-789')
    })

    it('should match Unicode creator IDs', () => {
      expect(resolver.resolve('n', specialUsers, createNafData('créateur-français')).userId).toBe(
        'créateur-français',
      )
      expect(resolver.resolve('n', specialUsers, createNafData('クリエイター')).userId).toBe(
        'クリエイター',
      )
      expect(resolver.resolve('n', specialUsers, createNafData('creator🚀emoji')).userId).toBe(
        'creator🚀emoji',
      )
    })
  })

  describe('creator vs owner distinction', () => {
    const users = createMockUsers(['creator-user', 'owner-user', 'both-user'])

    it('should only match creator field, not owner field', () => {
      const nafData = createNafData('creator-user', 'owner-user')
      const result = resolver.resolve('network-id', users, nafData)

      expect(result.confidence).toBe('high')
      expect(result.userId).toBe('creator-user')
      expect(result.strategy).toBe('creator-match')
    })

    it('should ignore owner field when creator is present', () => {
      const nafData = createNafData('creator-user', 'different-owner')
      const result = resolver.resolve('network-id', users, nafData)

      expect(result.userId).toBe('creator-user')
      expect(result.confidence).toBe('high')
    })

    it('should not match owner field when creator is missing', () => {
      const nafData = createNafData(undefined, 'owner-user')
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

  describe('edge cases', () => {
    it('should handle very long creator IDs', () => {
      const longCreatorId = `creator-${'a'.repeat(1000)}`
      const users = createMockUsers([longCreatorId])
      const nafData = createNafData(longCreatorId)

      const result = resolver.resolve('network-id', users, nafData)
      expect(result.confidence).toBe('high')
      expect(result.userId).toBe(longCreatorId)
    })

    it('should handle whitespace in creator IDs', () => {
      const users = createMockUsers([' creator with spaces ', '\tcreator\twith\ttabs\t'])

      const result1 = resolver.resolve('n', users, createNafData(' creator with spaces '))
      expect(result1.confidence).toBe('high')

      const result2 = resolver.resolve('n', users, createNafData('\tcreator\twith\ttabs\t'))
      expect(result2.confidence).toBe('high')
    })

    it('should handle creator ID that is just whitespace', () => {
      const users = createMockUsers([' ', '\t', '\n'])

      const result1 = resolver.resolve('n', users, createNafData(' '))
      expect(result1.confidence).toBe('high')
      expect(result1.userId).toBe(' ')
    })

    it('should handle performance with large user lists', () => {
      const largeUserList = createMockUsers(
        Array.from({ length: 1000 }, (_, i) => `creator-${i.toString().padStart(4, '0')}`),
      )

      const nafData = createNafData('creator-0500')
      const result = resolver.resolve('network-id', largeUserList, nafData)

      expect(result.confidence).toBe('high')
      expect(result.userId).toBe('creator-0500')
    })
  })

  describe('complex NAF data scenarios', () => {
    const users = createMockUsers(['test-creator'])

    it('should work with minimal NAF data', () => {
      const minimalNafData: NAFComponent = {
        networkId: 'minimal-id',
        creator: 'test-creator',
      }

      const result = resolver.resolve('network-id', users, minimalNafData)
      expect(result.confidence).toBe('high')
    })

    it('should work with complete NAF data', () => {
      const completeNafData: NAFComponent = {
        networkId: 'complete-id',
        creator: 'test-creator',
        owner: 'some-owner',
        position: { x: 1, y: 2, z: 3 },
        rotation: { x: 0, y: 1, z: 0, w: 0 },
        scale: { x: 1, y: 1, z: 1 },
      }

      const result = resolver.resolve('network-id', users, completeNafData)
      expect(result.confidence).toBe('high')
      expect(result.userId).toBe('test-creator')
    })
  })
})
