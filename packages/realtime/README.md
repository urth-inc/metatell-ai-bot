# @metatell/bot-realtime

Real-time communication layer for MetaTell bot applications. This package provides transport adapters for real-time audio/video communication using LiveKit and mock implementations for testing.

## Features

- **LiveKit Integration**: Production-ready adapter for LiveKit WebRTC infrastructure
- **Mock Adapter**: Testing adapter for development and unit tests
- **Audio Streaming**: PCM16 audio publishing for bot voice output
- **Data Channels**: Topic-based messaging over WebRTC data channels
- **Participant Tracking**: Real-time presence and participant management
- **Type-Safe Events**: Strongly typed event system for reliable communication
- **Connection Management**: Automatic reconnection and state management

## Installation

```bash
npm install @metatell/bot-realtime
# or
pnpm add @metatell/bot-realtime
# or
yarn add @metatell/bot-realtime
```

## Quick Start

```typescript
import { LiveKitAdapter } from '@metatell/bot-realtime';

// Create adapter
const adapter = new LiveKitAdapter();

// Listen for events
adapter.on((event) => {
  switch (event.type) {
    case 'state':
      console.log('Connection state:', event.state);
      break;
    case 'data':
      console.log('Data received:', event.topic, event.payload);
      break;
    case 'participant-joined':
      console.log('User joined:', event.identity);
      break;
  }
});

// Connect to room
await adapter.connect({
  url: 'wss://livekit.example.com',
  tokenProvider: async () => getAccessToken(),
  topics: ['control', 'events', 'transcript'],
  audioPublish: {
    sampleRate: 48000,
    channels: 1
  }
});

// Send data
await adapter.send('control', JSON.stringify({ action: 'spawn' }));

// Publish audio
await adapter.startAudioPublisher();
await adapter.pushPcmFrame(pcmData);
```

## Architecture

### Transport Interface

The package defines a common `RealtimeTransport` interface that all adapters implement:

```typescript
interface RealtimeTransport {
  readonly state: ConnectionState;
  on(listener: (e: RealtimeEvent) => void): () => void;
  
  connect(opts: RealtimeOptions): Promise<void>;
  disconnect(): Promise<void>;
  
  send(topic: string, data: Uint8Array | string): Promise<void>;
  
  startAudioPublisher(): Promise<void>;
  pushPcmFrame(frame: Int16Array): Promise<void>;
  stopAudioPublisher(): Promise<void>;
}
```

### Connection States

```typescript
type ConnectionState = 
  | 'idle'         // Not connected
  | 'connecting'   // Connection in progress
  | 'connected'    // Active connection
  | 'reconnecting' // Reconnecting after disconnect
  | 'disconnected' // Connection closed
```

## LiveKit Adapter

The production adapter for LiveKit WebRTC infrastructure.

### Configuration

```typescript
const options: RealtimeOptions = {
  // LiveKit server URL
  url: 'wss://your-livekit-server.com',
  
  // Token provider for authentication
  tokenProvider: async () => {
    const response = await fetch('/api/livekit-token');
    return response.text();
  },
  
  // Connection options
  connect: {
    autoSubscribe: true,  // Auto-subscribe to tracks
    dynacast: true       // Dynamic simulcast
  },
  
  // Data channel topics
  topics: ['control', 'events', 'transcript', 'audio'],
  
  // Audio publishing configuration
  audioPublish: {
    sampleRate: 48000,     // 48kHz, 24kHz, or 16kHz
    channels: 1,           // Mono or stereo
    frameDurationMs: 20,   // Frame duration
    trackName: 'bot-voice' // Track identifier
  },
  
  // Timeouts
  timeouts: {
    connectMs: 10000  // Connection timeout
  },
  
  // Optional logger
  logger: (level, msg, meta) => {
    console.log(`[${level}] ${msg}`, meta);
  }
};
```

### Audio Publishing

The adapter supports PCM16 audio streaming for bot voice output:

```typescript
// Start audio publisher
await adapter.startAudioPublisher();

// Push PCM16 frames (Int16Array)
const pcmFrame = new Int16Array(960); // 20ms at 48kHz
await adapter.pushPcmFrame(pcmFrame);

// Stop publishing
await adapter.stopAudioPublisher();
```

### Data Channels

Send and receive data over WebRTC data channels:

```typescript
// Send data on a topic
await adapter.send('control', JSON.stringify({
  type: 'avatar.spawn',
  position: { x: 0, y: 0, z: 0 }
}));

// Receive data
adapter.on((event) => {
  if (event.type === 'data') {
    const data = JSON.parse(new TextDecoder().decode(event.payload));
    console.log(`Received on ${event.topic}:`, data);
  }
});
```

## Mock Adapter

Testing adapter for development and unit tests.

```typescript
import { MockAdapter } from '@metatell/bot-realtime';

const mock = new MockAdapter();

// Configure mock behavior
mock.simulateConnection();
mock.simulateParticipant('user-123', 'Alice');
mock.simulateData('events', { type: 'test' });

// Use in tests
describe('Bot behavior', () => {
  it('handles participant join', async () => {
    const events = [];
    mock.on(e => events.push(e));
    
    await mock.connect(options);
    mock.simulateParticipant('user-456', 'Bob');
    
    expect(events).toContainEqual({
      type: 'participant-joined',
      identity: 'Bob',
      sid: 'user-456'
    });
  });
});
```

## Events

### Event Types

```typescript
type RealtimeEvent =
  | { type: 'state'; state: ConnectionState }
  | { type: 'data'; topic: string; payload: Uint8Array; from?: string }
  | { type: 'participant-joined'; identity: string; sid: string }
  | { type: 'participant-left'; identity: string; sid: string }
  | { type: 'warning'; code: string; message: string }
  | { type: 'error'; code: string; message: string; cause?: unknown }
```

### Event Handling

```typescript
adapter.on((event) => {
  switch (event.type) {
    case 'state':
      handleConnectionState(event.state);
      break;
      
    case 'data':
      handleDataMessage(event.topic, event.payload, event.from);
      break;
      
    case 'participant-joined':
      console.log(`${event.identity} joined the room`);
      break;
      
    case 'participant-left':
      console.log(`${event.identity} left the room`);
      break;
      
    case 'warning':
      console.warn(`Warning: ${event.message} (${event.code})`);
      break;
      
    case 'error':
      console.error(`Error: ${event.message} (${event.code})`, event.cause);
      break;
  }
});
```

## Error Handling

The package includes typed errors for better error handling:

```typescript
import { RealtimeError, ErrorCodes } from '@metatell/bot-realtime';

try {
  await adapter.connect(options);
} catch (error) {
  if (error instanceof RealtimeError) {
    switch (error.code) {
      case ErrorCodes.CONNECTION_FAILED:
        console.error('Failed to connect:', error.message);
        break;
      case ErrorCodes.UNAUTHORIZED:
        console.error('Authentication failed:', error.message);
        break;
      case ErrorCodes.ROOM_NOT_FOUND:
        console.error('Room does not exist:', error.message);
        break;
    }
  }
}
```

### Error Codes

- `CONNECTION_FAILED` - Failed to establish connection
- `CONNECTION_TIMEOUT` - Connection attempt timed out
- `UNAUTHORIZED` - Authentication failed
- `ROOM_NOT_FOUND` - Room does not exist
- `INVALID_TOKEN` - Invalid or expired token
- `NETWORK_ERROR` - Network-related error
- `INVALID_STATE` - Operation invalid in current state
- `AUDIO_ERROR` - Audio publishing error

## Advanced Usage

### Custom Token Provider

```typescript
class TokenManager {
  private token?: string;
  private expiry?: number;
  
  async getToken(): Promise<string> {
    if (!this.token || Date.now() > this.expiry) {
      const response = await fetch('/api/token', {
        method: 'POST',
        body: JSON.stringify({ room: 'my-room' })
      });
      
      const data = await response.json();
      this.token = data.token;
      this.expiry = Date.now() + data.expiresIn * 1000;
    }
    
    return this.token;
  }
}

const tokenManager = new TokenManager();
await adapter.connect({
  url: 'wss://livekit.example.com',
  tokenProvider: () => tokenManager.getToken(),
  // ... other options
});
```

### Audio Processing Pipeline

```typescript
class AudioProcessor {
  private adapter: LiveKitAdapter;
  private sampleRate: number;
  
  constructor(adapter: LiveKitAdapter, sampleRate: number) {
    this.adapter = adapter;
    this.sampleRate = sampleRate;
  }
  
  async streamTTS(text: string) {
    // Start publishing
    await this.adapter.startAudioPublisher();
    
    // Generate TTS audio
    const audioData = await generateTTS(text, this.sampleRate);
    
    // Stream in chunks
    const frameSize = this.sampleRate * 0.02; // 20ms frames
    for (let i = 0; i < audioData.length; i += frameSize) {
      const frame = audioData.slice(i, i + frameSize);
      await this.adapter.pushPcmFrame(frame);
      
      // Pace the streaming
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    
    // Stop publishing
    await this.adapter.stopAudioPublisher();
  }
}
```

### Reconnection Handling

```typescript
class ReconnectingAdapter {
  private adapter: LiveKitAdapter;
  private options: RealtimeOptions;
  private reconnectAttempts = 0;
  
  async connectWithRetry(options: RealtimeOptions) {
    this.options = options;
    this.adapter = new LiveKitAdapter();
    
    this.adapter.on((event) => {
      if (event.type === 'state' && event.state === 'disconnected') {
        this.handleDisconnect();
      }
    });
    
    await this.connect();
  }
  
  private async connect() {
    try {
      await this.adapter.connect(this.options);
      this.reconnectAttempts = 0;
    } catch (error) {
      console.error('Connection failed:', error);
      this.scheduleReconnect();
    }
  }
  
  private async handleDisconnect() {
    this.scheduleReconnect();
  }
  
  private scheduleReconnect() {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    setTimeout(() => this.connect(), delay);
  }
}
```

## Testing

### Unit Testing with Mock Adapter

```typescript
import { MockAdapter } from '@metatell/bot-realtime';
import { describe, it, expect } from 'vitest';

describe('Bot Communication', () => {
  it('should handle control messages', async () => {
    const adapter = new MockAdapter();
    const received = [];
    
    adapter.on((event) => {
      if (event.type === 'data') {
        received.push({
          topic: event.topic,
          data: JSON.parse(new TextDecoder().decode(event.payload))
        });
      }
    });
    
    await adapter.connect(mockOptions);
    
    // Simulate incoming control message
    adapter.simulateData('control', { action: 'move', position: { x: 10 } });
    
    expect(received).toContainEqual({
      topic: 'control',
      data: { action: 'move', position: { x: 10 } }
    });
  });
});
```

### Integration Testing

```typescript
import { LiveKitAdapter } from '@metatell/bot-realtime';

describe('LiveKit Integration', () => {
  it('should connect to test server', async () => {
    const adapter = new LiveKitAdapter();
    let connected = false;
    
    adapter.on((event) => {
      if (event.type === 'state' && event.state === 'connected') {
        connected = true;
      }
    });
    
    await adapter.connect({
      url: process.env.TEST_LIVEKIT_URL,
      tokenProvider: async () => process.env.TEST_TOKEN,
      topics: ['test']
    });
    
    expect(connected).toBe(true);
    
    await adapter.disconnect();
  });
});
```

## Performance Considerations

- **Audio Buffer Management**: The adapter handles audio buffering internally to ensure smooth playback
- **Data Channel Efficiency**: Binary data is sent directly without base64 encoding
- **Connection Pooling**: Reuse adapter instances when possible
- **Event Handler Performance**: Keep event handlers lightweight to avoid blocking

## License

MIT

## See Also

- [@metatell/bot-sdk](../sdk/README.md) - High-level SDK for bot development
- [@metatell/bot-core](../core/README.md) - Core services and infrastructure
- [@metatell/bot-cli](../cli/README.md) - CLI tools for development
- [LiveKit Documentation](https://docs.livekit.io/) - LiveKit WebRTC platform