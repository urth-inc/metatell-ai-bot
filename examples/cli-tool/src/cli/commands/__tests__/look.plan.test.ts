import { describe, expect, it } from 'vitest'
import { parseCommand } from '../plan.js'

/**
 * Tests for /look command parsing in CLI
 * Covers command planning for coordinate and @username formats
 */

describe('parseLook Command Planning', () => {
  describe('coordinate format', () => {
    it('should parse valid coordinates', () => {
      const result = parseCommand('/look 1.5 2.0 -3.5')

      expect(result).toEqual({
        kind: 'look',
        target: {
          type: 'position',
          x: 1.5,
          y: 2.0,
          z: -3.5,
        },
      })
    })

    it('should parse integer coordinates', () => {
      const result = parseCommand('/look 0 1 -5')

      expect(result).toEqual({
        kind: 'look',
        target: {
          type: 'position',
          x: 0,
          y: 1,
          z: -5,
        },
      })
    })

    it('should reject invalid coordinate count', () => {
      const result = parseCommand('/look 1 2')

      expect(result).toEqual({
        kind: 'error',
        message: 'Invalid arguments',
        usage: '/look <x> <y> <z> | /look @<username> | /look nearest',
      })
    })

    it('should reject non-numeric coordinates', () => {
      const result = parseCommand('/look abc def ghi')

      expect(result).toEqual({
        kind: 'error',
        message: 'Invalid coordinates',
        usage: '/look <x> <y> <z>',
      })
    })

    it('should reject mixed valid/invalid coordinates', () => {
      const result = parseCommand('/look 1.0 abc 3.0')

      expect(result).toEqual({
        kind: 'error',
        message: 'Invalid coordinates',
        usage: '/look <x> <y> <z>',
      })
    })
  })

  describe('@username format', () => {
    it('should parse @username format', () => {
      const result = parseCommand('/look @TestUser')

      expect(result).toEqual({
        kind: 'look',
        target: {
          type: 'user',
          id: 'TestUser',
        },
      })
    })

    it('should parse @username with special characters', () => {
      const result = parseCommand('/look @User-Name_123')

      expect(result).toEqual({
        kind: 'look',
        target: {
          type: 'user',
          id: 'User-Name_123',
        },
      })
    })

    it('should reject empty username after @', () => {
      const result = parseCommand('/look @')

      expect(result).toEqual({
        kind: 'error',
        message: 'Invalid arguments',
        usage: '/look <x> <y> <z> | /look @<username> | /look nearest',
      })
    })

    it('should handle @ in the middle of argument', () => {
      const result = parseCommand('/look user@name')

      expect(result).toEqual({
        kind: 'error',
        message: 'Invalid arguments',
        usage: '/look <x> <y> <z> | /look @<username> | /look nearest',
      })
    })
  })

  describe('basic user format', () => {
    it('should parse "user <username>" format', () => {
      const result = parseCommand('/look user TestUser')

      expect(result).toEqual({
        kind: 'look',
        target: {
          type: 'user',
          id: 'TestUser',
        },
      })
    })

    it('should reject "user" without username', () => {
      const result = parseCommand('/look user')

      expect(result).toEqual({
        kind: 'error',
        message: 'Invalid arguments',
        usage: '/look <x> <y> <z> | /look @<username> | /look nearest',
      })
    })
  })

  describe('nearest format', () => {
    it('should parse "nearest" format', () => {
      const result = parseCommand('/look nearest')

      expect(result).toEqual({
        kind: 'look',
        target: {
          type: 'nearest',
        },
      })
    })
  })

  describe('error cases', () => {
    it('should show usage when no arguments provided', () => {
      const result = parseCommand('/look')

      expect(result).toEqual({
        kind: 'error',
        message: 'Missing arguments',
        usage: '/look <x> <y> <z> | /look @<username> | /look nearest',
      })
    })

    it('should handle too many arguments', () => {
      const result = parseCommand('/look 1 2 3 4')

      expect(result).toEqual({
        kind: 'error',
        message: 'Invalid arguments',
        usage: '/look <x> <y> <z> | /look @<username> | /look nearest',
      })
    })

    it('should handle invalid single argument', () => {
      const result = parseCommand('/look invalid')

      expect(result).toEqual({
        kind: 'error',
        message: 'Invalid arguments',
        usage: '/look <x> <y> <z> | /look @<username> | /look nearest',
      })
    })
  })

  describe('command aliases (handled by resolveAlias)', () => {
    it('should parse /lookat alias after resolution', () => {
      // Note: Alias resolution happens in resolveAlias function
      const result = parseCommand('/look 1 2 3')

      expect(result).toEqual({
        kind: 'look',
        target: {
          type: 'position',
          x: 1,
          y: 2,
          z: 3,
        },
      })
    })

    it('should show unknown command for unsupported alias', () => {
      // /lookat is not in COMMANDS array as an alias
      const result = parseCommand('/lookat 1 2 3')

      expect(result).toEqual({
        kind: 'error',
        message: 'Unknown command: /lookat',
        usage: 'Type /help for commands',
      })
    })
  })

  describe('edge cases', () => {
    it('should handle very small decimal values', () => {
      const result = parseCommand('/look 0.001 -0.001 0.0001')

      expect(result).toEqual({
        kind: 'look',
        target: {
          type: 'position',
          x: 0.001,
          y: -0.001,
          z: 0.0001,
        },
      })
    })

    it('should handle very large values', () => {
      const result = parseCommand('/look 999.999 -1000 1e6')

      expect(result).toEqual({
        kind: 'look',
        target: {
          type: 'position',
          x: 999.999,
          y: -1000,
          z: 1000000,
        },
      })
    })

    it('should handle scientific notation', () => {
      const result = parseCommand('/look 1e-3 2E2 -3.5e1')

      expect(result).toEqual({
        kind: 'look',
        target: {
          type: 'position',
          x: 0.001,
          y: 200,
          z: -35,
        },
      })
    })
  })
})
