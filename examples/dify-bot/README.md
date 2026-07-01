# Dify Bot Example

This example connects metatell room chat to a Dify application. The bot sends
messages that mention it to the Dify API and replies in the room with the Dify
response.

## Setup

Use Node.js 22 when possible.

```bash
git clone https://github.com/urth-inc/metatell-ai-bot.git
cd metatell-ai-bot/examples/dify-bot
npm ci
npm run build
```

Copy `.env.example` and set your Dify credentials:

```bash
cp .env.example .env
```

```env
DIFY_API_URL=https://api.dify.ai/v1
DIFY_API_KEY=your-dify-api-key
DIFY_APP_ID=your-dify-app-id
BOT_USERNAME=DifyBot
# DIFY_STREAMING_MODE=false
```

## Run

```bash
npm start -- https://metatell.app/YOUR_ROOM_ID
```

## Features

- Responds only when the bot is mentioned.
- Sends mentioned messages to Dify.
- Streams Dify responses by default and batches replies for readable chat.
- Keeps a Dify conversation ID per room user.
- Moves the bot avatar near active users.

## Dify Settings

- `DIFY_API_URL`: Dify API base URL. Use `https://api.dify.ai/v1` for Dify Cloud.
- `DIFY_API_KEY`: API key from the Dify application API settings.
- `DIFY_APP_ID`: Dify application ID from the application URL.
- `DIFY_STREAMING_MODE`: set to `false` to use blocking responses.

The screenshots in `docs/imgs/` show where to find the API URL and API key in
Dify.

## Files

```text
src/
  main.ts
  config/index.ts
  services/dify-client.ts
  handlers/chat-handler.ts
  handlers/avatar-handler.ts
```
