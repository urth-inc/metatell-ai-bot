---
'@metatell/bot-core': major
'@metatell/bot-sdk': major
---
Fix the NAF component IDs to match the browser client's `#remote-avatar` networked schema. NAF sends each component under its index in that schema, and several IDs pointed at the wrong component.

Fixes:

- The bot avatar's hands are hidden, as a desktop browser user's are. The right hand used to stay visible and flicker, because component `12` (right hand visibility) was never sent.
- The resync sent when a user joins no longer writes placeholder values into the head, hand and VRM status components, and keeps the avatar's current facing instead of resetting it.
- `stopAnimation()` no longer moves the avatar to the origin.
- `UserAvatarManager` reads component `1` as the rig rotation in Euler degrees (it was read as a quaternion) and combines it with component `14`, so a browser user's facing includes snap turns.

Breaking changes in `NafComponentId`:

| Name | Before | Now |
| --- | --- | --- |
| `Rotation` (was `Velocity`) | `'1'` | `'1'` |
| `NetworkedAvatar` | — | `'4'` |
| `HeadPosition` | — | `'5'` |
| `HeadRotation` | `'4'` | `'6'` |
| `LeftHandRotation` | `'5'` | `'8'` |
| `LeftHandVisible` | — | `'9'` |
| `RightHandPosition` | `'8'` | `'10'` |
| `RightHandRotation` | `'6'` | `'11'` |
| `RightHandVisible` | — | `'12'` |

`HandRaised`, `PinPosition`, `PinScale`, `FaceSnapshotEnabled` and `FaceSnapshot` are removed; the browser has no such components at those IDs.

Breaking changes in `NafMessageBuilder`:

- A new builder hides both hands (`9` and `12` are `false`) and no longer sets a position. Call `withPosition()` when the message should move the avatar.
- `withVelocity()` is replaced by `withRotation()`, which sets the rig rotation in Euler degrees.
- `withHeadRotation()` takes Euler degrees instead of a quaternion. `withHeadPosition()` is new.
- `withLeftHandPosition()`, `withLeftHandRotation()`, `withRightHandPosition()` and `withRightHandRotation()` are replaced by `withLeftHand()` and `withRightHand()`, which take `{ position?, rotation?, visible? }` with rotations in Euler degrees.
- `withHandRaised()`, `withPinPosition()`, `withPinScale()`, `withFaceSnapshotEnabled()` and `withFaceSnapshot()` are removed. Use `withVrmAvatarStatus({ status, animationRunId })` for the VRM animation status (`13`).

`NAFComponentMap` follows the same IDs. `extractRotation()` reads the rig rotation (`1`).
