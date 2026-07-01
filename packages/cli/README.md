# @metatell/bot-cli

Command-line tools for developing and testing metatell bots.

## Requirements

- Node.js 20 or later. Node.js 22 is recommended.

## Install

```bash
npm install -g @metatell/bot-cli
```

Run without global installation:

```bash
npx @metatell/bot-cli <command>
```

Install as a development dependency:

```bash
npm install --save-dev @metatell/bot-cli
```

## Usage

```bash
metatell-bot https://metatell.app/ROOM_ID
metatell-bot https://metatell.app/ROOM_ID -t "your-auth-token"
metatell-bot https://metatell.app/ROOM_ID -n "MyBot"
metatell-bot https://metatell.app/ROOM_ID -d
```

## Commands

### Interactive Mode

```bash
metatell-bot https://metatell.app/ROOM_ID [options]
metatell-bot interactive https://metatell.app/ROOM_ID [options]
```

Available interactive commands:

| Command | Description |
| --- | --- |
| `/say <message>` | Send a chat message. |
| `/move <x> <y> <z>` | Move the bot avatar. |
| `/look <x> <y> <z>` | Look at a coordinate. |
| `/look @<username>` | Look at a user. |
| `/nearby [radius]` | Show nearby users. Default radius is 10 m. |
| `/users` | Show all users in the room. |
| `/status` | Show connection status. |
| `/info` | Show bot information. |
| `/avatar <id>` | Change the bot avatar. |
| `/assets` | List available avatars. |
| `/anime <name>` | Play an animation. |
| `/animation <name>` | Play an animation. |
| `/animations` | List available animations. |
| `/stop` | Stop the current animation and return to idle. |
| `quit` or `exit` | Exit the CLI. |

### Connection Test

```bash
metatell-bot connect https://metatell.app/ROOM_ID [options]
```

### Room Inspection

```bash
metatell-bot inspect https://metatell.app/ROOM_ID [options]
```

## Options

| Option | Alias | Description | Default |
| --- | --- | --- | --- |
| `--token` | `-t` | Optional access token. | `METATELL_TOKEN` environment variable |
| `--name` | `-n` | Bot display name. | `MetatellCLI` |
| `--debug` | `-d` | Enable debug logs. | `false` |

## Environment Variables

- `METATELL_TOKEN`: default access token.

## Local Development

```bash
git clone https://github.com/urth-inc/metatell-ai-bot.git
cd metatell-ai-bot
npm install
cd packages/cli
npm run build
npm link
metatell-bot --version
metatell-bot --help
```

Useful commands:

```bash
npm run dev
npm run build
npm run typecheck
cd ../.. && npm test packages/cli/src/cli.spec.ts
```

Remove the global link:

```bash
npm unlink -g @metatell/bot-cli
```

## License

MIT
