# Basic Bot Example

A minimal metatell bot that connects to a room, replies when mentioned, and
follows the nearest user.

## Setup

```bash
npm install
npm run build
```

## Run

```bash
npm start -- https://metatell.app/YOUR_ROOM_ID
```

Enable verbose SDK logs:

```bash
npm start -- https://metatell.app/YOUR_ROOM_ID --debug
```

## Features

- Parses a metatell room URL into `serverUrl` and `roomId`.
- Connects with `createMetatellClient()`.
- Replies only when the bot is mentioned.
- Lists available avatar animations.
- Moves near another user and switches between walking and idle animations.

## Files

- `src/main.ts`: example entry point.
