# @metatell/bot-sdk

The official SDK for building MetaTell bot applications in TypeScript/Node.js. This SDK provides a high-level, developer-friendly API for creating intelligent bots that can interact in MetaTell virtual spaces.

## Features

- **Simple, Intuitive API**: High-level client for rapid bot development
- **Full TypeScript Support**: Complete type definitions and IntelliSense
- **Real-time Communication**: WebSocket-based messaging with automatic reconnection
- **Avatar Control**: Full 3D avatar manipulation (movement, rotation, animations)
- **Chat System**: Message sending/receiving with mention support
- **Presence Management**: Track users and their states in real-time
- **Event-Driven Architecture**: Strongly-typed event system
- **Error Handling**: Comprehensive error types for robust applications
- **Rate Limiting**: Built-in rate control for API calls
- **Flexible Logging**: Configurable logging system

## Installation

```bash
npm install @metatell/bot-sdk
# or
pnpm add @metatell/bot-sdk
# or
yarn add @metatell/bot-sdk
```

## Requirements

- Node.js 18+ (20+ recommended)
- ESM module support
- TypeScript 5.0+ (for TypeScript projects)

## Quick Start

### Basic Bot

```typescript
import { createMetatellClient } from '@metatell/bot-sdk';

async function main() {
  // Create client
  const client = createMetatellClient({
    serverUrl: 'wss://metatell.app',
    roomId: 'YOUR_ROOM_ID',
    username: 'MyBot',
    // token: process.env.METATELL_TOKEN, // Optional authentication
    logger: 'info'
  });

  // Handle errors
  client.on('error', (error) => {
    console.error('Bot error:', error);
  });

  // Connect to room
  await client.connect();
  
  // Get bot info
  const botInfo = await client.getInfo();
  console.log('Connected as:', botInfo.username);

  // Handle chat messages
  client.chat.onMessage(async ({ from, text, mention, reply }) => {
    // Respond only to mentions
    if (mention?.sessionId === botInfo.sessionId) {
      await reply(`Hello ${from.name}! You said: ${text}`);
    }
  });

  // Spawn avatar in the world
  await client.avatar.select('default-avatar');
  await client.avatar.spawn();
}

main().catch(console.error);
```

### Advanced Features

```typescript
import { createMetatellClient } from '@metatell/bot-sdk';

const client = createMetatellClient({
  serverUrl: 'wss://metatell.app',
  roomId: 'YOUR_ROOM_ID',
  username: 'AdvancedBot',
  logger: 'debug' // Enable detailed logging
});

// Event handling
client.on('connected', () => {
  console.log('Connected to MetaTell');
});

client.on('user-join', (user) => {
  console.log(`${user.name} joined the room`);
  client.chat.send(`Welcome, ${user.name}!`);
});

client.on('user-leave', (user) => {
  console.log(`${user.name} left the room`);
});

await client.connect();

// Avatar control
await client.avatar.spawn();
await client.avatar.moveTo({ x: 10, y: 0, z: 5 });
await client.avatar.rotateTo({ x: 0, y: 180, z: 0 });
await client.avatar.play('wave');

// Room information
const users = await client.room.getUsers();
console.log(`${users.length} users in room`);

// Direct messaging with mentions
await client.chat.mention('user123', 'Hello there!');
```

## API Reference

### Client Creation

```typescript
const client = createMetatellClient(options: CreateClientOptions)
```

**Options:**
- `serverUrl`: WebSocket server URL (e.g., 'wss://metatell.app')
- `roomId`: Room identifier to join
- `username`: Bot display name (optional)
- `token`: Authentication token (optional)
- `logger`: Logging configuration ('debug' | 'info' | 'warn' | 'error' | LoggerConfig)
- `avatar`: Default avatar configuration

### Connection Management

```typescript
// Connect to room
await client.connect();

// Disconnect
await client.disconnect();

// Get connection status
const isConnected = client.isConnected;

// Get bot information
const info = await client.getInfo();
// Returns: { sessionId, userId, username }
```

### Chat API

```typescript
// Send message
await client.chat.send('Hello, world!');

// Send with mention
await client.chat.mention('userId', 'Hello @user!');

// Handle incoming messages
client.chat.onMessage(async (event) => {
  console.log(`${event.from.name}: ${event.text}`);
  
  if (event.mention) {
    console.log(`Mentioned: ${event.mention.name}`);
  }
  
  // Reply directly
  await event.reply('Thanks for your message!');
});
```

### Avatar Control

```typescript
// Select avatar asset
await client.avatar.select('avatar-asset-id');

// Spawn in world
await client.avatar.spawn();

// Movement
await client.avatar.moveTo({ x: 10, y: 0, z: 5 });

// Rotation (Euler angles in degrees)
await client.avatar.rotateTo({ x: 0, y: 90, z: 0 });

// Play animation
await client.avatar.play('dance', {
  loop: true,
  duration: 5000
});

// Stop animation
await client.avatar.stop();

// Despawn
await client.avatar.despawn();
```

### Room and Presence

```typescript
// Get all users
const users = await client.room.getUsers();

// Get specific user
const user = await client.room.getUser('userId');

// Alternative API
const users = await client.getUsers();
```

### Events

```typescript
// Connection events
client.on('connected', () => {});
client.on('disconnected', (reason) => {});
client.on('error', (error) => {});

// User events
client.on('user-join', (user) => {});
client.on('user-leave', (user) => {});
client.on('user-update', (user) => {});

// Chat events
client.on('chat-message', (message) => {});

// Avatar events
client.on('avatar-spawned', (avatar) => {});
client.on('avatar-moved', (position) => {});
client.on('avatar-despawned', () => {});

// Remove listener
const off = client.on('event', handler);
off(); // Unsubscribe
```

## Advanced Usage

### Low-Level Agent Client

For more control, use the low-level `AgentClient`:

```typescript
import { createAgentClient } from '@metatell/bot-sdk';

const agent = createAgentClient({
  organizationId: 'org-id',
  hubId: 'hub-id',
  profile: {
    displayName: 'Agent',
    avatarUrl: 'https://example.com/avatar.vrm'
  }
});

// Direct service access
const avatarController = agent.getService('AvatarController');
await avatarController.spawn();
```

### Custom Error Handling

```typescript
import { 
  MetatellError, 
  AuthError, 
  NetworkError, 
  NotFoundError 
} from '@metatell/bot-sdk';

try {
  await client.connect();
} catch (error) {
  if (error instanceof AuthError) {
    console.error('Authentication failed:', error.message);
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
    // Retry logic
  } else if (error instanceof NotFoundError) {
    console.error('Room not found:', error.message);
  }
}
```

### Rate Limiting

The SDK includes built-in rate limiting:

```typescript
import { RateLimitedQueue } from '@metatell/bot-sdk';

// Custom rate limiter
const queue = new RateLimitedQueue({
  maxRequestsPerSecond: 10,
  maxBurst: 20
});

// Use with client
const client = createMetatellClient({
  // ... options
  rateLimiter: queue
});
```

### Custom Logging

```typescript
import { createMetatellClient, LogLevel } from '@metatell/bot-sdk';

// Simple configuration
const client = createMetatellClient({
  logger: 'debug' // 'debug' | 'info' | 'warn' | 'error'
});

// Custom logger
const client = createMetatellClient({
  logger: {
    level: 'info',
    handler: (level, message, meta) => {
      console.log(`[${level}] ${message}`, meta);
    }
  }
});
```

### PCM Audio Utilities

```typescript
import { pcm } from '@metatell/bot-sdk';

// Convert audio formats
const pcmData = await pcm.convert(audioBuffer, {
  sampleRate: 48000,
  channels: 1
});

// Stream audio
const stream = pcm.createStream({
  sampleRate: 48000,
  channels: 1
});
```

## Type Definitions

### Core Types

```typescript
interface User {
  id: string;
  sessionId: string;
  name?: string;
  isGuest: boolean;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Euler {
  x: number; // Rotation around X axis (degrees)
  y: number; // Rotation around Y axis (degrees)
  z: number; // Rotation around Z axis (degrees)
}

interface Animation {
  id: string;
  name: string;
  duration?: number;
  loop?: boolean;
}

interface AvatarAsset {
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
}
```

### Event Types

```typescript
type MetatellClientEvents = {
  'connected': void;
  'disconnected': string | undefined;
  'error': Error;
  'user-join': User;
  'user-leave': User;
  'user-update': User;
  'chat-message': MessageEventData;
  'avatar-spawned': { position: Vec3 };
  'avatar-moved': Vec3;
  'avatar-rotated': Euler;
  'avatar-despawned': void;
}
```

## Examples

### Echo Bot

```typescript
const client = createMetatellClient({
  serverUrl: 'wss://metatell.app',
  roomId: 'echo-test-room',
  username: 'EchoBot'
});

await client.connect();

client.chat.onMessage(async ({ text, reply }) => {
  await reply(`Echo: ${text}`);
});
```

### Welcome Bot

```typescript
const client = createMetatellClient({
  serverUrl: 'wss://metatell.app',
  roomId: 'welcome-room',
  username: 'WelcomeBot'
});

await client.connect();
await client.avatar.spawn();

client.on('user-join', async (user) => {
  await client.chat.send(`Welcome to the room, ${user.name}!`);
  await client.avatar.play('wave');
});
```

### Movement Bot

```typescript
const client = createMetatellClient({
  serverUrl: 'wss://metatell.app',
  roomId: 'movement-demo',
  username: 'MovementBot'
});

await client.connect();
await client.avatar.spawn();

// Patrol between points
const points = [
  { x: 0, y: 0, z: 0 },
  { x: 10, y: 0, z: 0 },
  { x: 10, y: 0, z: 10 },
  { x: 0, y: 0, z: 10 }
];

let currentPoint = 0;
setInterval(async () => {
  await client.avatar.moveTo(points[currentPoint]);
  currentPoint = (currentPoint + 1) % points.length;
}, 5000);
```

## Best Practices

1. **Error Handling**: Always handle connection errors and disconnections
2. **Rate Limiting**: Be mindful of message frequency to avoid rate limits
3. **Cleanup**: Properly disconnect when shutting down
4. **Logging**: Use appropriate log levels for production
5. **Security**: Never hardcode tokens; use environment variables
6. **Presence**: Despawn avatars before disconnecting

## Troubleshooting

### Connection Issues
- Verify the server URL and room ID
- Check authentication token if required
- Ensure network connectivity
- Review firewall/proxy settings

### Avatar Issues
- Confirm avatar asset exists and is accessible
- Check spawn position for collisions
- Verify animation IDs are valid

### Message Issues
- Ensure proper user/mention IDs
- Check rate limiting constraints
- Verify message content limits

## Documentation

- Getting Started: `docs/getting-started.md`
- API Reference: `docs/api.md`
- Examples: `docs/examples.md`
- Logging & Errors: `docs/logging-and-errors.md`
- Troubleshooting: `docs/troubleshooting.md`
- FAQ: `docs/faq.md`
- NAF Protocol: `docs/NAF.md`

## Contributing

Contributions are welcome! Please see the main repository's contributing guidelines.

## License

MIT

## Support

- Runtime: Node.js 18+ (LTS recommended)
- Module Format: ESM
- TypeScript: Full support with type definitions

For issues and feature requests, please visit the repository's issue tracker.

## See Also

- [@metatell/bot-core](../core/README.md) - Core services and infrastructure
- [@metatell/bot-cli](../cli/README.md) - CLI tools for development
- [@metatell/bot-realtime](../realtime/README.md) - Real-time communication layer
