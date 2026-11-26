# NAF (Networked A-Frame) Protocol

NAF is the networking protocol used for synchronizing 3D objects and avatar states in virtual environments.

## Message Types

### NAF (Unreliable Messages)
- **Protocol**: UDP-like, best-effort delivery
- **Use Case**: Frequent updates where some packet loss is acceptable
- **Examples**: Position updates, rotation changes, animation states
- **Characteristics**:
  - Low latency
  - No delivery guarantees
  - Suitable for high-frequency updates
  - Packet loss won't break functionality

### NAFR (Reliable Messages) 
- **Protocol**: TCP-like, guaranteed delivery
- **Use Case**: Critical state changes that must arrive
- **Examples**: Avatar spawn/despawn, important state transitions
- **Characteristics**:
  - Higher latency due to acknowledgments
  - Guaranteed delivery
  - Used sparingly for critical updates
  - Every packet must arrive for correct functionality

## Implementation Details

### Sending Messages

```typescript
import { NafMessageBuilder } from '@metatell/bot-sdk'

// For frequent position updates (unreliable)
const nafUpdate = new NafMessageBuilder()
  .withDataType('um')
  .withNetworkId(sessionId)
  .withOwner(sessionId)
  .withCreator(sessionId)
  .withPosition({ x: 1, y: 2, z: 3 })
  .build()
await messageService.sendNAF(nafUpdate)

// For critical state changes (reliable) - e.g., spawning an avatar
const spawnMessage = new NafMessageBuilder()
  .withDataType('u')
  .withNetworkId(sessionId)
  .withOwner(sessionId) 
  .withCreator(sessionId)
  .withFirstSync(true)
  .withAvatar({
    avatarSrc: `https://storage.metatell.app/avatars/${avatarId}/avatar.gltf`,
    avatarType: 'skinnable'
  })
  .build()
await messageService.sendNAFR(spawnMessage)
```

### Receiving Messages

```typescript
// Listen for unreliable updates
messageService.on('naf', (data) => {
  // Handle frequent updates (position, rotation, etc.)
})

// Listen for reliable messages
messageService.on('nafr', (data) => {
  // Handle critical state changes
})
```

## Message Structure

NAF messages follow this general structure:

```typescript
interface NAFMessage {
  dataType: string    // Message type ('u', 'um', 'r', etc.)
  data: unknown      // Message payload
  from_session_id?: string // Sender session ID
}
```

### Common Data Types

- `'u'`: User spawn/initial state
- `'um'`: User update (position/rotation)  
- `'r'`: Remove/despawn

### Component IDs

NAF sends each component under its index in the receiving client's networked schema, so the IDs follow the browser's `#remote-avatar` schema (`NafComponentId`). Rotations are Euler angles in degrees.

- `0`: Position (avatar rig, meters)
- `1`: Rotation (avatar rig)
- `2`: Scale (avatar rig)
- `3`: Avatar (`player-info`)
- `4`: Networked avatar (VR hand poses, head camera follow flag)
- `5`: Head position (relative to the rig)
- `6`: Head rotation (relative to the rig)
- `7`: Left hand position (relative to the rig)
- `8`: Left hand rotation (relative to the rig)
- `9`: Left hand visible
- `10`: Right hand position (relative to the rig)
- `11`: Right hand rotation (relative to the rig)
- `12`: Right hand visible
- `13`: VRM avatar status (animation state)
- `14`: Body rotation (the model's facing, relative to the rig)

A browser user without a VR controller sends `9` and `12` as `false`. `NafMessageBuilder` does the same by default, so a bot's hands stay hidden. An update carries only the components it sets; leave out anything you do not want to overwrite.

## Best Practices

1. **Use NAF for frequent updates**: Position, rotation, animations
2. **Use NAFR for critical state**: Spawn, despawn, important state changes
3. **Minimize NAFR usage**: Only for messages that absolutely must arrive
4. **Handle packet loss gracefully**: NAF messages may be lost, design accordingly
5. **Keep messages small**: Larger payloads increase chance of loss and latency

## Event Flow

```mermaid
graph TD
    A[Client sends NAF] --> B[Server receives]
    B --> C[Server broadcasts to other clients]
    C --> D[Clients receive 'naf' event]
    
    E[Client sends NAFR] --> F[Server receives + ACK]
    F --> G[Server broadcasts to other clients]
    G --> H[Clients receive 'nafr' event]
    H --> I[Clients send ACK back]
```

## Debugging

Enable NAF message debugging:

```typescript
// Enable debug mode to see NAF traffic
appSettings.setDebugMode(true)
```

This will log all incoming NAF/NAFR messages with `[NAF RECEIVED]` and `[NAFR RECEIVED]` prefixes.

`createMetatellClient({ debug: true })` enables the same debug mode.
