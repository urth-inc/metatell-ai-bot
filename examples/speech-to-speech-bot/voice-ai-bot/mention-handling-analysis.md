# Dify Bot Mention Handling Analysis

## Overview
The dify-bot example implements mention handling by subscribing to chat messages and filtering for mentions directed at the bot. Here's how it works:

## Key Implementation Details

### 1. Event Subscription (ChatHandler)
In `examples/dify-bot/src/handlers/chat-handler.ts`:

```typescript
// The bot subscribes to all messages using the onMessage handler
this.client.chat.onMessage(async ({ from, text, mention, reply }) => {
  if (!this.botInfo) return

  // Check if the mention is directed at this bot
  if (mention && mention.sessionId === this.botInfo.sessionId) {
    // Bot was mentioned - process the message
    console.log(`💬 ${from.name} mentioned me: ${text}`)
    
    // Process with Dify API and reply...
  } else if (mention) {
    // Someone else was mentioned
    console.log(`📢 ${from.name} mentioned @${mention.name}: ${text}`)
  } else {
    // Regular message (no mention)
    console.log(`💭 ${from.name}: ${text}`)
  }
})
```

### 2. Bot Session ID Detection
The bot gets its own session ID during initialization:

```typescript
async initialize() {
  this.botInfo = await this.client.getInfo()
  this.setupChatHandlers()
}
```

The `botInfo` contains:
- `sessionId`: The bot's unique session identifier
- `name`: The bot's display name
- `roomId`: The current room ID

### 3. Mention Format
Mentions in Metatell use a specific format in the message body:
```
[@Username](session-id) message text
```

For example:
```
[@MetatellCLI](b754ca96-d395-4b80-adb1-77cb0240a43d) hello bot!
```

### 4. Message Parsing (Core SDK)
The SDK automatically parses mentions using regex in `MetatellClientImpl.ts`:

```typescript
private parseMessageMention(body: string): {
  text: string
  mention?: {
    sessionId: string
    name: string
  }
} {
  const mentionPattern = /\[@([^\]]+)\]\(([^)]+)\)\s*(.*)$/
  const match = body.match(mentionPattern)

  if (match) {
    return {
      text: match[3].trim(),  // The actual message text
      mention: {
        name: match[1],       // The mentioned username
        sessionId: match[2],  // The mentioned user's session ID
      },
    }
  }

  return { text: body }
}
```

### 5. Message Event Structure
The `onMessage` handler receives:
- `from`: User object with id, name, and isBot flag
- `text`: The parsed message text (without mention syntax)
- `mention`: Optional object with sessionId and name if someone was mentioned
- `reply`: Utility function to send a reply

## Key Points for Implementation

1. **Bot Identity**: The bot must know its own sessionId to detect mentions directed at it
2. **Event Listening**: Use `client.chat.onMessage()` to subscribe to all chat messages
3. **Mention Detection**: Check if `mention.sessionId === botInfo.sessionId`
4. **Parsed Text**: The `text` field contains only the message content (mention syntax is removed)
5. **Reply Function**: Use the provided `reply()` function for responding to mentions

## Example Implementation Pattern

```typescript
// Initialize bot and get session info
const botInfo = await client.getInfo()

// Subscribe to messages
client.chat.onMessage(async ({ from, text, mention, reply }) => {
  // Only respond when mentioned
  if (mention && mention.sessionId === botInfo.sessionId) {
    // Process the message text
    const response = await processMessage(text)
    
    // Reply to the user
    await reply(response)
  }
})
```

This approach ensures the bot only responds when explicitly mentioned, avoiding spam and unnecessary responses.