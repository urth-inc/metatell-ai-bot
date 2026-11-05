# Remote-avatar SDK migration

Spawn and resync now use the same typed serializer. Resync retains the latest SDK-managed pose and animation run ID. Movement, rotation and animation updates serialize only their changed fields. Metadata-only updates send no packet.

## Public API and units

Use `NafMessageBuilder.withRemoteAvatar()` with `Partial<RemoteAvatarComponents>` for explicit semantic fields. The builder adds no default position, scale or visibility values. `withCustomComponent()` remains an unchecked extension point.

The controller accepts quaternion rotations. The serialized SDK rotation values use Euler degrees in YXZ order. Positions use metres; head and hand positions are relative to the avatar rig. Root and model rotations are separate fields. Scale is dimensionless. Animation names and playback IDs are opaque strings.

`AvatarController.spawn()` accepts an optional fourth `AvatarPose` argument. Set distinct root, head, left-hand, right-hand and model transforms there, or update them through `updateState()`. Unspecified head and hand transforms remain absent. Spawn supplies unit scale and hidden hand visibility unless overridden.

`AvatarState.rotation`, `AvatarController.rotate()` and `avatar.rotateTo()` retain their model-rotation meaning. `rotateTo()` accepts degrees; the controller accepts quaternions. Conversion preserves pitch, yaw and roll.

## Breaking changes

- Remove unsupported `Velocity`, `HandRaised`, `PinPosition`, `PinScale`, `FaceSnapshotEnabled` and `FaceSnapshot` component identifiers and their builder methods. Keep application-local state outside the network serializer.
- Correct the identifiers and wire value types for head and hand transforms. Use semantic fields instead of embedding numeric identifiers in application code.
- Remove implicit builder defaults and the position `isVector3` tag. Supply required fields explicitly.
- Update legacy component types and receive parsing to agree with the typed serializer. Existing SDK callers and examples are migrated together.

Applications using the removed methods must migrate before upgrading. Applications using high-level movement and animation methods receive the corrected serialization without constructing packets themselves. Consumers must select an actually published SDK release containing the fix and update their lockfiles; this change does not assign a new package version.

## Validation and limits

The synthetic SDK tests use independently chosen nonzero poses, public SDK identifiers and Three.js quaternion math. They check spawn, movement, rotation, animation, resync, exact sparse deltas and packet counts. These tests verify SDK behavior; they do not execute a browser decoder or prove end-to-end rendering compatibility.

Browser asset readiness, animation initialization, reconnect ordering and server delivery require separate integration validation. Transport routing and connection lifecycle are unchanged. Resync retains the existing delivery mechanism.

Run `pnpm run check`, `pnpm run typecheck`, `pnpm run test` and `pnpm run build`. After building, `node scripts/benchmark-avatar-wire.mjs <baseline-ref>` measures offline serialization against an explicitly selected SDK revision. It includes JSON serialization, packet sizes and message counts; timings depend on the machine and do not measure room capacity.
