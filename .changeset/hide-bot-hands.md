---
'@metatell/bot-core': patch
'@metatell/bot-sdk': patch
---
Hide the bot avatar's hands in the browser. NAF messages now send components `9` and `12` (left/right controller visibility in the browser's `#remote-avatar` schema) as `false`, so the right hand no longer stays visible and flickers. The resync sent when a user joins no longer writes placeholder values into the head camera, controller and VRM status components, and keeps the avatar's current facing instead of resetting it.
