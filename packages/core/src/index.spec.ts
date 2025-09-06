/**
 * Test for core module exports
 */

import { describe, expect, it } from 'vitest'
import * as CoreExports from './index.js'

describe('Core exports', () => {
  describe('Core Service Factory', () => {
    it('should export CoreServiceFactory', () => {
      expect(CoreExports.CoreServiceFactory).toBeDefined()
      expect(typeof CoreExports.CoreServiceFactory).toBe('function')
    })
  })

  describe('NAF Message Builder', () => {
    it('should export NafMessageBuilder', () => {
      expect(CoreExports.NafMessageBuilder).toBeDefined()
      expect(typeof CoreExports.NafMessageBuilder).toBe('function')
    })

    it('should export NafComponentId', () => {
      expect(CoreExports.NafComponentId).toBeDefined()
      expect(typeof CoreExports.NafComponentId).toBe('object')
    })
  })

  describe('Error classes', () => {
    it('should export animation error classes', () => {
      expect(CoreExports.AnimationNotFoundError).toBeDefined()
      expect(CoreExports.AnimationPlaybackError).toBeDefined()
      expect(CoreExports.AvatarNotSpawnedError).toBeDefined()
    })
  })

  describe('Service tokens', () => {
    it('should export AnimationService token', () => {
      expect(CoreExports.AnimationService).toBeDefined()
      expect(typeof CoreExports.AnimationService).toBe('function')
    })

    it('should export AppSettings token', () => {
      expect(CoreExports.AppSettings).toBeDefined()
      expect(typeof CoreExports.AppSettings).toBe('function')
    })

    it('should export AuthenticationService token', () => {
      expect(CoreExports.AuthenticationService).toBeDefined()
      expect(typeof CoreExports.AuthenticationService).toBe('function')
    })

    it('should export AvatarController token', () => {
      expect(CoreExports.AvatarController).toBeDefined()
      expect(typeof CoreExports.AvatarController).toBe('function')
    })

    it('should export ConfigurationProvider token', () => {
      expect(CoreExports.ConfigurationProvider).toBeDefined()
      expect(typeof CoreExports.ConfigurationProvider).toBe('function')
    })

    it('should export ConnectionManager token', () => {
      expect(CoreExports.ConnectionManager).toBeDefined()
      expect(typeof CoreExports.ConnectionManager).toBe('function')
    })

    it('should export EventBus token', () => {
      expect(CoreExports.EventBus).toBeDefined()
      expect(typeof CoreExports.EventBus).toBe('function')
    })

    it('should export MessageService token', () => {
      expect(CoreExports.MessageService).toBeDefined()
      expect(typeof CoreExports.MessageService).toBe('function')
    })

    it('should export OrganizationService token', () => {
      expect(CoreExports.OrganizationService).toBeDefined()
      expect(typeof CoreExports.OrganizationService).toBe('function')
    })

    it('should export PresenceManager token', () => {
      expect(CoreExports.PresenceManager).toBeDefined()
      expect(typeof CoreExports.PresenceManager).toBe('function')
    })

    it('should export UserAvatarManager token', () => {
      expect(CoreExports.UserAvatarManager).toBeDefined()
      expect(typeof CoreExports.UserAvatarManager).toBe('function')
    })
  })

  describe('System Events', () => {
    it('should export SystemEvents', () => {
      expect(CoreExports.SystemEvents).toBeDefined()
      expect(typeof CoreExports.SystemEvents).toBe('object')
      expect(CoreExports.SystemEvents.CONNECTION_ESTABLISHED).toBeDefined()
      expect(CoreExports.SystemEvents.CONNECTION_LOST).toBeDefined()
    })
  })

  describe('Logging', () => {
    it('should export logging utilities', () => {
      expect(CoreExports.DefaultLoggerProvider).toBeDefined()
      expect(CoreExports.getLoggerProvider).toBeDefined()
      expect(CoreExports.registerLoggerProvider).toBeDefined()
    })
  })

  describe('Service Container', () => {
    it('should export ServiceContainer', () => {
      expect(CoreExports.ServiceContainer).toBeDefined()
      expect(typeof CoreExports.ServiceContainer).toBe('function')
    })

    it('should export ServiceIdentifier', () => {
      expect(CoreExports.ServiceIdentifier).toBeDefined()
      expect(typeof CoreExports.ServiceIdentifier).toBe('function')
    })
  })

  describe('Channel Service', () => {
    it('should export ChannelService', () => {
      expect(CoreExports.ChannelService).toBeDefined()
      expect(typeof CoreExports.ChannelService).toBe('function')
    })
  })

  describe('Animation Types', () => {
    it('should export animation enums', () => {
      expect(CoreExports.AnimationLoopBehavior).toBeDefined()
      expect(CoreExports.PresetAnimationId).toBeDefined()
    })
  })

  describe('NAF utility functions', () => {
    it('should export NAF helper functions', () => {
      expect(CoreExports.extractAvatarData).toBeDefined()
      expect(CoreExports.extractBodyRotation).toBeDefined()
      expect(CoreExports.extractPosition).toBeDefined()
      expect(CoreExports.isNAFCreateMessage).toBeDefined()
      expect(CoreExports.isNAFMultiUpdateMessage).toBeDefined()
      expect(CoreExports.isNAFRemoveMessage).toBeDefined()
      expect(CoreExports.isTypedNAFMessage).toBeDefined()
    })
  })
})
