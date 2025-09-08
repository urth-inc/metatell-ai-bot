/**
 * Unit tests for CompositeUserIdResolver
 */

import { describe, expect, it, vi } from 'vitest'
import type { PresenceUser } from '../../../interfaces/IPresenceManager.js'
import type { NAFComponent } from '../../../types/index.js'
import { CompositeUserIdResolver } from '../CompositeUserIdResolver.js'
import { CreatorMatchResolver } from '../CreatorMatchResolver.js'
import { ExactMatchResolver } from '../ExactMatchResolver.js'
import type { IdResolutionResult, IUserIdResolver } from '../IUserIdResolver.js'
import { OwnerMatchResolver } from '../OwnerMatchResolver.js'
import { PrefixMatchResolver } from '../PrefixMatchResolver.js'

describe('CompositeUserIdResolver', () => {
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
      const resolver = new CompositeUserIdResolver()
      expect(resolver.getName()).toBe('composite')
      expect(resolver.getPriority()).toBe(0)
    })

    it('should initialize empty', () => {
      const resolver = new CompositeUserIdResolver()
      expect(resolver.getResolvers()).toHaveLength(0)
    })

    it('should initialize with provided resolvers', () => {
      const exactResolver = new ExactMatchResolver()
      const creatorResolver = new CreatorMatchResolver()

      const resolver = new CompositeUserIdResolver([exactResolver, creatorResolver])
      expect(resolver.getResolvers()).toHaveLength(2)
    })
  })

  describe('resolver management', () => {
    it('should add resolvers correctly', () => {
      const resolver = new CompositeUserIdResolver()
      const exactResolver = new ExactMatchResolver()
      const creatorResolver = new CreatorMatchResolver()

      resolver.addResolver(exactResolver)
      expect(resolver.getResolvers()).toHaveLength(1)

      resolver.addResolver(creatorResolver)
      expect(resolver.getResolvers()).toHaveLength(2)
    })

    it('should remove resolvers correctly', () => {
      const exactResolver = new ExactMatchResolver()
      const creatorResolver = new CreatorMatchResolver()
      const resolver = new CompositeUserIdResolver([exactResolver, creatorResolver])

      expect(resolver.getResolvers()).toHaveLength(2)

      resolver.removeResolver('exact-match')
      expect(resolver.getResolvers()).toHaveLength(1)
      expect(resolver.getResolvers()[0].getName()).toBe('creator-match')

      resolver.removeResolver('creator-match')
      expect(resolver.getResolvers()).toHaveLength(0)
    })

    it('should not add duplicate resolvers with same name', () => {
      const resolver = new CompositeUserIdResolver()
      const exactResolver1 = new ExactMatchResolver()
      const exactResolver2 = new ExactMatchResolver()

      resolver.addResolver(exactResolver1)
      resolver.addResolver(exactResolver2)

      expect(resolver.getResolvers()).toHaveLength(1)
    })

    it('should ignore removal of non-existent resolver', () => {
      const resolver = new CompositeUserIdResolver([new ExactMatchResolver()])

      resolver.removeResolver('non-existent')
      expect(resolver.getResolvers()).toHaveLength(1)
    })
  })

  describe('priority ordering', () => {
    it('should sort resolvers by priority (lower number = higher priority)', () => {
      const resolver = new CompositeUserIdResolver()

      // Add resolvers in reverse priority order
      resolver.addResolver(new PrefixMatchResolver()) // priority 4
      resolver.addResolver(new OwnerMatchResolver()) // priority 3
      resolver.addResolver(new CreatorMatchResolver()) // priority 2
      resolver.addResolver(new ExactMatchResolver()) // priority 1

      const resolvers = resolver.getResolvers()
      expect(resolvers[0].getName()).toBe('exact-match') // priority 1
      expect(resolvers[1].getName()).toBe('creator-match') // priority 2
      expect(resolvers[2].getName()).toBe('owner-match') // priority 3
      expect(resolvers[3].getName()).toBe('prefix-match') // priority 4
    })

    it('should maintain order when adding resolvers dynamically', () => {
      const resolver = new CompositeUserIdResolver()

      resolver.addResolver(new OwnerMatchResolver()) // priority 3
      resolver.addResolver(new ExactMatchResolver()) // priority 1
      resolver.addResolver(new CreatorMatchResolver()) // priority 2

      const resolvers = resolver.getResolvers()
      expect(resolvers.map((r) => r.getName())).toEqual([
        'exact-match',
        'creator-match',
        'owner-match',
      ])
    })

    it('should re-sort when resolvers are removed', () => {
      const resolver = new CompositeUserIdResolver([
        new ExactMatchResolver(),
        new CreatorMatchResolver(),
        new OwnerMatchResolver(),
      ])

      resolver.removeResolver('creator-match')

      const resolvers = resolver.getResolvers()
      expect(resolvers.map((r) => r.getName())).toEqual(['exact-match', 'owner-match'])
    })
  })

  describe('resolution chain behavior', () => {
    it('should return first successful resolution', () => {
      const users = createMockUsers(['exact-user', 'other-user'])
      const nafData = createNafData('exact-user', 'different-owner')

      const resolver = new CompositeUserIdResolver([
        new ExactMatchResolver(),
        new CreatorMatchResolver(),
        new OwnerMatchResolver(),
      ])

      const result = resolver.resolve('exact-user', users, nafData)

      expect(result.userId).toBe('exact-user')
      expect(result.strategy).toBe('exact-match')
      expect(result.confidence).toBe('exact')
    })

    it('should fall through to next resolver when first fails', () => {
      const users = createMockUsers(['creator-user'])
      const nafData = createNafData('creator-user', 'owner-user')

      const resolver = new CompositeUserIdResolver([
        new ExactMatchResolver(), // will fail - no user with networkId
        new CreatorMatchResolver(), // should succeed
        new OwnerMatchResolver(),
      ])

      const result = resolver.resolve('non-existent-user', users, nafData)

      expect(result.userId).toBe('creator-user')
      expect(result.strategy).toBe('creator-match')
      expect(result.confidence).toBe('high')
    })

    it('should continue chain until successful resolution', () => {
      const users = createMockUsers(['owner-user'])
      const nafData = createNafData(undefined, 'owner-user') // no creator, only owner

      const resolver = new CompositeUserIdResolver([
        new ExactMatchResolver(), // will fail
        new CreatorMatchResolver(), // will fail - no creator in nafData
        new OwnerMatchResolver(), // should succeed
      ])

      const result = resolver.resolve('non-existent', users, nafData)

      expect(result.userId).toBe('owner-user')
      expect(result.strategy).toBe('owner-match')
      expect(result.confidence).toBe('high')
    })

    it('should return none when all resolvers fail', () => {
      const users = createMockUsers(['some-user'])
      const nafData = createNafData(undefined, undefined) // no creator or owner

      const resolver = new CompositeUserIdResolver([
        new ExactMatchResolver(),
        new CreatorMatchResolver(),
        new OwnerMatchResolver(),
      ])

      const result = resolver.resolve('non-existent', users, nafData)

      expect(result.userId).toBeUndefined()
      expect(result.strategy).toBeUndefined()
      expect(result.confidence).toBe('none')
    })
  })

  describe('mock resolver testing', () => {
    const createMockResolver = (
      name: string,
      priority: number,
      result: IdResolutionResult,
    ): IUserIdResolver => ({
      getName: () => name,
      getPriority: () => priority,
      resolve: vi.fn().mockReturnValue(result),
    })

    it('should call resolvers in priority order', () => {
      const lowPriorityResolver = createMockResolver('low', 10, { confidence: 'none' })
      const highPriorityResolver = createMockResolver('high', 1, {
        userId: 'found',
        strategy: 'high',
        confidence: 'exact',
      })

      const resolver = new CompositeUserIdResolver([lowPriorityResolver, highPriorityResolver])
      const users = createMockUsers(['test-user'])

      const result = resolver.resolve('test-network', users)

      expect(highPriorityResolver.resolve).toHaveBeenCalledWith('test-network', users, undefined)
      expect(lowPriorityResolver.resolve).not.toHaveBeenCalled() // Should not be called due to early return
      expect(result.userId).toBe('found')
    })

    it('should continue to next resolver when previous returns none', () => {
      const firstResolver = createMockResolver('first', 1, { confidence: 'none' })
      const secondResolver = createMockResolver('second', 2, {
        userId: 'second-found',
        strategy: 'second',
        confidence: 'high',
      })

      const resolver = new CompositeUserIdResolver([firstResolver, secondResolver])
      const users = createMockUsers(['test-user'])

      const result = resolver.resolve('test-network', users)

      expect(firstResolver.resolve).toHaveBeenCalled()
      expect(secondResolver.resolve).toHaveBeenCalled()
      expect(result.userId).toBe('second-found')
    })

    it('should stop at first successful resolution with non-none confidence', () => {
      const resolvers = [
        createMockResolver('first', 1, {
          userId: 'first',
          confidence: 'medium',
          strategy: 'first',
        }),
        createMockResolver('second', 2, {
          userId: 'second',
          confidence: 'high',
          strategy: 'second',
        }),
        createMockResolver('third', 3, { userId: 'third', confidence: 'exact', strategy: 'third' }),
      ]

      const resolver = new CompositeUserIdResolver(resolvers)
      const users = createMockUsers(['test-user'])

      const result = resolver.resolve('test-network', users)

      expect(resolvers[0].resolve).toHaveBeenCalled()
      expect(resolvers[1].resolve).not.toHaveBeenCalled()
      expect(resolvers[2].resolve).not.toHaveBeenCalled()
      expect(result.userId).toBe('first')
    })
  })

  describe('edge cases', () => {
    it('should handle empty resolver list', () => {
      const resolver = new CompositeUserIdResolver()
      const users = createMockUsers(['test-user'])

      const result = resolver.resolve('test-network', users)
      expect(result.confidence).toBe('none')
    })

    it('should handle null/undefined NAF data', () => {
      const resolver = new CompositeUserIdResolver([new ExactMatchResolver()])
      const users = createMockUsers(['test-user'])

      const result1 = resolver.resolve('test-user', users, null as unknown as NAFComponent)
      const result2 = resolver.resolve('test-user', users, undefined)

      expect(result1.confidence).toBe('exact')
      expect(result2.confidence).toBe('exact')
    })

    it('should handle empty user list', () => {
      const resolver = new CompositeUserIdResolver([new ExactMatchResolver()])

      const result = resolver.resolve('test-user', [])
      expect(result.confidence).toBe('none')
    })

    it('should handle resolver that returns result without userId', () => {
      const createMockResolver = (
        name: string,
        priority: number,
        result: IdResolutionResult,
      ): IUserIdResolver => ({
        getName: () => name,
        getPriority: () => priority,
        resolve: vi.fn().mockReturnValue(result),
      })

      const brokenResolver = createMockResolver('broken', 1, {
        confidence: 'high', // has confidence but no userId
      })

      const resolver = new CompositeUserIdResolver([brokenResolver])
      const users = createMockUsers(['test-user'])

      const result = resolver.resolve('test-network', users)
      expect(result.confidence).toBe('none')
    })
  })

  describe('real-world integration scenarios', () => {
    it('should prioritize exact match over other matches', () => {
      const users = createMockUsers(['user-123', 'creator-456', 'owner-789'])
      const nafData = createNafData('creator-456', 'owner-789')

      const resolver = new CompositeUserIdResolver([
        new PrefixMatchResolver(4), // lowest priority
        new OwnerMatchResolver(),
        new CreatorMatchResolver(),
        new ExactMatchResolver(), // highest priority
      ])

      const result = resolver.resolve('user-123', users, nafData)

      expect(result.userId).toBe('user-123')
      expect(result.strategy).toBe('exact-match')
      expect(result.confidence).toBe('exact')
    })

    it('should use creator match when exact match fails', () => {
      const users = createMockUsers(['creator-456', 'owner-789'])
      const nafData = createNafData('creator-456', 'owner-789')

      const resolver = new CompositeUserIdResolver([
        new ExactMatchResolver(), // will fail
        new CreatorMatchResolver(), // should succeed
        new OwnerMatchResolver(),
      ])

      const result = resolver.resolve('non-existent-user', users, nafData)

      expect(result.userId).toBe('creator-456')
      expect(result.strategy).toBe('creator-match')
      expect(result.confidence).toBe('high')
    })

    it('should fall back to prefix match when other methods fail', () => {
      const users = createMockUsers(['user-123456-full-id'])

      const resolver = new CompositeUserIdResolver([
        new ExactMatchResolver(), // will fail
        new CreatorMatchResolver(), // will fail - no NAF data
        new OwnerMatchResolver(), // will fail - no NAF data
        new PrefixMatchResolver(8), // should succeed with prefix
      ])

      const result = resolver.resolve('user-123456-different-suffix', users)

      expect(result.userId).toBe('user-123456-full-id')
      expect(result.strategy).toBe('prefix-match')
      expect(result.confidence).toBe('medium')
    })
  })
})
