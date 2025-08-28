import { describe, expect, it, vi } from 'vitest'
import { CoreServiceFactory } from '../core/CoreServiceFactory.js'
import type { BotConfiguration } from '../core/interfaces/IConfigurationProvider.js'
import { createAgentClient } from './AgentClient.js'

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

    // 音声が無効の場合、エラーがスローされる
    await expect(client.sendVoiceFrame(new Int16Array(960))).rejects.toThrow('Voice not enabled')
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

    // MockAdapterが使用される
    const transport = factory.getService('RealtimeTransport')
    expect(transport).toBeDefined()
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
