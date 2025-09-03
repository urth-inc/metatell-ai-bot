import { describe, expect, it } from 'vitest'
import {
  isMetatellDomain,
  processMetatellUrl,
  removeMetatellTenantSubdomain,
} from './metatell-url.js'

describe('metatell-url utilities', () => {
  describe('isMetatellDomain', () => {
    it('should detect metatell domains', () => {
      expect(isMetatellDomain('metatell.app')).toBe(true)
      expect(isMetatellDomain('metatell-stg.app')).toBe(true)
      expect(isMetatellDomain('metatell-dev.app')).toBe(true)
      expect(isMetatellDomain('tenant.metatell.app')).toBe(true)
      expect(isMetatellDomain('urth.metatell-stg.app')).toBe(true)
    })

    it('should not detect non-metatell domains', () => {
      expect(isMetatellDomain('example.com')).toBe(false)
      expect(isMetatellDomain('google.com')).toBe(false)
      expect(isMetatellDomain('metatell-fake.app')).toBe(false)
    })
  })

  describe('removeMetatellTenantSubdomain', () => {
    it('should remove tenant subdomain from metatell.app', () => {
      expect(removeMetatellTenantSubdomain('tenant.metatell.app')).toBe('metatell.app')
      expect(removeMetatellTenantSubdomain('urth.metatell.app')).toBe('metatell.app')
    })

    it('should remove tenant subdomain from metatell-stg.app', () => {
      expect(removeMetatellTenantSubdomain('tenant.metatell-stg.app')).toBe('metatell-stg.app')
      expect(removeMetatellTenantSubdomain('urth.metatell-stg.app')).toBe('metatell-stg.app')
    })

    it('should remove tenant subdomain from metatell-dev.app', () => {
      expect(removeMetatellTenantSubdomain('tenant.metatell-dev.app')).toBe('metatell-dev.app')
    })

    it('should not change base metatell domains', () => {
      expect(removeMetatellTenantSubdomain('metatell.app')).toBe('metatell.app')
      expect(removeMetatellTenantSubdomain('metatell-stg.app')).toBe('metatell-stg.app')
      expect(removeMetatellTenantSubdomain('metatell-dev.app')).toBe('metatell-dev.app')
    })

    it('should not change non-metatell domains', () => {
      expect(removeMetatellTenantSubdomain('example.com')).toBe('example.com')
      expect(removeMetatellTenantSubdomain('sub.example.com')).toBe('sub.example.com')
      expect(removeMetatellTenantSubdomain('deep.sub.example.com')).toBe('deep.sub.example.com')
    })
  })

  describe('processMetatellUrl', () => {
    it('should process metatell.app URLs correctly', () => {
      const result = processMetatellUrl('https://tenant.metatell.app/hubId123/')
      expect(result).toEqual({
        serverUrl: 'wss://metatell.app',
        hubId: 'hubId123',
      })
    })

    it('should process metatell-stg.app URLs correctly', () => {
      const result = processMetatellUrl('https://urth.metatell-stg.app/hEsX4rS/')
      expect(result).toEqual({
        serverUrl: 'wss://metatell-stg.app',
        hubId: 'hEsX4rS',
      })
    })

    it('should process non-metatell URLs without modification', () => {
      const result = processMetatellUrl('https://example.com/roomId/')
      expect(result).toEqual({
        serverUrl: 'wss://example.com',
        hubId: 'roomId',
      })
    })

    it('should handle URLs with ports', () => {
      const result = processMetatellUrl('https://metatell.app:8080/hubId/')
      expect(result).toEqual({
        serverUrl: 'wss://metatell.app:8080',
        hubId: 'hubId',
      })
    })

    it('should handle http URLs', () => {
      const result = processMetatellUrl('http://metatell-dev.app/hubId/')
      expect(result).toEqual({
        serverUrl: 'ws://metatell-dev.app',
        hubId: 'hubId',
      })
    })

    it('should throw error for URLs without hub ID', () => {
      expect(() => processMetatellUrl('https://metatell.app/')).toThrow(
        'Invalid room URL: hub ID not found',
      )
      expect(() => processMetatellUrl('https://metatell.app')).toThrow(
        'Invalid room URL: hub ID not found',
      )
    })
  })
})
