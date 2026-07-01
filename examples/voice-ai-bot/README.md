# Voice AI Bot Example

This example connects metatell room voice to Gemini Live. It streams room audio
to Gemini, receives audio responses, and plays them back into the room.

## Setup

```bash
pnpm install
pnpm build
```

Create a Gemini API key in Google AI Studio, then set it in `.env` or the shell:

```bash
cp .env.example .env
export GEMINI_API_KEY=your-gemini-api-key
```

## Run

```bash
npm start -- <room-url>
```

Example:

```bash
npm start -- https://metatell.app/YOUR_ROOM_ID
```

## Behavior

- Streams remote PCM frames from the metatell room to Gemini Live.
- Detects silence to end a spoken turn.
- Plays Gemini audio responses back into the room.
- Saves generated audio responses under `recordings/` for debugging.
- Moves the bot avatar toward nearby users.
- Supports simple mute tools in the Gemini session.

Press `q` to quit.

## Files

```text
examples/voice-ai-bot/
  src/main.ts
  src/gemini-voice-bot.ts
  src/gemini-voice-client.ts
  recordings/
  .env.example
```

## Audio Format

- Room input: 48000 Hz, signed 16-bit PCM, mono.
- Frame size: 960 samples for 20 ms frames.
- Gemini model: `gemini-live-2.5-flash-preview`.

## Notes

- Avoid hot reload with `@livekit/rtc-node`.
- Monitor API usage and quota in Google AI Studio.
- If connection setup is slow on IPv6 networks, try:

```bash
ICE_TRANSPORT_POLICY=relay npm start -- <room-url>
```
