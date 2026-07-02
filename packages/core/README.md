# @metatell/bot-core

Core services and shared types for advanced metatell bot integrations.

Most bot projects should use `@metatell/bot-sdk`. Use this package directly when
you need lower-level services, typed NAF helpers, or custom service composition.

## Requirements

- Node.js 20 or later. Node.js 22 is recommended.
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
import { CoreServiceFactory } from '@metatell/bot-core'

const factory = new CoreServiceFactory({
  organizationId: 'your-org-id',
  hubId: 'your-room-id',
  avatarData: {
    displayName: 'MyBot',
    avatarUrl: 'https://example.com/avatar.vrm',
  },
})

const container = factory.createContainer()
```

## Services

### EventBus

Publishes and subscribes to SDK events.

```ts
eventBus.on('custom.event', (data) => {
  console.log('event received:', data)
})

eventBus.emit('custom.event', { message: 'Hello' })
```

### AvatarController

Controls bot avatar state, movement, and animations.

```ts
await avatarController.spawn()
await avatarController.playAnimation(PresetAnimationId.WAVE)
await avatarController.setPosition({ x: 10, y: 0, z: 5 })
```

### Other Services

- `AnimationService`: avatar animation lookup and playback helpers.
- `MessageService`: NAF and NAFR message send/receive helpers.
- `PresenceManager`: room user presence tracking.
- `AuthenticationService`: room authentication helpers.
- `ConfigurationProvider`: SDK configuration access.

## License

MIT
