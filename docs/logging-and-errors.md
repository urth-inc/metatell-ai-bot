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

`debug: true` sets the core log level to `debug` and also logs incoming NAF
traffic.

The SDK and core packages each keep their own logger provider registry.
`@metatell/bot-sdk` exports `DefaultLoggerProvider`, `registerLoggerProvider`,
`getLogger`, and `getRingBuffer` for SDK-level loggers such as `AgentClient` and
for your own modules:

```ts
import { DefaultLoggerProvider, getLogger, registerLoggerProvider } from '@metatell/bot-sdk'

const provider = new DefaultLoggerProvider()
provider.setLogLevel('debug')
registerLoggerProvider(provider, { allowOverwrite: true })

const logger = getLogger('my-bot')
logger.debug('started', { roomId })
```

`MetatellClient` and the core services log through the registry in
`@metatell/bot-core`, which exports `DefaultLoggerProvider`,
`registerLoggerProvider`, and `getLoggerProvider`. Register a provider there
before creating the client to redirect or filter those logs.

A logger provider implements `getLogger(module)` and may implement
`setMinLevel(level)`. `DefaultLoggerProvider` writes to the console and a ring
buffer, and also supports `enableConsole(enabled)`, `registerSink(sink)`, and
`unregisterSink(sink)`.

Use `getRingBuffer()` when you need to inspect recent log entries for
diagnostics.

## Rate Limits

`setRateLimit()` accepts the keys `messages`, `moves`, and `looks`:

```ts
client.setRateLimit('messages', 2)
client.setRateLimit('moves', 10)
client.setRateLimit('looks', 5)

console.log(client.getRateLimit('messages'))
```

`AgentClient` throttles `send()`, `move()`, `look()`, and `lookAtNearest()` with
these values. `MetatellClient` stores and returns the values but does not
currently throttle calls. To throttle your own loops, use
`TokenBucketRateLimiter` or `RateLimitedQueue`:

```ts
import { RateLimitedQueue } from '@metatell/bot-sdk'

const queue = new RateLimitedQueue()
queue.setRate('moves', 5)

await queue.execute('moves', () => client.avatar.moveTo(target))
```

`RateLimitedQueue.execute()` waits for a token and rejects if none becomes
available after about one second.

## Error Classes

The SDK exports these error classes:

- `MetatellError`: abstract base class with `code`, `timestamp`, and `cause`.
- `AuthenticationError`: authentication failure. Has an optional `status`.
- `TransportError`: connection or transport failure. Has an optional `reason`.
- `ProtocolError`: invalid configuration or protocol data.
- `TimeoutError`: operation timed out. Has `timeoutMs`.
- `RateLimitedError`: request was rate limited. Has an optional `retryAfterMs`.
- `NavigationError`: scene or navmesh failure. Has a `NavigationErrorCode` and
  `retryable`.

Use `isMetatellError(error)` and `isRetryableError(error)` to classify errors.
`isRetryableError()` returns `true` for `TransportError`, `TimeoutError`,
`RateLimitedError` with `retryAfterMs`, and `NavigationError` with
`retryable: true`.

## Handling Errors

SDK failures are reported as rejected promises. Wrap connection, chat, avatar,
and voice operations in `try/catch`:

```ts
import { AuthenticationError, TransportError, isRetryableError } from '@metatell/bot-sdk'

try {
  await client.connect()
} catch (error) {
  if (error instanceof AuthenticationError) {
    // Refresh or replace the access token.
  } else if (error instanceof TransportError) {
    // Reconnect or stop the bot cleanly.
  } else if (isRetryableError(error)) {
    // Back off and retry later.
  } else {
    throw error
  }
}
```

`MetatellClient` does not emit an `error` event.
