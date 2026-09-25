# @metatell/bot-core

Core services and shared types for advanced metatell bot integrations.

Most bot projects should use `@metatell/bot-sdk`. Use this package directly when
you need lower-level services, typed NAF helpers, or custom service composition.

## Requirements

- Node.js 20 or later. Node.js 24 is recommended and is the version used in CI.
- TypeScript 5 or later for TypeScript projects.

## Install

```bash
npm install @metatell/bot-core
# or
pnpm add @metatell/bot-core
# or
yarn add @metatell/bot-core
```

## Usage

```ts
import { AvatarController, CoreServiceFactory, EventBus } from '@metatell/bot-core'

const factory = new CoreServiceFactory({
  serverUrl: 'wss://metatell.app',
  hubUrl: 'https://metatell.app',
  hubId: 'your-room-id',
  profile: {
    displayName: 'MyBot',
    avatarId: 'your-avatar-id',
  },
  authToken: process.env.METATELL_TOKEN,
})

const eventBus = factory.getService(EventBus)
const avatarController = factory.getService(AvatarController)
const container = factory.getContainer()
```

`@metatell/bot-core` also exports `createMetatellClient()`, the implementation
behind the high-level client in `@metatell/bot-sdk`.

## Services

### EventBus

Publishes and subscribes to SDK events. `SystemEvents` lists the built-in event
names.

```ts
eventBus.on('custom.event', (data) => {
  console.log('event received:', data)
})

eventBus.emit('custom.event', { message: 'Hello' })
```

### AvatarController

Controls bot avatar state, movement, and animations. Connect through
`ConnectionManager` before spawning.

```ts
import { PresetAnimationId } from '@metatell/bot-core'

await avatarController.spawn('your-avatar-id')
await avatarController.move({ x: 10, y: 0, z: 5 })
await avatarController.playAnimation(PresetAnimationId.WALKING, { loop: true })
await avatarController.stopAnimation()
```

### Other Services

- `ConnectionManager`: room WebSocket connection and join state.
- `AnimationService`: avatar animation lookup and playback helpers.
- `MessageService`: chat and NAF/NAFR message send/receive helpers.
- `PresenceManager`: room user presence tracking.
- `UserAvatarManager`: other users' avatar positions from NAF updates.
- `OrganizationService`: organization and organization avatar lookup.
- `AuthenticationService`: room authentication helpers.
- `ConfigurationProvider`: SDK configuration access.
- `AppSettings`: debug mode and log level.

## Logging

Core services log through the provider registered with
`registerLoggerProvider()` from this package. `DefaultLoggerProvider` is used
when none is registered.

## License

MIT
