---
'@metatell/bot-core': patch
---

Receive avatar position updates (dataType 'um') on the unreliable 'naf' event so bots can observe other bots' movement. Previously 'um' was only processed on the 'nafr' path used by browser clients.
