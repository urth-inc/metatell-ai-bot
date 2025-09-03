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

The bot supports multiple configuration methods with the following priority:

1. **Command line flags** (highest priority)
2. **Environment variables**
3. **Configuration files** (via cosmiconfig)
4. **.env file** (lowest priority)

### Configuration Files

The bot uses [cosmiconfig](https://github.com/davidtheclark/cosmiconfig) to automatically find and load configuration. It searches for:

- `.metatellrc` (JSON or YAML)
- `.metatellrc.json`
- `.metatellrc.yaml` / `.metatellrc.yml`
- `.metatellrc.js` / `.metatellrc.cjs`
- `metatell.config.js` / `metatell.config.cjs`
- `metatell` field in `package.json`

Example configuration files are provided:
- `.metatellrc.example.json` - JSON format
- `.metatellrc.example.yaml` - YAML format
- `metatell.config.example.js` - JavaScript format

### Configuration Schema

```typescript
interface MetatellConfig {
  url?: string           // Metatell room URL
  token?: string         // Authentication token (supports @file syntax)
  botAccessKey?: string  // Bot access key for OAuth-required hubs
  profile?: {
    displayName: string  // Display name in the room
    avatarId?: string   // Avatar identifier
    avatarSelection?: 'random' | 'organization' | string  // Avatar selection method
  }
  profiles?: {           // Named configuration profiles
    [name: string]: Partial<MetatellConfig>
  }
  rate?: {              // Rate limiting
    messagesPerSec?: number
    movesPerSec?: number
    looksPerSec?: number
  }
  debug?: boolean       // Enable debug logging
}
```

### Example Usage

1. **Using JSON config file** (`.metatellrc.json`):
```json
{
  "url": "https://metatell.app/my-room",
  "profile": {
    "displayName": "My Bot"
  }
}
```

2. **Using package.json**:
```json
{
  "name": "my-bot",
  "version": "1.0.0",
  "metatell": {
    "url": "https://metatell.app/my-room",
    "profile": {
      "displayName": "My Bot"
    }
  }
}
```

3. **Using environment variables**:
```bash
export METATELL_URL="https://metatell.app/my-room"
export BOT_NAME="My Bot"
export AVATAR_ID="custom-avatar"
```

4. **Using command line**:
```bash
npm start -- --url "https://metatell.app/my-room" --debug
```

### Avatar Selection

The bot supports multiple avatar selection methods:

1. **Specific Avatar ID**: Set `avatarId` to use a specific avatar
2. **Organization Avatar**: Set `avatarSelection: 'organization'` to use the first avatar from your organization
3. **Random Organization Avatar**: Set `avatarSelection: 'random'` to randomly select from organization avatars
4. **Direct Avatar ID**: Set `avatarSelection` to a specific avatar ID

Environment variable support:
- `AVATAR_ID`: Specific avatar ID
- `AVATAR_SELECTION`: Can be 'random', 'organization', or a specific avatar ID

Example:
```bash
# Use random organization avatar
AVATAR_SELECTION=random npm start https://urth.metatell-stg.app/hubId/

# Use specific avatar
AVATAR_ID=hsBHyUu2 npm start https://urth.metatell-stg.app/hubId/
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
