/**
 * Unit tests for PrefixMatchResolver
 */

import { describe, expect, it } from 'vitest'
import type { PresenceUser } from '../../../interfaces/IPresenceManager.js'
import { PrefixMatchResolver } from '../PrefixMatchResolver.js'

describe('PrefixMatchResolver', () => {
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
    const resolver = new PrefixMatchResolver()

    it('should have correct name and priority', () => {
      expect(resolver.getName()).toBe('prefix-match')
      expect(resolver.getPriority()).toBe(4)
    })

    it('should use default minimum length of 16', () => {
      const users = createMockUsers(['12345678901234567890'])

      // Should work with 16+ char IDs
      const result1 = resolver.resolve('1234567890123456XXXX', users)
      expect(result1.confidence).toBe('medium')

      // Should fail with <16 char network ID
      const result2 = resolver.resolve('123456789012345', users) // 15 chars
      expect(result2.confidence).toBe('none')
    })
  })

  describe('custom minimum length', () => {
    it('should respect custom minimum length', () => {
      const resolver = new PrefixMatchResolver(8)
      const users = createMockUsers(['12345678abcdef'])

      // Should work with 8+ char IDs
      const result1 = resolver.resolve('12345678XXXX', users)
      expect(result1.confidence).toBe('medium')

      // Should fail with <8 char network ID
      const result2 = resolver.resolve('1234567', users) // 7 chars
      expect(result2.confidence).toBe('none')
    })

    it('should handle minimum length of 1', () => {
      const resolver = new PrefixMatchResolver(1)
      const users = createMockUsers(['a123', 'b456'])

      const result = resolver.resolve('a999', users)
      expect(result.confidence).toBe('medium')
      expect(result.userId).toBe('a123')
    })
  })

  describe('prefix matching logic', () => {
    const resolver = new PrefixMatchResolver(8)
    const users = createMockUsers([
      'prefix01-full-user-id',
      'prefix02-another-user',
      'different-prefix-user',
      'short',
    ])

    it('should match users with same prefix', () => {
      const result1 = resolver.resolve('prefix01-some-different-suffix', users)
      expect(result1.confidence).toBe('medium')
      expect(result1.strategy).toBe('prefix-match')
      expect(result1.userId).toBe('prefix01-full-user-id')

      const result2 = resolver.resolve('prefix02-different-ending', users)
      expect(result2.confidence).toBe('medium')
      expect(result2.userId).toBe('prefix02-another-user')
    })

    it('should return none when no matching prefix found', () => {
      const result = resolver.resolve('nomatch01-suffix', users)
      expect(result.confidence).toBe('none')
      expect(result.userId).toBeUndefined()
      expect(result.strategy).toBeUndefined()
    })

    it('should return first match when multiple users have same prefix', () => {
      const duplicatePrefixUsers = createMockUsers([
        'samepref-user-one',
        'samepref-user-two',
        'samepref-user-three',
      ])

      const result = resolver.resolve('samepref-network-id', duplicatePrefixUsers)
      expect(result.confidence).toBe('medium')
      expect(result.userId).toBe('samepref-user-one')
    })

    it('should ignore users with IDs shorter than minimum length', () => {
      const result = resolver.resolve('shortXXX', users) // tries to match "short"
      expect(result.confidence).toBe('none')
    })
  })

  describe('edge cases for network ID', () => {
    const resolver = new PrefixMatchResolver(4)
    const users = createMockUsers(['test-user-1234'])

    it('should return none for empty network ID', () => {
      const result = resolver.resolve('', users)
      expect(result.confidence).toBe('none')
    })

    it('should return none for null/undefined network ID', () => {
      const result1 = resolver.resolve(null as unknown as string, users)
      expect(result1.confidence).toBe('none')

      const result2 = resolver.resolve(undefined as unknown as string, users)
      expect(result2.confidence).toBe('none')
    })

    it('should return none when network ID is shorter than minimum length', () => {
      const result = resolver.resolve('abc', users) // 3 chars, min is 4
      expect(result.confidence).toBe('none')
    })

    it('should work when network ID exactly equals minimum length', () => {
      const exactLengthUsers = createMockUsers(['testABCD'])
      const result = resolver.resolve('test', exactLengthUsers) // exactly 4 chars
      expect(result.confidence).toBe('medium')
      expect(result.userId).toBe('testABCD')
    })
  })

  describe('edge cases for user list', () => {
    const resolver = new PrefixMatchResolver(4)

    it('should handle empty user list', () => {
      const result = resolver.resolve('test-network-id', [])
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
          id: 'testvalid',
          displayName: 'Valid User',
          presence: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, rw: 1 },
          muted: false,
        },
      ]

      const result = resolver.resolve('test-network', usersWithNullIds)
      expect(result.confidence).toBe('medium')
      expect(result.userId).toBe('testvalid')
    })

    it('should handle users with empty string IDs', () => {
      const users = createMockUsers(['', 'test-user'])
      const result = resolver.resolve('test-network', users)
      expect(result.confidence).toBe('medium')
      expect(result.userId).toBe('test-user')
    })
  })

  describe('case sensitivity', () => {
    const resolver = new PrefixMatchResolver(4)
    const users = createMockUsers(['Test-User-123', 'test-user-456'])

    it('should perform case-sensitive prefix matching', () => {
      const result1 = resolver.resolve('Test-network', users)
      expect(result1.confidence).toBe('medium')
      expect(result1.userId).toBe('Test-User-123')

      const result2 = resolver.resolve('test-network', users)
      expect(result2.confidence).toBe('medium')
      expect(result2.userId).toBe('test-user-456')

      const result3 = resolver.resolve('TEST-network', users)
      expect(result3.confidence).toBe('none')
    })
  })

  describe('special characters in prefixes', () => {
    const resolver = new PrefixMatchResolver(8)
    const users = createMockUsers([
      'user@dom-full-email',
      'user-hyp-hyphens',
      'user_und_underscores',
      'user.dot.periods',
      '12345678-numbers',
      'émojis🚀-unicode',
    ])

    it('should match prefixes with special characters', () => {
      expect(resolver.resolve('user@dom-different', users).userId).toBe('user@dom-full-email')
      expect(resolver.resolve('user-hyp-something', users).userId).toBe('user-hyp-hyphens')
      expect(resolver.resolve('user_und_different', users).userId).toBe('user_und_underscores')
      expect(resolver.resolve('user.dot.other', users).userId).toBe('user.dot.periods')
      expect(resolver.resolve('12345678-other', users).userId).toBe('12345678-numbers')
    })

    it('should handle Unicode characters in prefixes', () => {
      const result = resolver.resolve('émojis🚀-network', users)
      expect(result.confidence).toBe('medium')
      expect(result.userId).toBe('émojis🚀-unicode')
    })
  })

  describe('NAF data handling', () => {
    const resolver = new PrefixMatchResolver(4)
    const users = createMockUsers(['test-user-id'])

    it('should ignore NAF data for prefix matching', () => {
      const nafData = {
        networkId: 'different-network-id',
        owner: 'some-owner',
        creator: 'some-creator',
      }

      const result = resolver.resolve('test-network-id', users, nafData)
      expect(result.confidence).toBe('medium')
      expect(result.userId).toBe('test-user-id')
    })

    it('should work without NAF data', () => {
      const result = resolver.resolve('test-network-id', users)
      expect(result.confidence).toBe('medium')
    })
  })

  describe('performance and stress testing', () => {
    it('should handle large user lists efficiently', () => {
      const largeUserList = createMockUsers(
        Array.from({ length: 1000 }, (_, i) => `prefix${i.toString().padStart(4, '0')}-user-id`),
      )

      const resolver = new PrefixMatchResolver(10)
      const result = resolver.resolve('prefix0500-network-id', largeUserList)

      expect(result.confidence).toBe('medium')
      expect(result.userId).toBe('prefix0500-user-id')
    })

    it('should handle very long prefixes', () => {
      const longPrefix = 'a'.repeat(100)
      const users = createMockUsers([`${longPrefix}-user-id`])

      const resolver = new PrefixMatchResolver(50)
      const result = resolver.resolve(`${longPrefix}-network-id`, users)

      expect(result.confidence).toBe('medium')
      expect(result.userId).toBe(`${longPrefix}-user-id`)
    })

    it('should handle minimum length edge case', () => {
      const resolver = new PrefixMatchResolver(0) // Edge case: 0 length prefix means empty string matches
      const users = createMockUsers(['a'])

      const result = resolver.resolve('b', users)
      expect(result.confidence).toBe('medium') // Empty prefix matches all users with length >= 0
      expect(result.userId).toBe('a')
    })
  })
})
