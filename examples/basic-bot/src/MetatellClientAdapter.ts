/**
 * Adapter to make MetatellClient compatible with AgentClient interface
 * This is a temporary solution until the codebase is fully migrated to the new API
 */

import type {
  AgentClient,
  AgentClientEvents,
  AnimationPlaybackResult,
  AnimationPlayOptions,
  ConnectionStatus,
  MetatellClient,
  UserAvatar,
  VRMAnimation,
} from '@metatell/sdk'

export class MetatellClientAdapter implements AgentClient {
  constructor(private client: MetatellClient) {}

  async connect(_options: unknown): Promise<void> {
    await this.client.connect()
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect()
  }

  async join(_room: string): Promise<void> {
    // MetatellClientは接続時にroomを指定するため、再接続が必要
    await this.client.disconnect()
    await this.client.connect()
  }

  async leave(): Promise<void> {
    await this.client.disconnect()
  }

  getStatus(): ConnectionStatus {
    // MetatellClientには同等のメソッドがないため、ダミーの状態を返す
    return {
      connected: true,
      connecting: false,
      retries: 0,
    }
  }

  async send(message: string): Promise<void> {
    await this.client.chat.send(message)
  }

  async move(position: { x: number; y: number; z: number }): Promise<void> {
    await this.client.avatar.moveTo(position)
  }

  async look(_target: { x: number; y: number; z: number } | { userId: string }): Promise<void> {
    // MetatellClientにlookメソッドがないため、実装なし
  }

  async lookAtNearest(): Promise<void> {
    // MetatellClientにlookAtNearestメソッドがないため、実装なし
  }

  async playAnimation(
    animationId: string,
    options?: AnimationPlayOptions,
  ): Promise<AnimationPlaybackResult> {
    await this.client.avatar.play({
      id: animationId,
      loop: options?.loop,
      duration: options?.duration,
      transitionDuration: options?.transitionDuration,
    })
    // MetatellClientは詳細な結果を返さないため、ダミーの結果を返す
    return {
      animationId,
      startedAt: Date.now(),
      duration: options?.duration || 1000,
      loop: options?.loop || false,
    }
  }

  async stopAnimation(): Promise<void> {
    // MetatellClientにstopAnimationメソッドがないため、実装なし
  }

  async getAvailableAnimations(): Promise<VRMAnimation[]> {
    const animations = await this.client.avatar.getAvailableAnimations()
    return animations.map((anim) => ({
      id: anim.id || '',
      name: anim.name,
      duration: anim.duration,
    }))
  }

  getCurrentAnimation(): string | null {
    // MetatellClientには同等のメソッドがないため、nullを返す
    return null
  }

  getUsers(): UserAvatar[] {
    // 同期的に返す必要があるため、空配列を返す
    return []
  }

  getUser(_id: string): UserAvatar | undefined {
    return undefined
  }

  getUsersNearby(_radius: number): UserAvatar[] {
    return []
  }

  async sendVoiceFrame(_pcmData: Int16Array): Promise<void> {
    // MetatellClientの音声機能は別パッケージで実装
  }

  muteVoice(_muted: boolean): Promise<void> {
    // MetatellClientの音声機能は別パッケージで実装
    return Promise.resolve()
  }

  isVoiceMuted(): boolean {
    return true
  }

  on<E extends keyof AgentClientEvents>(event: E, handler: AgentClientEvents[E]): this {
    // 基本的なイベントのマッピング
    const eventMap: Partial<Record<keyof AgentClientEvents, string>> = {
      connect: 'connected',
      disconnect: 'disconnected',
    }

    const mappedEvent = eventMap[event] || event
    // MetatellClientのイベントシステムと互換性を保つ
    // ハンドラーの型を適切にキャストする
    const typedHandler = handler as (...args: unknown[]) => void
    ;(this.client as MetatellClient).on(
      mappedEvent as keyof import('@metatell/sdk').MetatellClientEvents,
      typedHandler,
    )
    return this
  }

  off<E extends keyof AgentClientEvents>(event: E, handler: AgentClientEvents[E]): this {
    const eventMap: Partial<Record<keyof AgentClientEvents, string>> = {
      connect: 'connected',
      disconnect: 'disconnected',
    }

    const mappedEvent = eventMap[event] || event
    // MetatellClientのイベントシステムと互換性を保つ
    // ハンドラーの型を適切にキャストする
    const typedHandler = handler as (...args: unknown[]) => void
    ;(this.client as MetatellClient).off(
      mappedEvent as keyof import('@metatell/sdk').MetatellClientEvents,
      typedHandler,
    )
    return this
  }

  setRateLimit(_key: 'messages' | 'moves' | 'looks', _perSecond: number): void {
    // MetatellClientにはレート制限設定がないため、実装なし
  }

  getRateLimit(_key: 'messages' | 'moves' | 'looks'): number | undefined {
    return undefined
  }
}
