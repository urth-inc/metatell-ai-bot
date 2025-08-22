import { describe, expect, it } from 'vitest'
import { parseCommand } from './plan.js'

describe('parseCommand', () => {
  describe('say command', () => {
    it('should parse say with message', () => {
      const result = parseCommand('/say hello world')
      expect(result).toEqual({
        kind: 'say',
        message: 'hello world',
      })
    })

    it('should error on missing message', () => {
      const result = parseCommand('/say')
      expect(result).toEqual({
        kind: 'error',
        message: 'Missing message',
        usage: '/say <message>',
      })
    })
  })

  describe('move command', () => {
    it('should parse move with coordinates', () => {
      const result = parseCommand('/move 1.5 2.0 -3.5')
      expect(result).toEqual({
        kind: 'move',
        x: 1.5,
        y: 2.0,
        z: -3.5,
      })
    })

    it('should error on invalid coordinates', () => {
      const result = parseCommand('/move 1 2')
      expect(result).toEqual({
        kind: 'error',
        message: 'Invalid arguments',
        usage: '/move <x> <y> <z>',
      })
    })

    it('should error on non-numeric coordinates', () => {
      const result = parseCommand('/move 1 2 abc')
      expect(result).toEqual({
        kind: 'error',
        message: 'Invalid coordinates',
        usage: '/move <x> <y> <z>',
      })
    })
  })

  describe('status command', () => {
    it('should parse status without flags', () => {
      const result = parseCommand('/status')
      expect(result).toEqual({
        kind: 'status',
      })
    })
  })

  describe('look command', () => {
    it('should parse look at position', () => {
      const result = parseCommand('/look 1 2 3')
      expect(result).toEqual({
        kind: 'look',
        target: { type: 'position', x: 1, y: 2, z: 3 },
      })
    })

    it('should parse look at user', () => {
      const result = parseCommand('/look user alice123')
      expect(result).toEqual({
        kind: 'look',
        target: { type: 'user', id: 'alice123' },
      })
    })

    it('should parse look at nearest', () => {
      const result = parseCommand('/look nearest')
      expect(result).toEqual({
        kind: 'look',
        target: { type: 'nearest' },
      })
    })

    it('should error on invalid arguments', () => {
      const result = parseCommand('/look')
      expect(result).toEqual({
        kind: 'error',
        message: 'Missing arguments',
        usage: '/look <x> <y> <z> | /look user <id> | /look nearest',
      })
    })
  })

  describe('nearby command', () => {
    it('should parse nearby without radius', () => {
      const result = parseCommand('/nearby')
      expect(result).toEqual({
        kind: 'nearby',
        radius: undefined,
      })
    })

    it('should parse nearby with radius', () => {
      const result = parseCommand('/nearby 10')
      expect(result).toEqual({
        kind: 'nearby',
        radius: 10,
      })
    })

    it('should error on invalid radius', () => {
      const result = parseCommand('/nearby abc')
      expect(result).toEqual({
        kind: 'error',
        message: 'Invalid radius',
        usage: '/nearby [radius]',
      })
    })
  })

  describe('users command', () => {
    it('should parse users without flags', () => {
      const result = parseCommand('/users')
      expect(result).toEqual({
        kind: 'users',
        nearby: undefined,
      })
    })

    it('should parse users with nearby flag', () => {
      const result = parseCommand('/users --nearby 10')
      expect(result).toEqual({
        kind: 'users',
        nearby: 10,
      })
    })

    it('should error on invalid nearby value', () => {
      const result = parseCommand('/users --nearby abc')
      expect(result).toEqual({
        kind: 'error',
        message: 'Invalid --nearby value',
        usage: '/users [--nearby <n>]',
      })
    })
  })

  describe('logs command', () => {
    it('should parse logs tail', () => {
      const result = parseCommand('/logs tail')
      expect(result).toEqual({
        kind: 'logs',
        subcommand: 'tail',
        arg: undefined,
      })
    })

    it('should parse logs filter with pattern', () => {
      const result = parseCommand('/logs filter error.*')
      expect(result).toEqual({
        kind: 'logs',
        subcommand: 'filter',
        arg: 'error.*',
      })
    })

    it('should parse logs clear', () => {
      const result = parseCommand('/logs clear')
      expect(result).toEqual({
        kind: 'logs',
        subcommand: 'clear',
        arg: undefined,
      })
    })

    it('should error on missing filter argument', () => {
      const result = parseCommand('/logs filter')
      expect(result).toEqual({
        kind: 'error',
        message: 'Missing argument for filter',
        usage: '/logs tail|filter <regex>|clear',
      })
    })

    it('should error on invalid subcommand', () => {
      const result = parseCommand('/logs invalid')
      expect(result).toEqual({
        kind: 'error',
        message: 'Invalid subcommand',
        usage: '/logs tail|filter <regex>|clear',
      })
    })
  })

  describe('help command', () => {
    it('should parse help', () => {
      const result = parseCommand('/help')
      expect(result).toEqual({
        kind: 'help',
      })
    })
  })

  describe('quit command', () => {
    it('should parse quit', () => {
      const result = parseCommand('/quit')
      expect(result).toEqual({
        kind: 'quit',
      })
    })
  })

  describe('aliases', () => {
    it('should resolve /? to /help', () => {
      const result = parseCommand('/?')
      expect(result).toEqual({
        kind: 'help',
      })
    })

    it('should resolve /exit to /quit', () => {
      const result = parseCommand('/exit')
      expect(result).toEqual({
        kind: 'quit',
      })
    })

    it('should resolve /q to /quit', () => {
      const result = parseCommand('/q')
      expect(result).toEqual({
        kind: 'quit',
      })
    })
  })

  describe('error handling', () => {
    it('should error on non-slash command', () => {
      const result = parseCommand('hello')
      expect(result).toEqual({
        kind: 'error',
        message: 'Commands must start with /',
        usage: 'Type /help for commands',
      })
    })

    it('should error on unknown command', () => {
      const result = parseCommand('/unknown')
      expect(result).toEqual({
        kind: 'error',
        message: 'Unknown command: /unknown',
        usage: 'Type /help for commands',
      })
    })
  })
})
