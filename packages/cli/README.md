# @metatell/bot-cli

A powerful command-line interface tool for MetaTell bot development and testing. This CLI provides developers with interactive tools to connect to MetaTell rooms, test bot functionality, and monitor room activities in real-time.

## Features

- **Interactive Mode**: Real-time chat interface with rich command support
- **Connection Testing**: Quick connectivity verification
- **Room Inspection**: Monitor room state and user presence
- **Event Monitoring**: Track all room events in real-time
- **Debug Support**: Comprehensive logging for development
- **Authentication Support**: Works with both authenticated and guest users
- **Rich Commands**: Built-in commands for room interaction

## Installation

```bash
# Global installation
npm install -g @metatell/bot-cli

# Or use with npx
npx @metatell/bot-cli <command>

# Or install as a development dependency
npm install --save-dev @metatell/bot-cli
```

## Quick Start

```bash
# Connect to a room with interactive mode (default)
metatell-cli https://metatell.app/ROOM_ID

# Connect with authentication token
metatell-cli https://metatell.app/ROOM_ID -t "your-auth-token"

# Connect with custom bot name
metatell-cli https://metatell.app/ROOM_ID -n "MyBot"

# Enable debug logging
metatell-cli https://metatell.app/ROOM_ID -d
```

## Commands

### Interactive Mode (Default)

The default mode provides a full-featured interactive CLI experience.

```bash
metatell-cli https://metatell.app/ROOM_ID [options]
# or explicitly
metatell-cli interactive https://metatell.app/ROOM_ID [options]
```

**Features:**
- Real-time message display
- Chat message sending
- Mention detection and response
- User presence tracking
- Room state monitoring
- Command system for bot control

**Available Commands in Interactive Mode:**
- `/status` - Display current connection status and room info
- `/users` - List all users in the room
- `/avatar spawn` - Spawn bot avatar in the world
- `/avatar move <x> <y> <z>` - Move avatar to position
- `/avatar animate <animation>` - Play animation
- `/say <message>` - Send a chat message
- `/mention <user> <message>` - Send a message mentioning a user
- `/debug` - Toggle debug logging
- `/help` - Show available commands
- `/quit` or `/exit` - Disconnect and exit

### Connect Command

Quick connection test to verify connectivity and authentication.

```bash
metatell-cli connect https://metatell.app/ROOM_ID [options]
```

**Use Cases:**
- Verify network connectivity
- Test authentication tokens
- Check room accessibility
- Quick health checks in CI/CD

**Example:**
```bash
# Test connection
metatell-cli connect https://metatell.app/test-room

# Test with authentication
metatell-cli connect https://metatell.app/private-room -t "token"
```

### Inspect Command

Detailed room inspection and monitoring tool.

```bash
metatell-cli inspect https://metatell.app/ROOM_ID [options]
```

**Features:**
- Display room metadata
- List current users and their states
- Monitor user join/leave events
- Track message activity
- Show avatar positions
- Display room configuration

**Example:**
```bash
# Inspect room state
metatell-cli inspect https://metatell.app/my-room

# Inspect with authentication
metatell-cli inspect https://metatell.app/private-room -t "token"
```

## Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--token` | `-t` | Authentication token (optional) | `METATELL_TOKEN` env var |
| `--name` | `-n` | Bot display name | "MetatellCLI" |
| `--debug` | `-d` | Enable debug logging | false |
| `--help` | `-h` | Show help | - |
| `--version` | `-V` | Show version | - |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `METATELL_TOKEN` | Default authentication token | None |
| `METATELL_DEBUG` | Enable debug logging | false |
| `METATELL_SERVER_URL` | Override server URL | Auto-detected |

## Usage Examples

### Development Testing

```bash
# Test bot behavior in a room
metatell-cli https://metatell.app/test-room -n "TestBot" -d

# In interactive mode:
> /avatar spawn
> /avatar move 10 0 5
> /say Hello, I'm a test bot!
> /mention user123 How can I help you?
```

### CI/CD Integration

```bash
# Connection test in CI pipeline
metatell-cli connect $ROOM_URL -t $BOT_TOKEN || exit 1

# Room state validation
metatell-cli inspect $ROOM_URL -t $BOT_TOKEN | grep "Connected users: [1-9]"
```

### Debugging

```bash
# Enable full debug output
METATELL_DEBUG=true metatell-cli $ROOM_URL -d

# Debug specific issues
metatell-cli $ROOM_URL -d 2>&1 | grep "ERROR"
```

## Advanced Usage

### Custom Scripts

Use the CLI in shell scripts for automation:

```bash
#!/bin/bash
# bot-monitor.sh

ROOM_URL="https://metatell.app/my-room"
TOKEN="my-bot-token"

# Monitor room and alert on high user count
while true; do
  USER_COUNT=$(metatell-cli inspect $ROOM_URL -t $TOKEN | grep -o "Connected users: [0-9]*" | cut -d' ' -f3)
  if [ $USER_COUNT -gt 50 ]; then
    echo "Alert: High user count ($USER_COUNT)"
  fi
  sleep 60
done
```

### Integration with Node.js

```javascript
import { spawn } from 'child_process';

// Spawn CLI process
const cli = spawn('metatell-cli', [
  'https://metatell.app/room',
  '-t', 'token',
  '-n', 'BotName'
]);

// Handle output
cli.stdout.on('data', (data) => {
  console.log(`CLI: ${data}`);
});

// Send commands
cli.stdin.write('/status\n');
cli.stdin.write('/say Hello from Node.js!\n');
```

## Troubleshooting

### Connection Issues

```bash
# Check connectivity
metatell-cli connect https://metatell.app/room -d

# Common issues:
# - Invalid token: Check METATELL_TOKEN or -t option
# - Network error: Verify internet connection
# - Room not found: Check room URL
```

### Authentication Problems

```bash
# Test without authentication (guest mode)
metatell-cli https://metatell.app/public-room

# Test with token
metatell-cli https://metatell.app/private-room -t "valid-token"
```

### Debug Output

```bash
# Enable verbose logging
metatell-cli https://metatell.app/room -d 2>&1 | tee debug.log

# Filter specific events
metatell-cli https://metatell.app/room -d | grep "EVENT"
```

## Development

### Building from Source

```bash
# Clone repository
git clone https://github.com/urth-inc/metatell-ai-bot
cd metatell-ai-bot/packages/cli

# Install dependencies
pnpm install

# Build
pnpm build

# Run locally
node dist/cli.js
```

### Running Tests

```bash
# Run tests
pnpm test

# Run with coverage
pnpm test:coverage
```

## API Integration

The CLI is built on top of the `@metatell/bot-sdk` package and can be extended programmatically:

```typescript
import { connectCommand, inspectCommand } from '@metatell/bot-cli';

// Use CLI commands programmatically
await connectCommand('https://metatell.app/room', {
  token: 'my-token',
  debug: true
});
```

## Contributing

Contributions are welcome! Please see the main repository's contributing guidelines.

## License

MIT

## See Also

- [@metatell/bot-sdk](../sdk/README.md) - SDK for building MetaTell bots
- [@metatell/bot-core](../core/README.md) - Core services and infrastructure
- [@metatell/realtime](../realtime/README.md) - Real-time communication layer