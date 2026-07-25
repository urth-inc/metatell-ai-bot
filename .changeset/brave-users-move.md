---
'@metatell/bot-core': minor
'@metatell/bot-sdk': minor
---

Expose `user-moved` on MetatellClient when another user's avatar position updates via NAF. Prefer the presence session ID for `user-moved` and `getNearbyUsers()` so they align with `user-join` / `user-leave`.
