/**
 * Test for URL utilities
 */

import { describe, expect, it } from 'vitest'
import { parseUrl } from './url.js'

describe('parseUrl', () => {
  describe('valid URLs', () => {
    it('should parse HTTPS URL with room ID', () => {
      const result = parseUrl('https://example.com/test-room')

      expect(result).toEqual({
        serverUrl: 'wss://example.com',
        roomId: 'test-room',
      })
    })

    it('should parse HTTP URL', () => {
      const result = parseUrl('http://localhost/my-room')

      expect(result).toEqual({
        serverUrl: 'ws://localhost',
        roomId: 'my-room',
      })
    })

    it('should parse URL with port', () => {
      const result = parseUrl('https://example.com:8443/room123')

      expect(result).toEqual({
        serverUrl: 'wss://example.com:8443',
        roomId: 'room123',
      })
    })

    it('should parse URL with path segments', () => {
      const result = parseUrl('https://example.com/room-id/extra/path')

      expect(result).toEqual({
        serverUrl: 'wss://example.com',
        roomId: 'room-id',
      })
    })

    it('should use default room ID for root path', () => {
      const result = parseUrl('https://example.com/')

      expect(result).toEqual({
        serverUrl: 'wss://example.com',
        roomId: 'default',
      })
    })
  })

  describe('Metatell domain handling', () => {
    it('should remove tenant subdomain from metatell.app', () => {
      const result = parseUrl('https://tenant.metatell.app/room123')

      expect(result).toEqual({
        serverUrl: 'wss://metatell.app',
        roomId: 'room123',
      })
    })

    it('should remove tenant subdomain from metatell-stg.app', () => {
      const result = parseUrl('https://my-tenant.metatell-stg.app/staging-room')

      expect(result).toEqual({
        serverUrl: 'wss://metatell-stg.app',
        roomId: 'staging-room',
      })
    })

    it('should remove tenant subdomain from metatell-dev.app', () => {
      const result = parseUrl('https://dev.metatell-dev.app/dev-room')

      expect(result).toEqual({
        serverUrl: 'wss://metatell-dev.app',
        roomId: 'dev-room',
      })
    })

    it('should handle base Metatell domain without subdomain', () => {
      const result = parseUrl('https://metatell.app/room123')

      expect(result).toEqual({
        serverUrl: 'wss://metatell.app',
        roomId: 'room123',
      })
    })

    it('should preserve non-Metatell domains', () => {
      const result = parseUrl('https://subdomain.example.com/room')

      expect(result).toEqual({
        serverUrl: 'wss://subdomain.example.com',
        roomId: 'room',
      })
    })

    it('should not modify domains that contain but dont end with metatell.app', () => {
      const result = parseUrl('https://fakemetatell.app.com/room')

      expect(result).toEqual({
        serverUrl: 'wss://fakemetatell.app.com',
        roomId: 'room',
      })
    })
  })

  describe('error cases', () => {
    it('should throw error for invalid URL', () => {
      expect(() => parseUrl('not-a-url')).toThrow('Invalid URL')
    })

    it('should throw error for URL without protocol', () => {
      expect(() => parseUrl('example.com/room')).toThrow('Invalid URL')
    })

    it('should throw error for empty URL', () => {
      expect(() => parseUrl('')).toThrow('Invalid URL')
    })

    it('should throw error for null URL', () => {
      expect(() => parseUrl(null as unknown as string)).toThrow('Invalid URL')
    })

    it('should handle URLs with query parameters', () => {
      const result = parseUrl('https://example.com/room123?token=abc')

      expect(result).toEqual({
        serverUrl: 'wss://example.com',
        roomId: 'room123',
      })
    })

    it('should handle URLs with hash fragments', () => {
      const result = parseUrl('https://example.com/room123#section')

      expect(result).toEqual({
        serverUrl: 'wss://example.com',
        roomId: 'room123',
      })
    })
  })

  describe('edge cases', () => {
    it('should handle WebSocket protocol URLs', () => {
      const result = parseUrl('ws://localhost/room')

      expect(result).toEqual({
        serverUrl: 'ws://localhost',
        roomId: 'room',
      })
    })

    it('should handle secure WebSocket protocol URLs', () => {
      const result = parseUrl('wss://example.com/room')

      expect(result).toEqual({
        serverUrl: 'wss://example.com',
        roomId: 'room',
      })
    })

    it('should handle URLs with encoded room IDs', () => {
      const result = parseUrl('https://example.com/room%20with%20spaces')

      expect(result).toEqual({
        serverUrl: 'wss://example.com',
        roomId: 'room%20with%20spaces',
      })
    })

    it('should handle multiple subdomains on Metatell domains', () => {
      const result = parseUrl('https://a.b.c.metatell.app/room')

      expect(result).toEqual({
        serverUrl: 'wss://metatell.app',
        roomId: 'room',
      })
    })

    it('should handle IP addresses', () => {
      const result = parseUrl('https://192.168.1.1:8080/room')

      expect(result).toEqual({
        serverUrl: 'wss://192.168.1.1:8080',
        roomId: 'room',
      })
    })
  })
})
