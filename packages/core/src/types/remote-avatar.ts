/** Component identifiers used by the SDK remote-avatar serializer. */
export enum NafComponentId {
  Position = '0',
  RootRotation = '1',
  Scale = '2',
  Avatar = '3',
  NetworkedAvatar = '4',
  HeadPosition = '5',
  HeadRotation = '6',
  LeftHandPosition = '7',
  LeftHandRotation = '8',
  LeftHandVisible = '9',
  RightHandPosition = '10',
  RightHandRotation = '11',
  RightHandVisible = '12',
  VrmAvatarStatus = '13',
  BodyRotation = '14',
}

export interface AvatarVector {
  x: number
  y: number
  z: number
}
export interface NetworkedAvatarData {
  left_hand_pose: number
  right_hand_pose: number
  head_camera_follow_enabled: boolean
}
export interface VrmAvatarStatusData {
  status: string
  animationRunId: string
}
export interface RemoteAvatarPlayerInfo {
  avatarSrc: string
  avatarType?: string
  muted?: boolean
  isSharingAvatarCamera?: boolean
  files?: Record<string, unknown>
}

/**
 * Positions are metres in the entity parent's space. Root has no parent (world).
 * Head and controllers are rig-local, NOT world positions or bone transforms.
 * Wire rotations use Euler degrees in YXZ order; body rotation is model-local.
 * Scale is dimensionless. Animation IDs and run IDs are opaque strings.
 */
export interface RemoteAvatarComponents {
  position: AvatarVector
  rootRotation: AvatarVector
  scale: AvatarVector
  avatar: RemoteAvatarPlayerInfo
  networkedAvatar: NetworkedAvatarData
  headPosition: AvatarVector
  headRotation: AvatarVector
  leftHandPosition: AvatarVector
  leftHandRotation: AvatarVector
  leftHandVisible: boolean
  rightHandPosition: AvatarVector
  rightHandRotation: AvatarVector
  rightHandVisible: boolean
  animation: VrmAvatarStatusData
  bodyRotation: AvatarVector
}

const componentIds = {
  position: NafComponentId.Position,
  rootRotation: NafComponentId.RootRotation,
  scale: NafComponentId.Scale,
  avatar: NafComponentId.Avatar,
  networkedAvatar: NafComponentId.NetworkedAvatar,
  headPosition: NafComponentId.HeadPosition,
  headRotation: NafComponentId.HeadRotation,
  leftHandPosition: NafComponentId.LeftHandPosition,
  leftHandRotation: NafComponentId.LeftHandRotation,
  leftHandVisible: NafComponentId.LeftHandVisible,
  rightHandPosition: NafComponentId.RightHandPosition,
  rightHandRotation: NafComponentId.RightHandRotation,
  rightHandVisible: NafComponentId.RightHandVisible,
  animation: NafComponentId.VrmAvatarStatus,
  bodyRotation: NafComponentId.BodyRotation,
} as const satisfies Record<keyof RemoteAvatarComponents, NafComponentId>

export type RemoteAvatarWireComponents = {
  [K in keyof RemoteAvatarComponents as (typeof componentIds)[K]]?: RemoteAvatarComponents[K]
}

/** Serialize only explicitly supplied fields. No defaults, state scan or JSON round trip. */
export function serializeRemoteAvatar(
  fields: Partial<RemoteAvatarComponents>,
): RemoteAvatarWireComponents {
  const wire: Record<string, unknown> = {}
  for (const key of Object.keys(fields) as (keyof RemoteAvatarComponents)[]) {
    if (!Object.hasOwn(componentIds, key))
      throw new Error(`Unknown remote-avatar component: ${key}`)
    const value = fields[key]
    if (value !== undefined)
      wire[componentIds[key]] = typeof value === 'object' ? { ...value } : value
  }
  return wire
}

/** Normalize a quaternion and convert all axes to A-Frame YXZ Euler degrees. */
export function quaternionToEulerDegrees(q: AvatarVector & { w?: number }): AvatarVector {
  const w = q.w ?? Math.sqrt(Math.max(0, 1 - q.x * q.x - q.y * q.y - q.z * q.z))
  const length = Math.hypot(q.x, q.y, q.z, w)
  if (!Number.isFinite(length) || length === 0)
    throw new Error('Rotation must be a finite, nonzero quaternion')
  const x = q.x / length,
    y = q.y / length,
    z = q.z / length,
    nw = w / length
  const m23 = 2 * (y * z - x * nw)
  const pitch = Math.asin(-Math.max(-1, Math.min(1, m23)))
  const regular = Math.abs(m23) < 0.9999999
  return {
    x: (pitch * 180) / Math.PI || 0,
    y:
      ((regular
        ? Math.atan2(2 * (x * z + y * nw), 1 - 2 * (x * x + y * y))
        : Math.atan2(2 * (y * nw - x * z), 1 - 2 * (y * y + z * z))) *
        180) /
      Math.PI,
    z: ((regular ? Math.atan2(2 * (x * y + z * nw), 1 - 2 * (x * x + z * z)) : 0) * 180) / Math.PI,
  }
}
