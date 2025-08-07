# Metatell Bot Architecture

## Overview

The new architecture follows **Dependency Injection (DI)** and **SOLID principles** to create a loosely coupled, testable, and maintainable codebase.

## Architecture Layers

### 1. **Interface Layer** (`src/core/interfaces/`)
Defines contracts for all services:
- `IConnectionManager` - WebSocket connection management
- `IMessageService` - Message sending/receiving
- `IAvatarController` - Avatar control and state management
- `IConfigurationProvider` - Configuration management
- `IEventBus` - Event-driven communication
- `IRateLimiter` - Rate limiting
- `IPresenceManager` - User presence tracking
- `IAuthenticationService` - Authentication

### 2. **Service Layer** (`src/core/services/`)
Concrete implementations of interfaces:
- `WebSocketConnectionManager` - Phoenix WebSocket implementation
- `MessageService` - Message handling with rate limiting
- `AvatarController` - Avatar spawning and movement
- `ConfigurationProvider` - Config storage and access
- `EventBus` - Pub/sub event system
- `RateLimiter` - Token bucket rate limiting
- `PresenceManager` - Phoenix Presence wrapper
- `AuthenticationService` - Token management

### 3. **Application Layer** (`src/bots/`)
Business logic and bot implementations:
- `MetatellBot` - Main bot with message handlers

### 4. **Infrastructure Layer** (`src/core/`)
- `ServiceContainer` - DI container
- `ServiceFactory` - Service registration and creation
- `LegacyBridge` - Compatibility with existing code

## Key Design Patterns

### Dependency Injection
All dependencies are injected through constructors:
```typescript
class MetatellBot {
  constructor(
    private connectionManager: IConnectionManager,
    private messageService: IMessageService,
    private avatarController: IAvatarController,
    // ... other dependencies
  ) {}
}
```

### Event-Driven Architecture
Components communicate through events:
```typescript
eventBus.emit(SystemEvents.MESSAGE_RECEIVED, payload)
eventBus.on(SystemEvents.USER_JOINED, handler)
```

### Service Container Pattern
Services are registered and resolved through a container:
```typescript
container.register<IMessageService>('IMessageService', factory)
const service = container.get<IMessageService>('IMessageService')
```

## Benefits

1. **Testability** - Mock any service for unit testing
2. **Flexibility** - Swap implementations without changing code
3. **Maintainability** - Clear separation of concerns
4. **Extensibility** - Easy to add new features
5. **Reusability** - Services can be used independently

## Usage Example

```typescript
import { ServiceFactory } from './core/ServiceFactory'

// Create bot with DI
const factory = new ServiceFactory()
const bot = factory.createBot({
  authUrl: 'https://my-pod.metatell.app',
  hubUrl: 'https://my-pod.metatell.app/hub/xyz',
  profile: {
    displayName: 'Bot Name',
    avatarId: 'avatar123'
  }
})

// Add custom handlers
bot.addMessageHandler((message, sessionId) => {
  if (message === 'ping') return 'pong'
  return null
})

// Start bot
await bot.start()
```

## Testing Example

```typescript
// Mock services for testing
const mockMessageService = {
  sendMessage: jest.fn(),
  on: jest.fn(),
  // ... other methods
}

const bot = new MetatellBot(
  mockConnectionManager,
  mockMessageService,
  mockAvatarController,
  // ... other mocks
)

// Test bot behavior
await bot.handleMessage('test')
expect(mockMessageService.sendMessage).toHaveBeenCalled()
```

## Migration Guide

### From Legacy Code
```typescript
// Old way
import { MetatellBot } from './metatell-bot'
const bot = new MetatellBot(config)

// New way with bridge
import { LegacyBridge } from './core/LegacyBridge'
const bot = LegacyBridge.createModernBot(config)

// Or use new API directly
import { ServiceFactory } from './core/ServiceFactory'
const factory = new ServiceFactory()
const bot = factory.createBot(newConfig)
```

## Service Responsibilities

### ConnectionManager
- WebSocket lifecycle
- Connection state
- Channel management
- Reconnection logic

### MessageService
- Message sending/receiving
- NAF/NAFR protocol
- Rate limiting integration
- Message event emission

### AvatarController
- Avatar spawning
- Position/rotation updates
- State management
- NAF message formatting

### ConfigurationProvider
- Config storage
- Profile management
- Context updates
- Custom settings

### EventBus
- Event registration
- Event emission
- Handler management
- Error isolation

### PresenceManager
- User tracking
- Join/leave events
- Presence state sync
- User queries

## Future Improvements

1. **Plugin System** - Load external handlers dynamically
2. **Middleware Pipeline** - Process messages through middleware
3. **State Persistence** - Save/restore bot state
4. **Clustering** - Run multiple bot instances
5. **Monitoring** - Add metrics and health checks