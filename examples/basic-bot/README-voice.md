# Voice Feature Integration Guide

This guide demonstrates how to integrate voice features into your Metatell bot.

## Overview

The Metatell SDK now supports real-time voice communication through LiveKit integration. Bots can:
- Send PCM audio frames (Text-to-Speech output)
- Receive PCM audio frames from participants
- Control microphone mute state
- Handle voice connection events

## Quick Start

### 1. Enable Voice in Configuration

```typescript
import { createAgentClient, type BotConfiguration } from '@metatell/sdk'

const config: BotConfiguration = {
  serverUrl: 'wss://metatell.app',
  hubUrl: 'https://metatell.app',
  hubId: 'your-hub-id',
  profile: {
    displayName: 'Voice Bot',
    avatarId: 'bot-avatar',
  },
  voice: {
    enabled: true,
    livekitUrl: 'wss://livekit.metatell.app', // Optional, defaults to this
    audioConfig: {
      sampleRate: 48000,  // 48kHz, 24kHz, or 16kHz
      channels: 1,        // Mono or stereo
      frameDurationMs: 20 // 10ms or 20ms frames
    }
  }
}

const client = createAgentClient(config)
```

### 2. Connect with Voice Enabled

```typescript
// Enable voice at connection time
await client.connect({
  url: 'https://hub.metatell.app/your-hub',
  voice: { enabled: true }
})
```

### 3. Handle Voice Events

```typescript
// Voice connection status
client.on('voiceConnected', () => {
  console.log('Voice connected')
})

client.on('voiceDisconnected', () => {
  console.log('Voice disconnected')
})

// Receive PCM frames from participants
client.on('voiceFrameReceived', ({ participantId, pcmData }) => {
  // pcmData is Int16Array of PCM samples
  console.log(`Received ${pcmData.length} samples from ${participantId}`)
  
  // Process audio (e.g., send to STT service)
  processAudio(participantId, pcmData)
})
```

### 4. Send Audio

```typescript
// Send PCM frames (e.g., from TTS)
const pcmFrame = new Int16Array(960) // 20ms @ 48kHz
await client.sendVoiceFrame(pcmFrame)

// Control microphone
await client.muteVoice(true)  // Mute
await client.muteVoice(false) // Unmute
const isMuted = client.isVoiceMuted()
```

## CLI Commands

The bot CLI includes voice control commands:

```bash
# Voice control
/voice on       # Enable voice (at next connection)
/voice off      # Disable voice
/voice status   # Check voice status

# Microphone control
/mute          # Toggle microphone mute

# Testing
/testvoice 1000  # Send 1 second of test audio (sine wave)
```

## Complete Example

See [VoiceBot.ts](src/examples/VoiceBot.ts) for a complete example that:
- Connects with voice enabled
- Receives and processes participant audio
- Sends test audio on command
- Tracks audio levels

## Audio Format

The SDK uses PCM16 (16-bit signed integer) audio format:
- Sample rates: 48000, 24000, or 16000 Hz
- Channels: 1 (mono) or 2 (stereo)
- Frame duration: 10ms or 20ms
- Samples per frame = (sampleRate × frameDuration) / 1000

Example for 48kHz mono at 20ms:
- Samples per frame: 960
- Bytes per frame: 1920 (960 × 2)
- Frames per second: 50

## Integration with STT/TTS

### Speech-to-Text (STT)

```typescript
const audioBuffers = new Map<string, Int16Array[]>()

client.on('voiceFrameReceived', async ({ participantId, pcmData }) => {
  // Buffer frames
  if (!audioBuffers.has(participantId)) {
    audioBuffers.set(participantId, [])
  }
  audioBuffers.get(participantId)!.push(pcmData)
  
  // Process every 1 second
  if (audioBuffers.get(participantId)!.length >= 50) { // 50 frames @ 20ms
    const frames = audioBuffers.get(participantId)!
    audioBuffers.set(participantId, [])
    
    // Combine frames and send to STT
    const combined = combineFrames(frames)
    const text = await sttService.transcribe(combined)
    
    // Handle transcribed text
    console.log(`${participantId} said: ${text}`)
  }
})
```

### Text-to-Speech (TTS)

```typescript
async function speak(text: string) {
  // Generate PCM from text
  const pcmData = await ttsService.synthesize(text, {
    sampleRate: 48000,
    channels: 1
  })
  
  // Split into frames and send
  const frameSize = 960 // 20ms @ 48kHz
  for (let i = 0; i < pcmData.length; i += frameSize) {
    const frame = pcmData.slice(i, i + frameSize)
    await client.sendVoiceFrame(frame)
  }
}
```

## Testing

Use the mock adapter for testing without LiveKit:

```typescript
const config: BotConfiguration = {
  // ... other config
  voice: {
    enabled: true,
    useMock: true // Use mock adapter
  }
}
```

The mock adapter:
- Simulates connection/disconnection
- Generates test audio frames every 20ms
- Echoes sent data for testing
- Logs all operations

## Troubleshooting

1. **Voice not connecting**: Check LiveKit URL and network connectivity
2. **No audio received**: Verify participants have microphone permissions
3. **Audio quality issues**: Ensure correct sample rate and frame size
4. **High latency**: Check network conditions and processing overhead

## Performance Considerations

- Process audio in batches to reduce overhead
- Use appropriate buffer sizes (typically 20-100ms)
- Consider using worker threads for heavy audio processing
- Monitor memory usage when buffering audio