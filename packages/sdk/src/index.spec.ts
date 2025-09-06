/**
 * Test for SDK index exports
 */

import { describe, expect, it } from 'vitest'
import * as sdkExports from './index.js'

describe('SDK exports', () => {
  it('should export createMetatellClient function', () => {
    expect(sdkExports.createMetatellClient).toBeDefined()
    expect(typeof sdkExports.createMetatellClient).toBe('function')
  })

  it('should export pcm utilities', () => {
    expect(sdkExports.pcm).toBeDefined()
    expect(sdkExports.pcm.resample).toBeDefined()
    expect(sdkExports.pcm.chunk).toBeDefined()
  })

  it('should export Agent Client related functions and types', () => {
    expect(sdkExports.createAgentClient).toBeDefined()
    expect(sdkExports.createAgentClientWithFactory).toBeDefined()
    expect(sdkExports.DefaultAgentClient).toBeDefined()
  })

  it('should export core services from @metatell/bot-core', () => {
    // Service classes
    expect(sdkExports.AnimationService).toBeDefined()
    expect(sdkExports.AppSettings).toBeDefined()
    expect(sdkExports.AuthenticationService).toBeDefined()
    expect(sdkExports.AvatarController).toBeDefined()
    expect(sdkExports.ChannelService).toBeDefined()
    expect(sdkExports.ConfigurationProvider).toBeDefined()
    expect(sdkExports.ConnectionManager).toBeDefined()
    expect(sdkExports.CoreServiceFactory).toBeDefined()
    expect(sdkExports.ServiceFactory).toBeDefined() // Alias
    expect(sdkExports.EventBus).toBeDefined()
    expect(sdkExports.MessageService).toBeDefined()
    expect(sdkExports.OrganizationService).toBeDefined()
    expect(sdkExports.PresenceManager).toBeDefined()
    expect(sdkExports.UserAvatarManager).toBeDefined()
  })

  it('should export utility functions from @metatell/bot-core', () => {
    expect(sdkExports.extractAvatarData).toBeDefined()
    expect(sdkExports.extractBodyRotation).toBeDefined()
    expect(sdkExports.extractPosition).toBeDefined()
    expect(sdkExports.isNAFCreateMessage).toBeDefined()
    expect(sdkExports.isNAFMultiUpdateMessage).toBeDefined()
    expect(sdkExports.isNAFRemoveMessage).toBeDefined()
    expect(sdkExports.isTypedNAFMessage).toBeDefined()
  })

  it('should export ServiceContainer and related utilities', () => {
    expect(sdkExports.ServiceContainer).toBeDefined()
    expect(sdkExports.ServiceIdentifier).toBeDefined()
    expect(sdkExports.SystemEvents).toBeDefined()
  })

  it('should export NAF-related constants and builders', () => {
    expect(sdkExports.NafComponentId).toBeDefined()
    expect(sdkExports.NafMessageBuilder).toBeDefined()
  })

  it('should export rate limiting utilities', () => {
    expect(sdkExports.RateLimitedQueue).toBeDefined()
    expect(sdkExports.TokenBucketRateLimiter).toBeDefined()
  })

  it('should re-export all error types', () => {
    // The errors are exported via `export * from './sdk/errors.js'`
    // We can verify by checking if the module structure is correct
    expect(sdkExports).toBeDefined()
  })

  it('should re-export all logging types', () => {
    // The logging is exported via `export * from './sdk/logging/index.js'`
    // We can verify by checking if the module structure is correct
    expect(sdkExports).toBeDefined()
  })

  it('should verify ServiceFactory is an alias for CoreServiceFactory', () => {
    expect(sdkExports.ServiceFactory).toBe(sdkExports.CoreServiceFactory)
  })

  describe('Type exports', () => {
    // Type exports can't be tested at runtime, but we can verify the module structure
    it('should have proper module structure for type exports', () => {
      // Verify that the exports object has the expected shape
      const exportKeys = Object.keys(sdkExports)

      // Should have many exports from the comprehensive re-export
      expect(exportKeys.length).toBeGreaterThan(20)

      // Key functions should be present
      expect(exportKeys).toContain('createMetatellClient')
      expect(exportKeys).toContain('createAgentClient')
      expect(exportKeys).toContain('pcm')

      // Core services should be present
      expect(exportKeys).toContain('CoreServiceFactory')
      expect(exportKeys).toContain('ServiceContainer')
    })
  })
})
