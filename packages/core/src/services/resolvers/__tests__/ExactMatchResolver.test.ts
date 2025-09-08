/**
 * Unit tests for ExactMatchResolver
 */

import { describe, expect, it } from 'vitest'
import type { PresenceUser } from '../../../interfaces/IPresenceManager.js'
import { ExactMatchResolver } from '../ExactMatchResolver.js'

describe('ExactMatchResolver', () => {
  const resolver = new ExactMatchResolver()

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

  describe('basic functionality', () => {
    it('should have correct name and priority', () => {
      expect(resolver.getName()).toBe('exact-match')
      expect(resolver.getPriority()).toBe(1)
    })
  })

  describe('exact matching', () => {
    const users = createMockUsers(['user-123', 'user-456', 'admin-789'])

    it('should return exact match with highest confidence', () => {
      const result = resolver.resolve('user-123', users)

      expect(result.userId).toBe('user-123')
      expect(result.strategy).toBe('exact-match')
      expect(result.confidence).toBe('exact')
    })

    it('should match any user in the list', () => {
      const result1 = resolver.resolve('user-456', users)
      const result2 = resolver.resolve('admin-789', users)

      expect(result1.userId).toBe('user-456')
      expect(result1.confidence).toBe('exact')

      expect(result2.userId).toBe('admin-789')
      expect(result2.confidence).toBe('exact')
    })

    it('should return none confidence when no match found', () => {
      const result = resolver.resolve('nonexistent-user', users)

      expect(result.userId).toBeUndefined()
      expect(result.strategy).toBeUndefined()
      expect(result.confidence).toBe('none')
    })

    it('should handle empty user list', () => {
      const result = resolver.resolve('user-123', [])

      expect(result.confidence).toBe('none')
    })
  })

  describe('case sensitivity', () => {
    const users = createMockUsers(['User-123', 'USER-456'])

    it('should perform case-sensitive matching', () => {
      const result1 = resolver.resolve('User-123', users)
      const result2 = resolver.resolve('user-123', users) // lowercase
      const result3 = resolver.resolve('USER-123', users) // uppercase

      expect(result1.confidence).toBe('exact')
      expect(result2.confidence).toBe('none')
      expect(result3.confidence).toBe('none')
    })
  })

  describe('special characters and edge cases', () => {
    const specialUsers = createMockUsers([
      'user@example.com',
      'user-with-hyphens',
      'user_with_underscores',
      'user.with.dots',
      '123-456-789',
      '',
      ' ',
      'user with spaces',
    ])

    it('should match email-like IDs', () => {
      const result = resolver.resolve('user@example.com', specialUsers)
      expect(result.confidence).toBe('exact')
    })

    it('should match IDs with hyphens, underscores, and dots', () => {
      expect(resolver.resolve('user-with-hyphens', specialUsers).confidence).toBe('exact')
      expect(resolver.resolve('user_with_underscores', specialUsers).confidence).toBe('exact')
      expect(resolver.resolve('user.with.dots', specialUsers).confidence).toBe('exact')
    })

    it('should match numeric IDs', () => {
      const result = resolver.resolve('123-456-789', specialUsers)
      expect(result.confidence).toBe('exact')
    })

    it('should handle empty string ID', () => {
      const result = resolver.resolve('', specialUsers)
      expect(result.confidence).toBe('exact')
      expect(result.userId).toBe('')
    })

    it('should handle whitespace ID', () => {
      const result = resolver.resolve(' ', specialUsers)
      expect(result.confidence).toBe('exact')
    })

    it('should handle IDs with spaces', () => {
      const result = resolver.resolve('user with spaces', specialUsers)
      expect(result.confidence).toBe('exact')
    })
  })

  describe('Unicode and international characters', () => {
    const unicodeUsers = createMockUsers([
      'utilisateur-français',
      'ユーザー名',
      'пользователь',
      '用户名',
      'emoji-user-🚀',
    ])

    it('should match French characters', () => {
      const result = resolver.resolve('utilisateur-français', unicodeUsers)
      expect(result.confidence).toBe('exact')
    })

    it('should match Japanese characters', () => {
      const result = resolver.resolve('ユーザー名', unicodeUsers)
      expect(result.confidence).toBe('exact')
    })

    it('should match Cyrillic characters', () => {
      const result = resolver.resolve('пользователь', unicodeUsers)
      expect(result.confidence).toBe('exact')
    })

    it('should match Chinese characters', () => {
      const result = resolver.resolve('用户名', unicodeUsers)
      expect(result.confidence).toBe('exact')
    })

    it('should match IDs with emojis', () => {
      const result = resolver.resolve('emoji-user-🚀', unicodeUsers)
      expect(result.confidence).toBe('exact')
    })
  })

  describe('NAF data handling', () => {
    const users = createMockUsers(['user-123'])

    it('should ignore NAF data for exact matching', () => {
      const nafData = {
        networkId: 'different-id',
        owner: 'different-owner',
        creator: 'different-creator',
      }

      const result = resolver.resolve('user-123', users, nafData)
      expect(result.confidence).toBe('exact')
    })

    it('should work without NAF data', () => {
      const result = resolver.resolve('user-123', users)
      expect(result.confidence).toBe('exact')
    })

    it('should work with null NAF data', () => {
      const result = resolver.resolve('user-123', users, undefined)
      expect(result.confidence).toBe('exact')
    })
  })

  describe('performance edge cases', () => {
    it('should handle very long user lists', () => {
      const largeUserList = createMockUsers(
        Array.from({ length: 1000 }, (_, i) => `user-${i.toString().padStart(4, '0')}`),
      )

      const result = resolver.resolve('user-0500', largeUserList)
      expect(result.confidence).toBe('exact')
      expect(result.userId).toBe('user-0500')
    })

    it('should handle very long user IDs', () => {
      const longId = `user-${'a'.repeat(1000)}`
      const users = createMockUsers([longId])

      const result = resolver.resolve(longId, users)
      expect(result.confidence).toBe('exact')
      expect(result.userId).toBe(longId)
    })

    it('should return first match when duplicates exist', () => {
      const usersWithDuplicates: PresenceUser[] = [
        {
          id: 'duplicate-id',
          displayName: 'First User',
          presence: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, rw: 1 },
          muted: false,
        },
        {
          id: 'duplicate-id',
          displayName: 'Second User',
          presence: { x: 1, y: 1, z: 1, rx: 0, ry: 0, rz: 0, rw: 1 },
          muted: true,
        },
      ]

      const result = resolver.resolve('duplicate-id', usersWithDuplicates)
      expect(result.confidence).toBe('exact')
      expect(result.userId).toBe('duplicate-id')
    })
  })
})
