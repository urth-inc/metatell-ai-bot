// Register logger provider FIRST before any other imports
import { DefaultLoggerProvider, registerLoggerProvider } from './logging/index.js'

registerLoggerProvider(new DefaultLoggerProvider(), { allowOverwrite: true })

// Also register Core logger provider
import {
  DefaultLoggerProvider as CoreDefaultLoggerProvider,
  registerLoggerProvider as registerCoreLoggerProvider,
} from '@metatell/bot-core'

registerCoreLoggerProvider(new CoreDefaultLoggerProvider(), { allowOverwrite: true })

import type { BotConfiguration } from '@metatell/bot-core'
import { CoreServiceFactory } from '@metatell/bot-core'
import { describe, expect, it } from 'vitest'
import { createAgentClientWithFactory } from './AgentClient.js'

describe('AgentClient voice mute via event bus', () => {
  it('should emit voice:mute-changed and sync isVoiceMuted()', async () => {
    const config: BotConfiguration = {
      serverUrl: 'wss://test.metatell.app',
      hubUrl: 'https://test.metatell.app',
      hubId: 'test-hub',
      profile: {
        displayName: 'TestBot',
        avatarId: 'test-avatar',
      },
      voice: {
        enabled: true,
      },
    }

    const factory = new CoreServiceFactory(config)
    const client = createAgentClientWithFactory(factory)

    const events: boolean[] = []
    client.on('voice:mute-changed', ({ muted }) => events.push(muted))

    // Initial state
    expect(client.isVoiceMuted()).toBe(false)

    await client.muteVoice(true)
    expect(client.isVoiceMuted()).toBe(true)

    await client.muteVoice(false)
    expect(client.isVoiceMuted()).toBe(false)

    expect(events).toEqual([true, false])
  })

  it('should not re-emit when mute state unchanged', async () => {
    const config: BotConfiguration = {
      serverUrl: 'wss://test.metatell.app',
      hubUrl: 'https://test.metatell.app',
      hubId: 'test-hub',
      profile: {
        displayName: 'TestBot',
        avatarId: 'test-avatar',
      },
      voice: {
        enabled: true,
      },
    }

    const factory = new CoreServiceFactory(config)
    const client = createAgentClientWithFactory(factory)

    const events: boolean[] = []
    client.on('voice:mute-changed', ({ muted }) => events.push(muted))

    await client.muteVoice(true)
    await client.muteVoice(true)

    expect(client.isVoiceMuted()).toBe(true)
    expect(events).toEqual([true])
  })
})
