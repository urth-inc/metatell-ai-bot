# Speech-to-Speech Bot Example

This example builds a speech pipeline for metatell rooms:

1. Receive room audio.
2. Detect speech with WebRTC VAD.
3. Transcribe with Google Cloud Speech-to-Text.
4. Generate a response with Gemini or Dify-backed Gemini function calling.
5. Synthesize speech with Google Cloud Text-to-Speech.
6. Play the response back into the room.

## Setup

```bash
pnpm install
pnpm build
```

Enable Google Cloud APIs:

- Speech-to-Text API.
- Text-to-Speech API.

Copy the environment template:

```bash
cp .env.example .env
```

Create a service account key and a Gemini API key, then add both values to
`.env`:

```dotenv
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-key.json
GEMINI_API_KEY=your-gemini-api-key
```

Optional Dify integration can be configured in `.env` as well:

```dotenv
DIFY_API_URL=https://api.dify.ai/v1
DIFY_API_KEY=your-dify-api-key
DIFY_APP_ID=your-dify-app-id
```

## Run

```bash
npm start -- <room-url>
```

Example:

```bash
npm start -- https://metatell.app/YOUR_ROOM_ID
```

## Controls

- Speak in the room to trigger the speech pipeline.
- Type text and press Enter to send chat input through the same response path.
- Press `q` to quit.

## Files

```text
examples/speech-to-speech-bot/
  src/main.ts
  src/speech-to-speech-bot.ts
  src/speech-recognizer.ts
  src/gemini-llm-processor.ts
  src/speech-synthesizer.ts
  src/vad-processor.ts
  recordings/
  .env.example
```

## Audio Format

- Room input: 48000 Hz, signed 16-bit PCM, mono.
- Frame size: 960 samples for 20 ms frames.
- Speech recognition language: `ja-JP` by default in the sample code.
- Speech synthesis voice: `ja-JP-Chirp3-HD-Zephyr` by default in the sample code.

## Notes

- Google Cloud and Gemini usage may incur cost. Set billing alerts during
  development.
- Keep service account keys and API keys out of git.
- End-to-end latency depends on speech recognition, LLM generation,
  text-to-speech, and network conditions.
