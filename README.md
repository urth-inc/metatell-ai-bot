# Metatell AI Bot Client

TypeScript Phoenix Channel client for connecting to Metatell metaverse.

## Installation

```bash
npm install
npm run build
```

## Quick Start

```typescript
import { MetatellClient } from './dist'

const client = new MetatellClient({
  socketUrl: 'wss://your-server.com:4443',
  hubId: 'your-hub-id',
  profile: {
    displayName: 'AI Bot'
  }
})

await client.connect()
await client.joinHub()
await client.enterRoom()

client.sendMessage('Hello from AI Bot!')
```

## Configuration

```typescript
interface MetatellConfig {
  socketUrl?: string      // WebSocket URL (default: "wss://localhost:4443")
  hubId?: string         // Hub/room ID to join
  authToken?: string     // Authentication token
  permsToken?: string    // Permissions token
  botAccessKey?: string  // Bot access key for OAuth-required hubs
  profile?: {
    displayName: string  // Display name in the room
    avatarId?: string   // Avatar identifier
  }
  context?: object       // Additional context data
  sessionToken?: string  // Session token for reconnection
  debug?: boolean       // Enable debug logging
}
```

## API Reference

### Connection Management

```typescript
// Connect to server
await client.connect()

// Join a hub
const response = await client.joinHub(hubId)

// Enter the room
await client.enterRoom()

// Disconnect
client.disconnect()
```

### Messaging

```typescript
// Send chat message
client.sendMessage('Hello!', 'chat')

// Update profile
client.updateProfile({ displayName: 'New Name' })

// Send NAF data for avatar/object updates
client.sendNAF({
  dataType: 'u',
  data: {
    networkId: 'my-object',
    components: { position: { x: 0, y: 0, z: 0 } }
  }
})
```

### Presence & Permissions

```typescript
// Get all users in room
const users = client.getPresenceList()

// Check if user has permission
const canSpeak = client.userCan(sessionId, 'voice_chat')

// Get current session ID
const myId = client.getSessionId()
```

### Interactions

```typescript
// Raise/lower hand
client.raiseHand()
client.lowerHand()

// Show typing indicator
client.beginTyping()
client.endTyping()

// Pin/unpin objects
client.pinObject(objectId, gltfNode)
client.unpinObject(objectId)
```

## Creating a Custom Bot

```typescript
import { MetatellClient, MessagePayload } from 'metatell-ai-bot'

class MyBot extends MetatellClient {
  protected handleMessage(payload: MessagePayload): void {
    // Respond to messages
    if (payload.body.includes('hello')) {
      this.sendMessage('Hello there!')
    }
  }

  protected onUserJoin(id: string, presence: any): void {
    // Welcome new users
    const name = presence.metas[0]?.profile?.displayName
    this.sendMessage(`Welcome ${name}!`)
  }
}
```

## Example Bot

```typescript
import { MetatellClient } from 'metatell-ai-bot'

async function runBot() {
  const bot = new MetatellClient({
    socketUrl: 'wss://metatell.com:4443',
    hubId: 'my-hub',
    profile: { displayName: 'Helper Bot' }
  })

  await bot.connect()
  await bot.joinHub()
  await bot.enterRoom()

  bot.sendMessage('Bot is online!')

  // Handle shutdown gracefully
  process.on('SIGINT', () => {
    bot.disconnect()
    process.exit(0)
  })
}

runBot().catch(console.error)
```

## Authentication

For private hubs that require authentication:

```typescript
const bot = new MetatellClient({
  socketUrl: 'wss://secure.metatell.com:4443',
  hubId: 'private-hub'
})

await bot.connect()

// Sign in with auth token
await bot.signIn(authToken)

// Now join the hub
await bot.joinHub()
```

## Building

```bash
# Build TypeScript
npm run build

# Watch mode for development
npm run dev

# Run example
npm start
```

## Architecture

This client implements the Phoenix Channel protocol to communicate with Metatell's Elixir/Phoenix backend:

- **Phoenix Channels**: Real-time bidirectional communication
- **Presence**: Track users in rooms
- **NAF Protocol**: Networked A-Frame for 3D object synchronization
- **Permissions**: Role-based access control

## For Developer

Enable pre-commit/pre-push hook with `lefthook`:

```bash
npx lefthook install
```

## License

MIT
