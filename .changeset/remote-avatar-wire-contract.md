---
"@metatell/bot-core": major
"@metatell/bot-sdk": major
---

Correct the remote-avatar wire contract to match the browser schema. Unify spawn/resync serialization, retain current transforms and animation run IDs, and send sparse deltas. Convert quaternion inputs to browser YXZ Euler degrees without dropping pitch/roll.

Breaking: remove nonexistent velocity, hand-raised, pin and face-snapshot component IDs/builders; correct head/hand indices and wire rotation types; remove implicit builder defaults and the position isVector3 tag. Use withRemoteAvatar for explicit root/head/controller/networked-avatar/animation fields. See docs/remote-avatar-contract.md for migration guidance.
