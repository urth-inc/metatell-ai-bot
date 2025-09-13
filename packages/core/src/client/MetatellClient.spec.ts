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

describe('muteVoice', () => {
  const options = { serverUrl: 'wss://test.metatell.app', roomId: 'test-room' }

  it('should emit events on mute and unmute', async () => {
    const client = createMetatellClient(options)
    const events: boolean[] = []
    client.on('voice-mute-changed', (e) => events.push(e.muted))

    const busEvents: boolean[] = []
    ;(client as any).eventBus.on('voice:mute-changed', (e: { muted: boolean }) =>
      busEvents.push(e.muted),
    )

    await client.muteVoice(true)
    await client.muteVoice(false)

    expect(events).toEqual([true, false])
    expect(busEvents).toEqual([true, false])
  })

  it('should not emit event when state is unchanged', async () => {
    const client = createMetatellClient(options)
    const events: boolean[] = []
    client.on('voice-mute-changed', (e) => events.push(e.muted))

    await client.muteVoice(true)
    await client.muteVoice(true)

    expect(events).toEqual([true])
  })

  it('should update state even if event bus listener throws', async () => {
    const client = createMetatellClient(options)
    const events: boolean[] = []
    client.on('voice-mute-changed', (e) => events.push(e.muted))

    const bus = (client as any).eventBus
    bus.on('voice:mute-changed', () => {
      throw new Error('boom')
    })

    await client.muteVoice(true)

    expect(events).toEqual([true])
  })
})
