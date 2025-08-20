import { describe, it, expect } from 'vitest'
import { NafMessageBuilder, NafComponentId } from './NafMessageBuilder.js'

describe('NafMessageBuilder', () => {
  it('should build a basic NAF message', () => {
    const message = new NafMessageBuilder()
      .withNetworkId('test-network-id')
      .withOwner('test-owner')
      .withCreator('test-creator')
      .build()

    expect(message.dataType).toBe('u')
    expect(message.data.networkId).toBe('test-network-id')
    expect(message.data.owner).toBe('test-owner')
    expect(message.data.creator).toBe('test-creator')
    expect(message.data.template).toBe('#remote-avatar')
  })

  it('should build a message with position', () => {
    const position = { x: 10, y: 20, z: 30 }
    const message = new NafMessageBuilder()
      .withNetworkId('test-id')
      .withOwner('owner')
      .withCreator('creator')
      .withPosition(position)
      .build()

    expect(message.data.components?.[NafComponentId.Position]).toEqual({
      isVector3: true,
      ...position,
    })
  })

  it('should build a message with avatar configuration', () => {
    const message = new NafMessageBuilder()
      .withNetworkId('test-id')
      .withOwner('owner')
      .withCreator('creator')
      .withAvatar({
        avatarSrc: 'https://example.com/avatar.glb',
        avatarType: 'custom',
        muted: true,
      })
      .build()

    expect(message.data.components?.[NafComponentId.Avatar]).toEqual({
      avatarSrc: 'https://example.com/avatar.glb',
      avatarType: 'custom',
      muted: true,
      isSharingAvatarCamera: false,
    })
  })

  it('should build a message with first sync flag', () => {
    const message = new NafMessageBuilder()
      .withNetworkId('test-id')
      .withOwner('owner')
      .withCreator('creator')
      .withFirstSync(true)
      .build()

    expect(message.data.isFirstSync).toBe(true)
  })

  it('should build a multi-data message', () => {
    const message = new NafMessageBuilder()
      .withDataType('um')
      .withNetworkId('test-id')
      .withOwner('owner')
      .withCreator('creator')
      .build()

    expect(message.dataType).toBe('um')
    expect(message.data.d).toBeDefined()
    expect(message.data.d?.[0].networkId).toBe('test-id')
  })

  it('should include default components', () => {
    const message = new NafMessageBuilder()
      .withNetworkId('test-id')
      .withOwner('owner')
      .withCreator('creator')
      .build()

    const components = message.data.components
    expect(components?.[NafComponentId.Position]).toEqual({
      isVector3: true,
      x: 0,
      y: 0,
      z: 0,
    })
    expect(components?.[NafComponentId.Scale]).toEqual({ x: 1, y: 1, z: 1 })
    expect(components?.[NafComponentId.HandRaised]).toBe(false)
  })

  it('should throw error if required fields are missing', () => {
    expect(() => {
      new NafMessageBuilder().build()
    }).toThrow('networkId, owner, and creator are required')
  })

  it('should build a message with all rotation components', () => {
    const message = new NafMessageBuilder()
      .withNetworkId('test-id')
      .withOwner('owner')
      .withCreator('creator')
      .withBodyRotation({ x: 90, y: 180, z: 0 })
      .withHeadRotation({ x: 0, y: 0.7071, z: 0, w: 0.7071 })
      .withLeftHandRotation({ x: 0.5, y: 0.5, z: 0.5, w: 0.5 })
      .withRightHandRotation({ x: 0, y: 1, z: 0, w: 0 })
      .build()

    expect(message.data.components?.[NafComponentId.BodyRotation]).toEqual({
      x: 90,
      y: 180,
      z: 0,
    })
    expect(message.data.components?.[NafComponentId.HeadRotation]).toEqual({
      x: 0,
      y: 0.7071,
      z: 0,
      w: 0.7071,
    })
  })

  it('should build a message with hand positions', () => {
    const message = new NafMessageBuilder()
      .withNetworkId('test-id')
      .withOwner('owner')
      .withCreator('creator')
      .withLeftHandPosition({ x: -1, y: 1, z: 0 })
      .withRightHandPosition({ x: 1, y: 1, z: 0 })
      .withHandRaised(true)
      .build()

    expect(message.data.components?.[NafComponentId.LeftHandPosition]).toEqual({
      x: -1,
      y: 1,
      z: 0,
    })
    expect(message.data.components?.[NafComponentId.RightHandPosition]).toEqual({
      x: 1,
      y: 1,
      z: 0,
    })
    expect(message.data.components?.[NafComponentId.HandRaised]).toBe(true)
  })

  it('should build a message with megaphone settings', () => {
    const message = new NafMessageBuilder()
      .withNetworkId('test-id')
      .withOwner('owner')
      .withCreator('creator')
      .withMegaphone(true)
      .withTemporaryMegaphone(true)
      .build()

    expect(message.data.megaphone).toBe(true)
    expect(message.data.temporaryMegaphone).toBe(true)
  })
})