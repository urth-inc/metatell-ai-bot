# Logging, Rate Limits, and Errors

## Logging

Enable verbose SDK logs with `debug: true`:

```ts
const client = createMetatellClient({
  serverUrl,
  roomId,
  debug: true,
})
```

For custom logging, register a logger provider:

```ts
import { DefaultLoggerProvider, getLogger, registerLoggerProvider } from '@metatell/bot-sdk'

const provider = new DefaultLoggerProvider()
provider.setLogLevel('debug')
registerLoggerProvider(provider, { allowOverwrite: true })

const logger = getLogger('my-bot')
logger.debug('started', { roomId })
```

Use `getRingBuffer()` when you need to inspect recent log entries for
diagnostics.

## Rate Limits

Use rate limits to avoid sending repeated updates too frequently:

```ts
client.setRateLimit('chat.send', 2)
client.setRateLimit('avatar.move', 10)
client.setRateLimit('avatar.look', 5)

console.log(client.getRateLimit('chat.send'))
```

The key names are application-defined. Use stable names that match the action
you are throttling.

## Error Classes

The SDK exports these error classes:

- `MetatellError`: base class.
- `AuthError`: authentication or authorization failure.
- `NetworkError`: network or connection failure.
- `NotFoundError`: missing room, user, avatar, or animation.
- `RateLimitError`: action rejected by rate limiting.
- `UnsupportedAudioFormatError`: unsupported PCM or audio configuration.

## Handling Errors

Most SDK failures are reported as rejected promises. Wrap connection, chat,
avatar, and voice operations in `try/catch`:

```ts
import { AuthError, NetworkError, RateLimitError } from '@metatell/bot-sdk'

try {
  await client.chat.send('hello')
} catch (error) {
  if (error instanceof RateLimitError) {
    // Back off and retry later.
  } else if (error instanceof AuthError) {
    // Refresh or replace the access token.
  } else if (error instanceof NetworkError) {
    // Reconnect or stop the bot cleanly.
  } else {
    throw error
  }
}
```

The `error` event type is available for integrations, but regular SDK operations
should be handled with promise rejections.
