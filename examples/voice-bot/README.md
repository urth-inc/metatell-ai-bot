# Voice Bot Example

This example plays a WAV file into a metatell room through LiveKit voice
transport and records remote PCM audio to local WAV files.

## Setup

```bash
pnpm install
pnpm build
```

## Run

```bash
npm start -- <room-url>
npm start -- <room-url> ./path/to/audio.wav
```

Example:

```bash
npm start -- https://metatell.app/YOUR_ROOM_ID
```

## Controls

After the bot starts, use these keys:

| Key | Action |
| --- | --- |
| `p` | Play the configured WAV file. |
| `r` | Start recording remote audio. |
| `s` | Stop recording and save a WAV file. |
| `q` | Quit. |

Recording starts automatically when the bot connects. Files are saved under
`recordings/`.

## Files

```text
examples/voice-bot/
  src/main.ts
  src/wav-voice-bot.ts
  src/wav-player.ts
  assets/3.wav
  recordings/
```

## Audio Format

- Sample rate: 48000 Hz for LiveKit transport.
- Channels: mono.
- Frame size: 960 samples for 20 ms frames.
- Sample format: signed 16-bit PCM.

WAV files with other sample rates are resampled to 48000 Hz with linear
interpolation.

## Notes

- Avoid hot reload with `@livekit/rtc-node`.
- Use a 48000 Hz WAV file when possible to preserve quality.
- If connection setup is slow on IPv6 networks, try forcing relay transport:

```bash
ICE_TRANSPORT_POLICY=relay npm start -- <room-url>
```
