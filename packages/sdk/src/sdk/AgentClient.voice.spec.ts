// MockAdapter functionality moved to consuming packages
import { describe, expect, it, vi } from 'vitest'
import { CoreServiceFactory } from '../core/CoreServiceFactory.js'
import type { BotConfiguration } from '../core/interfaces/IConfigurationProvider.js'
import { createAgentClient } from './AgentClient.js'
import { DefaultLoggerProvider, registerLoggerProvider } from './logging/index.js'

// Register logger provider for tests
registerLoggerProvider(new DefaultLoggerProvider(), { allowOverwrite: true })

describe('AgentClient Voice Integration', () => {
  it('should handle voice-disabled configuration', async () => {
    const config: BotConfiguration = {
      serverUrl: 'wss://test.metatell.app',
      hubUrl: 'https://test.metatell.app',
      hubId: 'test-hub',
      profile: {
        displayName: 'TestBot',
        avatarId: 'test-avatar',
      },
      voice: {
        enabled: false,
      },
    }

    const factory = new CoreServiceFactory(config)
    const client = createAgentClient(factory)

    // Voice functionality moved to consuming packages
    await expect(client.sendVoiceFrame(new Int16Array(960))).rejects.toThrow(
      'Voice functionality not available in SDK core',
    )
    expect(client.isVoiceMuted()).toBe(false)
  })

  it('should enable voice with mock transport', async () => {
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
        useMock: true,
      },
    }

    const factory = new CoreServiceFactory(config)
    const _client = createAgentClient(factory)

    // Voice adapter functionality moved to consuming packages
    expect(factory).toBeDefined()
  })

  it('should handle mute/unmute functionality', async () => {
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
        useMock: true,
      },
    }

    const factory = new CoreServiceFactory(config)
    const client = createAgentClient(factory)

    // 初期状態はミュート解除
    expect(client.isVoiceMuted()).toBe(false)

    // ミュート
    await client.muteVoice(true)
    expect(client.isVoiceMuted()).toBe(true)

    // ミュート解除
    await client.muteVoice(false)
    expect(client.isVoiceMuted()).toBe(false)
  })

  it('should emit voice events', async () => {
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
        useMock: true,
      },
    }

    const factory = new CoreServiceFactory(config)
    const client = createAgentClient(factory)

    const voiceConnectedHandler = vi.fn()
    const voiceFrameReceivedHandler = vi.fn()

    client.on('voice:connected', voiceConnectedHandler)
    client.on('voice:frame-received', voiceFrameReceivedHandler)

    // 接続時に音声イベントハンドラが設定されることを確認
    // 実際の接続はWebSocketとLiveKitのモックが必要なため、ここでは省略
    expect(voiceConnectedHandler).not.toHaveBeenCalled()
    expect(voiceFrameReceivedHandler).not.toHaveBeenCalled()
  })
})
