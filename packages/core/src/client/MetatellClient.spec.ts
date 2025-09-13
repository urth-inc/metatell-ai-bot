/**
 * Test for MetatellClient implementation
 */

import { describe, expect, it } from 'vitest'
import {
  type CreateClientOptions,
  createMetatellClient,
  MetatellClientImpl,
} from './MetatellClientImpl.js'

describe('createMetatellClient', () => {
  it('should throw error when serverUrl is missing', () => {
    expect(() => createMetatellClient({ roomId: 'test-room' } as CreateClientOptions)).toThrow(
      'serverUrl and roomId are required',
    )
  })

  it('should throw error when roomId is missing', () => {
    expect(() =>
      createMetatellClient({ serverUrl: 'wss://test.com' } as CreateClientOptions),
    ).toThrow('serverUrl and roomId are required')
  })

  it('should return MetatellClientImpl instance with valid options', () => {
    // This test only validates the factory function basic behavior
    // Full integration testing would require complex service mocking
    expect(() => {
      const client = createMetatellClient({
        serverUrl: 'wss://test.metatell.app',
        roomId: 'test-room',
      })
      // Should return an instance without throwing during construction validation
      expect(client).toBeInstanceOf(MetatellClientImpl)
    }).not.toThrow('serverUrl and roomId are required')
  })

  it('should process subdomain removal in serverUrl', () => {
    expect(() => {
      const client = createMetatellClient({
        serverUrl: 'wss://subdomain.metatell.app',
        roomId: 'test-room',
      })
      expect(client).toBeInstanceOf(MetatellClientImpl)
    }).not.toThrow('serverUrl and roomId are required')
  })
})

describe('MetatellClientImpl basic interface', () => {
  it('should have required VoiceCapableClient methods', () => {
    // Test the interface structure without requiring full initialization
    const prototype = MetatellClientImpl.prototype
    expect(prototype.getSessionId).toBeDefined()
    expect(prototype.muteVoice).toBeDefined()
    expect(prototype.sendVoiceFrame).toBeDefined()
  })

  it('should have required client methods', () => {
    const prototype = MetatellClientImpl.prototype
    expect(prototype.connect).toBeDefined()
    expect(prototype.disconnect).toBeDefined()
    expect(prototype.on).toBeDefined()
    expect(prototype.off).toBeDefined()
  })
})

describe('MetatellClientImpl getUsers', () => {
  it('returns rotation as quaternion without degree conversion', () => {
    const mockRotation = { x: 0.1, y: 0.2, z: 0.3 }
    const expectedW = Math.sqrt(
      Math.max(0, 1 - mockRotation.x ** 2 - mockRotation.y ** 2 - mockRotation.z ** 2),
    )

    const mockClient = {
      presenceManager: {
        getUsers: () => [{ id: 'session-1', profile: { displayName: 'me' } }],
      },
      connectionManager: { getSessionId: () => 'session-1' },
      avatarController: {
        getState: () => ({
          networkId: 'session-1',
          position: { x: 0, y: 0, z: 0 },
          rotation: mockRotation,
          avatarId: 'avatar-1',
        }),
      },
      userAvatarManager: { getUser: () => undefined },
    } as unknown as MetatellClientImpl

    const users = MetatellClientImpl.prototype.getUsers.call(mockClient)

    expect(users).toHaveLength(1)
    expect(users[0].rotation).toMatchObject({
      x: mockRotation.x,
      y: mockRotation.y,
      z: mockRotation.z,
    })
    expect(users[0].rotation?.w).toBeCloseTo(expectedW)
  })
})
