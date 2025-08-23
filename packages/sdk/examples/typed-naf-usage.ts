/**
 * Example: Using strongly-typed NAF messages
 * Demonstrates the improved type safety for NAF message handling
 */

import {
  NafMessageBuilder,
  NafComponentId,
  type TypedNAFMessage,
  type NAFCreateMessage,
  type Position3D,
  type Quaternion,
  isNAFCreateMessage,
  isNAFMultiUpdateMessage,
  extractPosition,
  extractAvatarData,
} from '@metatell/sdk'

// ============================================================================
// Building Type-Safe NAF Messages
// ============================================================================

function buildTypedSpawnMessage(sessionId: string, avatarId: string): TypedNAFMessage {
  const builder = new NafMessageBuilder()
    .withDataType('u')
    .withNetworkId(sessionId)
    .withOwner(sessionId)
    .withCreator(sessionId)
    .withFirstSync(true)
    .withPosition({ x: 0, y: 1.6, z: 0 })
    .withAvatar({
      avatarSrc: `https://storage.metatell.app/avatars/${avatarId}/avatar.gltf`,
      avatarType: 'skinnable',
      muted: false,
      isSharingAvatarCamera: false,
    })

  // Use buildTyped() for type-safe message
  const message: TypedNAFMessage = builder.buildTyped()
  
  // TypeScript knows this is a NAFCreateMessage
  if (message.dataType === 'u') {
    console.log('Spawning at:', message.data.networkId)
    console.log('Avatar components:', message.data.components)
  }

  return message
}

// ============================================================================
// Handling Incoming NAF Messages with Type Guards
// ============================================================================

function _handleIncomingNAFMessage(message: unknown): void {
  // Use type guards for safe message handling
  if (isNAFCreateMessage(message)) {
    // TypeScript knows message is NAFCreateMessage
    const position = extractPosition(message.data.components)
    const avatarData = extractAvatarData(message.data.components)
    
    console.log('User spawned:', {
      networkId: message.data.networkId,
      position,
      avatar: avatarData?.avatarSrc,
    })
  } else if (isNAFMultiUpdateMessage(message)) {
    // TypeScript knows message is NAFMultiUpdateMessage
    message.data.d.forEach(entity => {
      const position = extractPosition(entity.components)
      console.log(`Entity ${entity.networkId} at:`, position)
    })
  }
}

// ============================================================================
// Working with NAF Components
// ============================================================================

function updateAvatarPosition(
  networkId: string,
  position: Position3D,
  rotation?: Quaternion
): TypedNAFMessage {
  const builder = new NafMessageBuilder()
    .withDataType('um')
    .withNetworkId(networkId)
    .withPosition(position)

  if (rotation) {
    // Note: NafMessageBuilder expects Euler angles, not quaternions
    // You'd need to convert quaternion to Euler first
    builder.withBodyRotation([rotation.x, rotation.y, rotation.z])
  }

  return builder.buildTyped()
}

// ============================================================================
// Type-Safe Component Access
// ============================================================================

function processNAFCreate(message: NAFCreateMessage): void {
  const { components } = message.data
  
  // Type-safe component access
  const positionComponent = components[NafComponentId.Position]
  if (positionComponent?.components) {
    const [x, y, z] = positionComponent.components
    console.log(`Position: ${x}, ${y}, ${z}`)
  }

  const avatarComponent = components[NafComponentId.Avatar]
  if (avatarComponent?.components) {
    // TypeScript knows the structure of avatar components
    if (typeof avatarComponent.components === 'object') {
      console.log('Avatar:', avatarComponent.components.avatarSrc)
    }
  }
}

// ============================================================================
// Example: Message Service with Type Safety
// ============================================================================

class TypedMessageService {
  async sendNAF(message: TypedNAFMessage): Promise<void> {
    // Type-safe message sending
    if (message.dataType === 'u') {
      console.log('Sending spawn message:', message.data.networkId)
    } else if (message.dataType === 'um') {
      console.log('Sending update for', message.data.d.length, 'entities')
    } else {
      console.log('Sending remove message:', message.data.networkId)
    }
  }

  onNAFMessage(_handler: (message: TypedNAFMessage) => void): void {
    // Register type-safe handler
    // Implementation would parse incoming messages and call handler
  }
}

// ============================================================================
// Usage Example
// ============================================================================

async function main() {
  const service = new TypedMessageService()
  
  // Build and send a spawn message
  const spawnMessage = buildTypedSpawnMessage('session-123', 'avatar-456')
  await service.sendNAF(spawnMessage)
  
  // Handle incoming messages with full type safety
  service.onNAFMessage((message) => {
    if (isNAFCreateMessage(message)) {
      processNAFCreate(message)
    }
  })
  
  // Update position with type safety
  const updateMessage = updateAvatarPosition(
    'session-123',
    { x: 5, y: 1.6, z: -3 },
    { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }
  )
  await service.sendNAF(updateMessage)
}

// Export for demonstration
export { main, TypedMessageService }