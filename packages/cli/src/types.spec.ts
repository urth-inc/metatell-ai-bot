import { describe, expect, it } from 'vitest'
import type { CliOptions } from './types.js'

describe('CLI Types', () => {
  describe('CliOptions', () => {
    it('should have correct structure for CliOptions interface', () => {
      const options: CliOptions = {
        token: 'test-token',
        name: 'test-bot',
        debug: true,
      }

      expect(options.token).toBe('test-token')
      expect(options.name).toBe('test-bot')
      expect(options.debug).toBe(true)
    })

    it('should allow partial CliOptions', () => {
      const options: CliOptions = {
        token: 'test-token',
      }

      expect(options.token).toBe('test-token')
      expect(options.name).toBeUndefined()
      expect(options.debug).toBeUndefined()
    })

    it('should allow empty CliOptions', () => {
      const options: CliOptions = {}

      expect(options.token).toBeUndefined()
      expect(options.name).toBeUndefined()
      expect(options.debug).toBeUndefined()
    })
  })
})
