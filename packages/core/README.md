# @metatell/bot-core

Core service architecture and infrastructure for MetaTell AI Bot applications. This package provides the foundational services, interfaces, and dependency injection container for building scalable bot applications.

## Features

- **Service-Oriented Architecture**: Clean separation of concerns with well-defined service interfaces
- **Dependency Injection Container**: Type-safe service registration and resolution
- **Core Services**: Pre-built services for authentication, messaging, presence, animations, and more
- **Event-Driven Architecture**: Built-in event bus for decoupled communication
- **NAF Protocol Support**: Comprehensive support for Networked Aframe (NAF) messaging
- **Type Safety**: Full TypeScript support with strongly-typed interfaces

## Installation

```bash
npm install @metatell/bot-core
# or
pnpm add @metatell/bot-core
# or
yarn add @metatell/bot-core
```

## Quick Start

```typescript
import { CoreServiceFactory } from '@metatell/bot-core';

// Create the service factory with configuration
const factory = new CoreServiceFactory({
  organizationId: 'your-org-id',
  hubId: 'your-hub-id',
  avatarData: {
    displayName: 'MyBot',
    avatarUrl: 'https://example.com/avatar.vrm'
  }
});

// Get services from the container
const container = factory.getContainer();
const eventBus = container.get(EventBus);
const avatarController = container.get(AvatarController);

// Listen for system events
eventBus.on(SystemEvents.CONNECTION_STATE_CHANGED, (state) => {
  console.log('Connection state:', state);
});

// Control avatar
await avatarController.spawn();
```

## Core Services

### Service Container

The heart of the architecture - provides dependency injection and service lifecycle management.

```typescript
import { ServiceContainer, ServiceIdentifier } from '@metatell/bot-core';

const container = new ServiceContainer();

// Register a service
container.register(MyService, new MyServiceImpl());

// Get a service
const service = container.get(MyService);
```

### Event Bus

Facilitates decoupled communication between services.

```typescript
const eventBus = container.get(EventBus);

// Subscribe to events
eventBus.on('custom.event', (data) => {
  console.log('Event received:', data);
});

// Emit events
eventBus.emit('custom.event', { message: 'Hello' });

// System events
eventBus.on(SystemEvents.AVATAR_SPAWNED, (avatar) => {
  console.log('Avatar spawned:', avatar.id);
});
```

### Avatar Controller

Manages bot avatar lifecycle and animations.

```typescript
const avatarController = container.get(AvatarController);

// Spawn avatar in the world
await avatarController.spawn();

// Play animations
await avatarController.playAnimation(PresetAnimationId.WAVE);

// Move avatar
await avatarController.setPosition({ x: 10, y: 0, z: 5 });

// Cleanup
await avatarController.cleanup();
```

### Animation Service

Handles VRM animation playback and management.

```typescript
const animationService = container.get(AnimationService);

// Register custom animation
animationService.registerAnimation({
  id: 'custom-dance',
  url: 'https://example.com/dance.anim',
  loop: AnimationLoopBehavior.LOOP
});

// Play animation with options
const result = await animationService.playAnimation('custom-dance', {
  duration: 5000,
  loop: true,
  onComplete: () => console.log('Animation finished')
});
```

### Message Service

Handles NAF protocol messaging and communication.

```typescript
const messageService = container.get(MessageService);

// Send NAF message
messageService.send({
  dataType: 'u',
  data: {
    networkId: 'avatar-123',
    owner: 'bot-user-id',
    components: {
      position: { x: 0, y: 0, z: 0 }
    }
  }
});
```

### Presence Manager

Tracks user presence and avatar states in the hub.

```typescript
const presenceManager = container.get(PresenceManager);

// Get all users in hub
const users = presenceManager.getUsers();

// Get specific user
const user = presenceManager.getUser('user-id');

// Listen for presence updates
presenceManager.on('userJoined', (user) => {
  console.log('User joined:', user.displayName);
});
```

## NAF Message Builder

Utility for constructing type-safe NAF messages.

```typescript
import { NafMessageBuilder, NafComponentId } from '@metatell/bot-core';

// Create avatar spawn message
const spawnMessage = NafMessageBuilder.createAvatarSpawn({
  networkId: 'avatar-123',
  displayName: 'Bot',
  avatarUrl: 'https://example.com/avatar.vrm'
});

// Update position
const updateMessage = NafMessageBuilder.createComponentUpdate(
  'avatar-123',
  NafComponentId.POSITION,
  { x: 10, y: 0, z: 5 }
);
```

## Type-Safe NAF Messages

The package provides strongly-typed NAF message definitions:

```typescript
import { 
  TypedNAFMessage, 
  isNAFCreateMessage,
  extractPosition,
  extractAvatarData 
} from '@metatell/bot-core';

// Type guard for message types
if (isNAFCreateMessage(message)) {
  const position = extractPosition(message);
  const avatarData = extractAvatarData(message);
}
```

## Custom Service Integration

Extend the factory to add your own services:

```typescript
class ExtendedServiceFactory extends CoreServiceFactory {
  protected registerServices(config?: BotConfiguration): void {
    super.registerServices(config);
    
    // Register custom services
    this.container.register(MyCustomService, new MyCustomServiceImpl());
  }
}
```

## Configuration

```typescript
interface BotConfiguration {
  organizationId: string;
  hubId: string;
  avatarData?: {
    displayName: string;
    avatarUrl?: string;
    scale?: number;
  };
  voice?: {
    provider: 'azure' | 'google';
    voiceId: string;
  };
}
```

## Error Handling

The package includes custom error types for better error handling:

```typescript
import { 
  AnimationNotFoundError, 
  AvatarNotSpawnedError,
  AnimationPlaybackError 
} from '@metatell/bot-core';

try {
  await avatarController.playAnimation('invalid-id');
} catch (error) {
  if (error instanceof AnimationNotFoundError) {
    console.error('Animation not found:', error.animationId);
  }
}
```

## Logging

Configure logging for debugging and monitoring:

```typescript
import { 
  registerLoggerProvider, 
  DefaultLoggerProvider 
} from '@metatell/bot-core';

const logger = new DefaultLoggerProvider();
logger.setMinLevel('debug');
registerLoggerProvider(logger);
```

## Testing

The package is designed with testability in mind:

```typescript
import { CoreServiceFactory } from '@metatell/bot-core';
import { MockRealtimeAdapter } from '@metatell/bot-core/testing';

// Create factory with mock adapter
const factory = new CoreServiceFactory();
const container = factory.getContainer();

// Register mock adapter for testing
container.register(RealtimeAdapter, new MockRealtimeAdapter());
```

## API Reference

### Interfaces

- `IAnimationService` - Animation playback and management
- `IAppSettings` - Application configuration
- `IAuthenticationService` - Authentication handling  
- `IAvatarController` - Avatar lifecycle management
- `IConfigurationProvider` - Configuration access
- `IConnectionManager` - Connection state management
- `IEventBus` - Event publishing/subscription
- `IMessageService` - Message sending/receiving
- `IOrganizationService` - Organization data access
- `IPresenceManager` - User presence tracking
- `IUserAvatarManager` - Avatar instance management
- `IChannelService` - Phoenix channel management

### Types

- `BotConfiguration` - Bot configuration options
- `AvatarState` - Avatar state enumeration
- `AnimationConfig` - Animation configuration
- `NAFMessage` - NAF protocol message types
- `PresenceUser` - User presence information
- `SystemEvents` - System event constants

## License

MIT