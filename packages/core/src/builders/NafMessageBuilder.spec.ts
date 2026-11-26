import { describe, expect, it } from 'vitest'
import { NafComponentId, NafMessageBuilder } from './NafMessageBuilder.js'

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

  it('should hide both hands by default and leave position out', () => {
    const message = new NafMessageBuilder()
      .withNetworkId('test-id')
      .withOwner('owner')
      .withCreator('creator')
      .build()

    expect(message.data.components).toEqual({
      [NafComponentId.Scale]: { x: 1, y: 1, z: 1 },
      [NafComponentId.LeftHandVisible]: false,
      [NafComponentId.RightHandVisible]: false,
    })
  })

  it('should follow the browser #remote-avatar schema order', () => {
    // NAF sends components by their index in the receiving browser's schema.
    expect(Object.entries(NafComponentId)).toEqual([
      ['Position', '0'],
      ['Rotation', '1'],
      ['Scale', '2'],
      ['Avatar', '3'],
      ['NetworkedAvatar', '4'],
      ['HeadPosition', '5'],
      ['HeadRotation', '6'],
      ['LeftHandPosition', '7'],
      ['LeftHandRotation', '8'],
      ['LeftHandVisible', '9'],
      ['RightHandPosition', '10'],
      ['RightHandRotation', '11'],
      ['RightHandVisible', '12'],
      ['VrmAvatarStatus', '13'],
      ['BodyRotation', '14'],
    ])
  })

  it('should throw error if required fields are missing', () => {
    expect(() => {
      new NafMessageBuilder().build()
    }).toThrow('networkId, owner, and creator are required')
  })

  it('should build a message with rig, body and head state', () => {
    const message = new NafMessageBuilder()
      .withNetworkId('test-id')
      .withOwner('owner')
      .withCreator('creator')
      .withRotation({ x: 0, y: 45, z: 0 })
      .withBodyRotation({ x: 0, y: 180, z: 0 })
      .withHeadPosition({ x: 0, y: 1.6, z: 0 })
      .withHeadRotation({ x: -10, y: 30, z: 0 })
      .withVrmAvatarStatus({ status: 'idle', animationRunId: 'run-1' })
      .build()

    expect(message.data.components).toMatchObject({
      '1': { x: 0, y: 45, z: 0 },
      '5': { x: 0, y: 1.6, z: 0 },
      '6': { x: -10, y: 30, z: 0 },
      '13': { status: 'idle', animationRunId: 'run-1' },
      '14': { x: 0, y: 180, z: 0 },
    })
  })

  it('should set only the given hand fields', () => {
    const message = new NafMessageBuilder()
      .withNetworkId('test-id')
      .withOwner('owner')
      .withCreator('creator')
      .withLeftHand({
        position: { x: -0.3, y: 1, z: 0.2 },
        rotation: { x: 0, y: 0, z: 90 },
        visible: true,
      })
      .withRightHand({ position: { x: 0.3, y: 1, z: 0.2 } })
      .build()

    expect(message.data.components).toMatchObject({
      '7': { x: -0.3, y: 1, z: 0.2 },
      '8': { x: 0, y: 0, z: 90 },
      '9': true,
      '10': { x: 0.3, y: 1, z: 0.2 },
      '12': false,
    })
    expect(message.data.components).not.toHaveProperty('11')
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
