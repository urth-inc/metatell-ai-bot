import { describe, expect, it } from 'vitest'
import { parseCommand } from './plan.js'

describe('parseCommand', () => {
  describe('connect command', () => {
    it('should parse connect with all flags', () => {
      const result = parseCommand(
        '/connect --url wss://example.com --token abc123 --room lobby --join',
      )
      expect(result).toEqual({
        kind: 'connect',
        url: 'wss://example.com',
        token: 'abc123',
        room: 'lobby',
        join: true,
      })
    })

    it('should parse connect with minimal flags', () => {
      const result = parseCommand('/connect --url wss://example.com')
      expect(result).toEqual({
        kind: 'connect',
        url: 'wss://example.com',
        token: undefined,
        room: undefined,
        join: false,
      })
    })

    it('should error on missing url', () => {
      const result = parseCommand('/connect')
      expect(result).toEqual({
        kind: 'error',
        message: 'Missing --url',
        usage: '/connect --url <wss> [--token <str|@file>] [--room <id>] [--join]',
      })
    })
  })

  describe('status command', () => {
    it('should parse status without flags', () => {
      const result = parseCommand('/status')
      expect(result).toEqual({
        kind: 'status',
        json: false,
      })
    })

    it('should parse status with json flag', () => {
      const result = parseCommand('/status --json')
      expect(result).toEqual({
        kind: 'status',
        json: true,
      })
    })
  })

  describe('say command', () => {
    it('should parse say with message', () => {
      const result = parseCommand('/say Hello world!')
      expect(result).toEqual({
        kind: 'say',
        message: 'Hello world!',
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
    it('should parse move with valid coordinates', () => {
      const result = parseCommand('/move 1.5 2.0 -3.5')
      expect(result).toEqual({
        kind: 'move',
        x: 1.5,
        y: 2.0,
        z: -3.5,
      })
    })

    it('should error on invalid coordinates', () => {
      const result = parseCommand('/move 1 2 abc')
      expect(result).toEqual({
        kind: 'error',
        message: 'Invalid coordinates',
        usage: '/move <x> <y> <z>',
      })
    })

    it('should error on missing coordinates', () => {
      const result = parseCommand('/move 1 2')
      expect(result).toEqual({
        kind: 'error',
        message: 'Invalid arguments',
        usage: '/move <x> <y> <z>',
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
  })

  describe('users command', () => {
    it('should parse users list', () => {
      const result = parseCommand('/users list')
      expect(result).toEqual({
        kind: 'users',
        subcommand: 'list',
        nearby: undefined,
      })
    })

    it('should parse users json with nearby filter', () => {
      const result = parseCommand('/users json --nearby 10')
      expect(result).toEqual({
        kind: 'users',
        subcommand: 'json',
        nearby: 10,
      })
    })

    it('should error on invalid subcommand', () => {
      const result = parseCommand('/users invalid')
      expect(result).toEqual({
        kind: 'error',
        message: 'Invalid subcommand',
        usage: '/users list|json|count [--nearby <n>]',
      })
    })
  })

  describe('logs command', () => {
    it('should parse logs filter', () => {
      const result = parseCommand('/logs filter ERROR|WARN')
      expect(result).toEqual({
        kind: 'logs',
        subcommand: 'filter',
        arg: 'ERROR|WARN',
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
        usage: '/logs tail|filter <regex>|clear|save <path>',
      })
    })
  })

  describe('aliases', () => {
    it('should resolve /? to /help', () => {
      const result = parseCommand('/?')
      expect(result).toEqual({ kind: 'help' })
    })

    it('should resolve /exit to /quit', () => {
      const result = parseCommand('/exit')
      expect(result).toEqual({ kind: 'quit' })
    })

    it('should resolve /q to /quit', () => {
      const result = parseCommand('/q')
      expect(result).toEqual({ kind: 'quit' })
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
