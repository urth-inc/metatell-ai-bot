# @metatell/bot-cli

Command-line tools for developing and testing metatell bots.

## Requirements

- Node.js 22.12 or later (commander 15 requirement). Node.js 24 is recommended.

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
metatell-bot https://metatell.app/ROOM_ID -n "MyBot"
metatell-bot https://metatell.app/ROOM_ID -d
```

## Commands

### Interactive Mode

```bash
metatell-bot https://metatell.app/ROOM_ID [options]
metatell-bot interactive https://metatell.app/ROOM_ID [options]
metatell-bot i https://metatell.app/ROOM_ID [options]
```

Available interactive commands:

| Command | Description |
| --- | --- |
| `/help` or `/?` | Show available commands. |
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
| `/anime <id>` or `/animation <id>` | Play an animation by ID. |
| `/animations` | List available animations. |
| `/stop` | Stop the current animation and return to idle. |
| `quit` or `exit` | Exit the CLI. |

### Connection Test

```bash
metatell-bot connect https://metatell.app/ROOM_ID [--debug]
```

Connects as `MetatellCLI`, prints basic room information, and disconnects.

### Room Inspection

```bash
metatell-bot inspect https://metatell.app/ROOM_ID
```

Connects as `MetatellInspector` and prints room state and user presence. This
command has no options.

## Options

| Option | Alias | Description | Default |
| --- | --- | --- | --- |
| `--name` | `-n` | Bot display name. | `MetatellCLI` |
| `--debug` | `-d` | Enable debug logs. | `false` |

`--name` applies to interactive mode. `connect` accepts only `--debug`. Use
`--version` and `--help` for CLI information.

The CLI connects without an access token, so rooms that restrict chat or other
actions to authenticated users may reject those actions. For metatell domains,
tenant subdomains in the room URL are normalized to the base domain.

## Local Development

The repository is a pnpm workspace:

```bash
git clone https://github.com/urth-inc/metatell-ai-bot.git
cd metatell-ai-bot
pnpm install
pnpm build
node packages/cli/dist/cli.js --version
node packages/cli/dist/cli.js --help
```

Useful commands:

```bash
pnpm --filter @metatell/bot-cli dev https://metatell.app/ROOM_ID
pnpm --filter @metatell/bot-cli build
pnpm --filter @metatell/bot-cli typecheck
pnpm test packages/cli
```

## License

MIT
