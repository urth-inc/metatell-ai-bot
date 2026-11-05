import { Euler, Quaternion } from 'three'
import { expect, it, vi } from 'vitest'
import { NafMessageBuilder, type NafMessage } from '../../core/src/builders/NafMessageBuilder.js'
import { AvatarController } from '../../core/src/services/AvatarController.js'
import type { AvatarPose } from '../../core/src/interfaces/IAvatarController.js'
import type { IConfigurationProvider } from '../../core/src/interfaces/IConfigurationProvider.js'
import type { IMessageService } from '../../core/src/interfaces/IMessageService.js'
import { SystemEvents, type IEventBus } from '../../core/src/interfaces/IEventBus.js'
import {
  NafComponentId as Id,
  quaternionToEulerDegrees,
  serializeRemoteAvatar,
  type AvatarVector,
} from '../../core/src/types/remote-avatar.js'

vi.mock('../../core/src/logging/index.js', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

// Synthetic SDK inputs; this suite does not implement a browser schema or decoder.
const angles = {
  root: { x: 19, y: -32, z: 27 },
  head: { x: -24, y: 46, z: -16 },
  left: { x: 38, y: -57, z: 12 },
  right: { x: -43, y: 64, z: -21 },
  model: { x: 49, y: -71, z: 34 },
}
function quaternion(v: AvatarVector) {
  return new Quaternion().setFromEuler(
    new Euler((v.x * Math.PI) / 180, (v.y * Math.PI) / 180, (v.z * Math.PI) / 180, 'YXZ'),
  )
}
const pose: AvatarPose = {
  rootRotation: quaternion(angles.root),
  rotation: quaternion(angles.model),
  scale: { x: 1.2, y: 1.3, z: 1.4 },
  headPosition: { x: 0.17, y: 1.81, z: -0.26 },
  headRotation: quaternion(angles.head),
  leftHandPosition: { x: -0.48, y: 1.28, z: -0.56 },
  leftHandRotation: quaternion(angles.left),
  leftHandVisible: true,
  rightHandPosition: { x: 0.68, y: 1.39, z: -0.77 },
  rightHandRotation: quaternion(angles.right),
  rightHandVisible: false,
}
const position = { x: 13, y: 2.7, z: -18 }
const avatarSrc = 'https://example.com/avatar.glb'
function setup() {
  const sendNAF = vi.fn<(message: NafMessage) => Promise<void>>().mockResolvedValue(undefined)
  const sendNAFR = vi.fn<(message: NafMessage) => Promise<void>>().mockResolvedValue(undefined)
  const on = vi.fn()
  const controller = new AvatarController(
    { sendNAF, sendNAFR } as unknown as IMessageService,
    {
      getConfiguration: () => ({ profile: { displayName: 'Synthetic Bot' } }),
    } as IConfigurationProvider,
    { on, emit: vi.fn() } as unknown as IEventBus,
  )
  on.mock.calls.find(([event]) => event === SystemEvents.ROOM_JOINED)![1]({
    session_id: 'synthetic-bot',
  })
  return { controller, sendNAF, sendNAFR }
}
function vector(actual: unknown, expected: AvatarVector) {
  for (const key of ['x', 'y', 'z'] as const) {
    expect((actual as AvatarVector)[key]).toBeCloseTo(expected[key], 10)
  }
}
function delta(message: NafMessage) {
  return message.data.d![0].components
}

it('serializes explicit SDK fields without defaults or shared mutable vectors', () => {
  const supplied = { headPosition: { ...pose.headPosition! }, rootRotation: angles.root }
  const wire = serializeRemoteAvatar(supplied)
  expect(wire).toEqual({ [Id.HeadPosition]: pose.headPosition, [Id.RootRotation]: angles.root })
  supplied.headPosition.x = 99
  expect(wire[Id.HeadPosition]).toEqual(pose.headPosition)
  const message = new NafMessageBuilder()
    .withNetworkId('synthetic-bot')
    .withOwner('owner')
    .withCreator('creator')
    .withRemoteAvatar({
      leftHandPosition: pose.leftHandPosition,
      rightHandPosition: pose.rightHandPosition,
    })
    .build()
  expect(message.data.components).toEqual({
    [Id.LeftHandPosition]: pose.leftHandPosition,
    [Id.RightHandPosition]: pose.rightHandPosition,
  })
})

it('keeps all SDK pose fields distinct through spawn and resync and emits sparse updates', async () => {
  const { controller, sendNAF, sendNAFR } = setup()
  await controller.spawn('synthetic-avatar', position, avatarSrc, pose)
  const spawn = sendNAFR.mock.lastCall![0]
  const full = spawn.data.components!
  expect(spawn.data.isFirstSync).toBe(true)
  expect(full[Id.Position]).toEqual(position)
  expect(full[Id.Scale]).toEqual(pose.scale)
  expect(full[Id.HeadPosition]).toEqual(pose.headPosition)
  expect(full[Id.LeftHandPosition]).toEqual(pose.leftHandPosition)
  expect(full[Id.RightHandPosition]).toEqual(pose.rightHandPosition)
  expect(full[Id.LeftHandVisible]).toBe(true)
  expect(full[Id.RightHandVisible]).toBe(false)
  for (const [id, expected] of [
    [Id.RootRotation, angles.root],
    [Id.HeadRotation, angles.head],
    [Id.LeftHandRotation, angles.left],
    [Id.RightHandRotation, angles.right],
    [Id.BodyRotation, angles.model],
  ] as const)
    vector(full[id], expected)

  const moved = { x: -23, y: 4.1, z: 31 }
  await controller.move(moved)
  const movement = delta(sendNAF.mock.lastCall![0])
  expect(movement).toEqual({ [Id.Position]: moved })
  const turned = { x: -28, y: 54, z: 36 }
  await controller.rotate(quaternion(turned))
  const rotation = delta(sendNAF.mock.lastCall![0])
  expect(Object.keys(rotation)).toEqual([Id.BodyRotation])
  vector(rotation[Id.BodyRotation], turned)
  const headPosition = { x: -0.23, y: 1.94, z: 0.36 }
  const rightRotation = { x: 32, y: -48, z: 22 }
  await controller.updateState({ headPosition, rightHandRotation: quaternion(rightRotation) })
  const update = delta(sendNAF.mock.lastCall![0])
  expect(Object.keys(update)).toEqual([Id.HeadPosition, Id.RightHandRotation])
  expect(update[Id.HeadPosition]).toEqual(headPosition)
  vector(update[Id.RightHandRotation], rightRotation)
  const playback = await controller.playAnimation('synthetic-wave')
  const animation = delta(sendNAF.mock.lastCall![0])
  expect(animation).toEqual({
    [Id.VrmAvatarStatus]: { status: 'synthetic-wave', animationRunId: playback.playbackId },
  })
  expect(playback.playbackId.length).toBeGreaterThan(0)
  await controller.resyncAvatar()
  const expected = { ...full, ...movement, ...rotation, ...update, ...animation }
  expect(sendNAFR.mock.lastCall![0].data.components).toEqual(expected)
  expect(sendNAF).toHaveBeenCalledTimes(4)
  expect(sendNAFR).toHaveBeenCalledTimes(2)
  await controller.stopAnimation()
  const stop = delta(sendNAF.mock.lastCall![0])
  expect(Object.keys(stop)).toEqual([Id.VrmAvatarStatus])
  expect(stop[Id.VrmAvatarStatus]).toEqual({ status: 'idle', animationRunId: expect.any(String) })
  expect((stop[Id.VrmAvatarStatus] as { animationRunId: string }).animationRunId).not.toBe(
    playback.playbackId,
  )
  await controller.resyncAvatar()
  expect(sendNAFR.mock.lastCall![0].data.components).toEqual({ ...expected, ...stop })
  expect(sendNAF).toHaveBeenCalledTimes(5)
  expect(sendNAFR).toHaveBeenCalledTimes(3)
})

it('converts separate builder quaternion inputs to SDK Euler values', () => {
  const message = new NafMessageBuilder()
    .withNetworkId('synthetic-bot')
    .withOwner('owner')
    .withCreator('creator')
    .withHeadRotation(quaternion(angles.head))
    .withLeftHandRotation(quaternion(angles.left))
    .withRightHandRotation(quaternion(angles.right))
    .build()
  const components = message.data.components!
  expect(Object.keys(components)).toEqual([
    Id.HeadRotation,
    Id.LeftHandRotation,
    Id.RightHandRotation,
  ])
  vector(components[Id.HeadRotation], angles.head)
  vector(components[Id.LeftHandRotation], angles.left)
  vector(components[Id.RightHandRotation], angles.right)
})

it('preserves orientation with normalized, scaled, implicit-w and singular quaternion inputs', () => {
  for (const value of [
    ...Object.values(angles),
    { x: 90, y: 35, z: 18 },
    { x: -90, y: -42, z: 24 },
  ]) {
    const q = quaternion(value)
    const converted = quaternionToEulerDegrees({ x: q.x * 3, y: q.y * 3, z: q.z * 3, w: q.w * 3 })
    expect(Math.abs(quaternion(converted).dot(q))).toBeCloseTo(1, 10)
  }
  const q = quaternion(angles.head)
  expect(
    Math.abs(quaternion(quaternionToEulerDegrees({ x: q.x, y: q.y, z: q.z })).dot(q)),
  ).toBeCloseTo(1, 10)
})

it('sends no metadata-only packets and bounds each movement packet independently of the full pose', async () => {
  const { controller, sendNAF } = setup()
  await controller.spawn('synthetic-avatar', position, avatarSrc, pose)
  await controller.updateState({ displayName: 'Local name' })
  await controller.updateState({})
  expect(sendNAF).not.toHaveBeenCalled()
  for (let i = 1; i <= 128; i++) {
    const next = { x: i + 0.3, y: i + 0.7, z: -i - 0.9 }
    await controller.move(next)
    expect(delta(sendNAF.mock.lastCall![0])).toEqual({ [Id.Position]: next })
  }
  expect(sendNAF).toHaveBeenCalledTimes(128)
  for (const [message] of sendNAF.mock.calls)
    expect(JSON.stringify(message).length).toBeLessThan(400)
})
