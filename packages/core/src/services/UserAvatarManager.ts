import { NafComponentId } from '../builders/NafMessageBuilder.js'
import { type IEventBus, SystemEvents } from '../interfaces/IEventBus.js'
import type { IMessageService } from '../interfaces/IMessageService.js'
import type { IPresenceManager } from '../interfaces/IPresenceManager.js'
import type {
  IUserAvatarManager,
  UserAvatar,
  UserAvatarEvent,
} from '../interfaces/IUserAvatarManager.js'
import { getLogger } from '../logging/index.js'
import type { NAFComponent } from '../types/index.js'
import { CompositeUserIdResolver } from './resolvers/CompositeUserIdResolver.js'
import { CreatorMatchResolver } from './resolvers/CreatorMatchResolver.js'
import { ExactMatchResolver } from './resolvers/ExactMatchResolver.js'
import type { IUserIdResolver } from './resolvers/IUserIdResolver.js'
import { OwnerMatchResolver } from './resolvers/OwnerMatchResolver.js'
import { PrefixMatchResolver } from './resolvers/PrefixMatchResolver.js'

interface NAFMessage {
  dataType: 'u' | 'r' | 'um'
  data: NAFComponent | { d: NAFComponent[] }
}

export class UserAvatarManager implements IUserAvatarManager {
  private users = new Map<string, UserAvatar>()
  private eventHandlers = new Map<UserAvatarEvent, Set<(user: UserAvatar) => void>>()
  private logger = getLogger('UserAvatarManager')

  // ID解決キャッシュ
  private readonly idMappingCache = new Map<string, string>()
  private readonly unmappableIds = new Set<string>()

  // ID解決メトリクス
  private readonly resolutionMetrics = {
    total: 0,
    byStrategy: new Map<string, number>(),
    failures: 0,
    cacheHits: 0,
  }

  // Injected ID resolver
  private readonly idResolver: IUserIdResolver

  constructor(
    private messageService: IMessageService,
    private presenceManager: IPresenceManager,
    private eventBus: IEventBus,
    idResolver?: IUserIdResolver,
  ) {
    // Use injected resolver or create default if not provided
    this.idResolver = idResolver ?? this.createDefaultResolver()
    this.logger.info('Initializing...')
    this.setupEventListeners()
    this.setupConnectionMonitoring()
    this.logger.info('Initialized')
  }

  private setupEventListeners(): void {
    // NAFメッセージを監視してアバターの位置情報を追跡
    this.logger.debug('[UserAvatarManager] Setting up NAF message listeners')
    this.messageService.on('naf', (data: unknown) => this.handleNAFMessage(data as NAFMessage))
    this.messageService.on('nafr', (data: unknown) => {
      // NAFRメッセージは {naf: "JSON文字列"} の形式で来る
      const nafrData = data as { naf?: string; from_session_id?: string }
      if (nafrData.naf) {
        try {
          const parsed = JSON.parse(nafrData.naf)
          this.handleNAFRMessage(parsed)
        } catch (error) {
          this.logger.error('[NAF] Failed to parse NAFR data', error)
        }
      } else {
        this.handleNAFRMessage(data as NAFMessage)
      }
    })

    // PresenceManagerからユーザー情報を同期
    this.logger.debug('[UserAvatarManager] Setting up Presence listeners')
    this.presenceManager.on('join', this.handleUserJoin.bind(this))
    this.presenceManager.on('leave', this.handleUserLeave.bind(this))

    // システムイベントを監視
    this.eventBus.on(SystemEvents.USER_JOINED, this.handleSystemUserJoined.bind(this))
    this.eventBus.on(SystemEvents.USER_LEFT, this.handleSystemUserLeft.bind(this))
  }

  private setupConnectionMonitoring(): void {
    // 接続状態を監視してユーザーリストの整合性を保つ
    this.eventBus.on(SystemEvents.CONNECTION_LOST, () => {
      this.logger.debug('[UserAvatarManager] Connection lost - preserving user data')
    })

    this.eventBus.on(SystemEvents.CONNECTION_ESTABLISHED, () => {
      this.logger.debug('[UserAvatarManager] Connection restored - user count:', this.users.size)
      // 再接続後、既存ユーザーの状態を確認
      this.validateUsersAfterReconnection()
    })
  }

  private async validateUsersAfterReconnection(): Promise<void> {
    const userCount = this.users.size
    if (userCount === 0) return

    this.logger.debug(`[UserAvatarManager] Validating ${userCount} users after reconnection`)

    // Simple polling to wait for user state recovery
    const maxAttempts = 10
    let attempts = 0
    let delayMs = 1000

    while (attempts < maxAttempts) {
      const presenceUsers = this.presenceManager.getUsers()
      this.logger.debug(
        `[UserAvatarManager] Post-reconnection check: ${presenceUsers.length} presence users, ${this.users.size} avatar users`,
      )

      // ユーザーリストが回復していれば成功
      if (this.users.size > 0) {
        this.logger.debug('[UserAvatarManager] User list validated after reconnection')
        return
      }

      // Wait with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      delayMs = Math.min(delayMs * 2, 32000)
      attempts++
    }

    // Validation failed after max attempts
    const presenceUsers = this.presenceManager.getUsers()
    if (presenceUsers.length > 0 && this.users.size === 0) {
      this.logger.error(
        '[UserAvatarManager] All users were lost after reconnection and did not recover after retries!',
      )
    }
  }

  private handleNAFMessage(message: NAFMessage): void {
    this.logger.debug('[NAF] Received NAF message', { dataType: message.dataType })
    if (message.dataType === 'u') {
      // 新規アバター作成
      const data = message.data as NAFComponent
      this.updateUserFromNAF(data)
    }
  }

  private handleNAFRMessage(message: NAFMessage): void {
    this.logger.debug('[NAF] Received NAFR message', { dataType: message.dataType })

    // NAFRメッセージが文字列の場合はパース
    let parsedMessage = message
    if (typeof message === 'string') {
      try {
        parsedMessage = JSON.parse(message)
      } catch (error) {
        this.logger.error('[NAF] Failed to parse NAFR message', error)
        return
      }
    }

    if (parsedMessage.dataType === 'um') {
      // アバター更新
      const data = parsedMessage.data as { d: NAFComponent[] }
      if (data.d && Array.isArray(data.d)) {
        this.logger.debug('[NAF] Processing NAFR updates', { count: data.d.length })
        for (const component of data.d) {
          this.updateUserFromNAF(component)
        }
      }
    }
  }

  private updateUserFromNAF(data: NAFComponent): void {
    const networkId = data.networkId
    if (!networkId) return

    // デバッグ: NAFメッセージの構造をログ出力（最初の10回）
    const debugCounter = '_UserAvatarManager_debugCount'
    const globalState = globalThis as unknown as Record<string, number>
    if (!(debugCounter in globalState)) globalState[debugCounter] = 0
    if (globalState[debugCounter] < 10) {
      this.logger.debug(`[DEBUG] NAF message #${globalState[debugCounter] + 1} for ${networkId}:`, {
        networkId,
        creator: data.creator,
        owner: data.owner,
        template: data.template,
        componentsKeys: Object.keys(data.components || {}),
      })
      globalState[debugCounter]++
    }

    // PresenceManagerから詳細なユーザー情報を取得
    let presenceUser = this.presenceManager.getUser(networkId)
    let nickname = presenceUser?.profile.displayName

    // networkIdで見つからない場合、戦略的にユーザーを解決
    if (!nickname) {
      const resolvedUserId = this.resolveUserId(networkId, data)
      if (resolvedUserId) {
        presenceUser = this.presenceManager.getUser(resolvedUserId)
        nickname = presenceUser?.profile.displayName
      }
    }

    // まだニックネームが見つからない場合はUnknownを使用
    if (!nickname) {
      nickname = 'Unknown'
      this.logger.debug(
        `[NAF] Could not find displayName for networkId: ${networkId}, creator: ${data.creator}, owner: ${data.owner}`,
      )
    }

    // 既存のユーザー情報を取得または新規作成
    const existingUser = this.users.get(networkId)
    const isNewUser = !existingUser

    // 位置情報を取得
    const positionComponent = data.components[NafComponentId.Position] as
      | { x: number; y: number; z: number; isVector3?: boolean }
      | undefined

    const position = positionComponent || existingUser?.position || { x: 0, y: 0, z: 0 }

    // デバッグ: 位置情報の更新をログ出力
    if (positionComponent) {
      this.logger.debug(
        `[NAF] Position update for ${networkId}: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`,
      )
    }

    // 回転情報を取得（オイラー角またはクォータニオン）
    let rotation = existingUser?.rotation
    if (data.components[NafComponentId.BodyRotation]) {
      // オイラー角（度数）からクォータニオンに変換
      const eulerRotation = data.components[NafComponentId.BodyRotation] as {
        x: number
        y: number
        z: number
      }
      const { x, y, z } = eulerRotation
      rotation = this.eulerToQuaternion(x, y, z)
    } else if (data.components[NafComponentId.Velocity]) {
      // 従来のクォータニオン形式（後方互換性）
      const velocityRotation = data.components[NafComponentId.Velocity] as {
        x: number
        y: number
        z: number
      }
      const { x, y, z } = velocityRotation
      // クォータニオンの w を計算して正規化
      const w = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z))
      rotation = this.normalizeQuaternion({ x, y, z, w })
    }

    // アバターID を取得
    const avatarComponent = data.components[NafComponentId.Avatar] as
      | { avatarSrc?: string }
      | undefined
    const avatarId = avatarComponent?.avatarSrc
      ? this.extractAvatarId(avatarComponent.avatarSrc)
      : existingUser?.avatarId

    const userAvatar: UserAvatar = {
      id: networkId,
      nickname,
      position: { x: position.x, y: position.y, z: position.z },
      rotation: rotation ? this.normalizeQuaternion(rotation) : { x: 0, y: 0, z: 0, w: 1 },
      avatarId,
      lastUpdated: Date.now(),
    }

    // ユーザー情報を更新
    this.users.set(networkId, userAvatar)

    // owner/creatorがセッションIDの場合、そのIDでも同じ情報を保存（逆マッピング）
    if (data.owner && data.owner !== networkId) {
      this.users.set(data.owner, { ...userAvatar, id: data.owner })
    }
    if (data.creator && data.creator !== networkId && data.creator !== data.owner) {
      this.users.set(data.creator, { ...userAvatar, id: data.creator })
    }

    // イベントを発火
    if (isNewUser) {
      this.emit('userJoined', userAvatar)
    } else {
      // 位置が変更されたかチェック
      if (existingUser && this.hasPositionChanged(existingUser.position, userAvatar.position)) {
        this.emit('userMoved', userAvatar)
      } else {
        this.emit('userUpdated', userAvatar)
      }
    }
  }

  /**
   * Use injected resolver to resolve user ID
   */
  private resolveUserId(networkId: string, nafData: NAFComponent): string | undefined {
    // キャッシュチェック
    if (this.idMappingCache.has(networkId)) {
      this.resolutionMetrics.cacheHits++
      return this.idMappingCache.get(networkId)
    }

    // ブラックリストチェック
    if (this.unmappableIds.has(networkId)) {
      return undefined
    }

    const allUsers = this.presenceManager.getUsers()
    this.resolutionMetrics.total++

    // Use injected resolver
    const result = this.idResolver.resolve(networkId, allUsers, nafData)

    if (result.userId && result.confidence !== 'none') {
      this.logger.debug(`[NAF] User resolved using strategy: ${result.strategy}`, {
        networkId,
        confidence: result.confidence,
        resolvedId: result.userId,
        strategy: result.strategy,
      })

      // キャッシュに保存
      this.idMappingCache.set(networkId, result.userId)

      // メトリクス記録
      const count = this.resolutionMetrics.byStrategy.get(result.strategy || 'unknown') || 0
      this.resolutionMetrics.byStrategy.set(result.strategy || 'unknown', count + 1)

      return result.userId
    }

    // 解決不可能な場合
    this.unmappableIds.add(networkId)
    this.resolutionMetrics.failures++

    this.logger.warn(`[NAF] Unable to resolve user ID`, {
      networkId,
      availableUsers: allUsers.map((u) => u.id),
      nafCreator: nafData.creator,
      nafOwner: nafData.owner,
    })

    // メトリクスログ（100回ごと）
    if (this.resolutionMetrics.total % 100 === 0) {
      this.logger.info('[NAF] ID Resolution Metrics', {
        total: this.resolutionMetrics.total,
        cacheHits: this.resolutionMetrics.cacheHits,
        failures: this.resolutionMetrics.failures,
        byStrategy: Object.fromEntries(this.resolutionMetrics.byStrategy),
      })
    }

    return undefined
  }

  /**
   * Create default resolver if none is injected
   */
  private createDefaultResolver(): IUserIdResolver {
    return new CompositeUserIdResolver([
      new ExactMatchResolver(),
      new CreatorMatchResolver(),
      new OwnerMatchResolver(),
      new PrefixMatchResolver(16), // 16-character prefix for UUID format
    ])
  }

  /**
   * IDキャッシュを無効化
   */
  public invalidateIdCache(userId?: string): void {
    if (userId) {
      // 特定ユーザーのキャッシュエントリを削除
      for (const [networkId, cachedUserId] of this.idMappingCache.entries()) {
        if (cachedUserId === userId) {
          this.idMappingCache.delete(networkId)
        }
      }
    } else {
      // 全キャッシュクリア
      this.idMappingCache.clear()
      this.unmappableIds.clear()
    }
  }

  private hasPositionChanged(
    oldPos: UserAvatar['position'],
    newPos: UserAvatar['position'],
  ): boolean {
    if (!oldPos || !newPos) return false
    return oldPos.x !== newPos.x || oldPos.y !== newPos.y || oldPos.z !== newPos.z
  }

  private eulerToQuaternion(
    x: number,
    y: number,
    z: number,
  ): { x: number; y: number; z: number; w: number } {
    // オイラー角（度数）からクォータニオンに変換
    const xRad = (x * Math.PI) / 180
    const yRad = (y * Math.PI) / 180
    const zRad = (z * Math.PI) / 180

    const cx = Math.cos(xRad / 2)
    const sx = Math.sin(xRad / 2)
    const cy = Math.cos(yRad / 2)
    const sy = Math.sin(yRad / 2)
    const cz = Math.cos(zRad / 2)
    const sz = Math.sin(zRad / 2)

    return this.normalizeQuaternion({
      x: sx * cy * cz - cx * sy * sz,
      y: cx * sy * cz + sx * cy * sz,
      z: cx * cy * sz - sx * sy * cz,
      w: cx * cy * cz + sx * sy * sz,
    })
  }

  private normalizeQuaternion(rotation: { x: number; y: number; z: number; w: number }) {
    const { x, y, z, w } = rotation
    const length = Math.hypot(x, y, z, w)
    if (length === 0) {
      return { x: 0, y: 0, z: 0, w: 1 }
    }
    return {
      x: x / length,
      y: y / length,
      z: z / length,
      w: w / length,
    }
  }

  private extractAvatarId(avatarSrc: string): string | undefined {
    // avatarSrcからアバターIDを抽出
    const match = avatarSrc.match(/avatar_id=([^&]+)/)
    return match ? match[1] : undefined
  }

  private handleUserJoin(user: { id: string; profile: { displayName?: string } }): void {
    this.logger.debug('[Presence] User joined', { id: user.id, name: user.profile.displayName })

    // Presence更新時に失敗したID解決を再試行
    if (this.unmappableIds.size > 0) {
      const idsToRetry = Array.from(this.unmappableIds)
      this.unmappableIds.clear()
      this.logger.debug(`[NAF] Retrying ID resolution for ${idsToRetry.length} unmappable IDs`)
    }
    // PresenceManagerからのユーザー参加イベントを処理
    if (!this.users.has(user.id)) {
      const userAvatar: UserAvatar = {
        id: user.id,
        nickname: user.profile.displayName || 'Unknown',
        position: { x: 0, y: 0, z: 0 }, // デフォルト位置を設定
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        lastUpdated: Date.now(),
      }
      this.users.set(user.id, userAvatar)
      this.logger.debug(
        `[PRESENCE] User joined: ${userAvatar.nickname} (${user.id}), position initialized to origin`,
      )
    }
  }

  private handleUserLeave(user: { id: string }): void {
    const userAvatar = this.users.get(user.id)
    if (userAvatar) {
      this.users.delete(user.id)
      this.emit('userLeft', userAvatar)
    }
  }

  private handleSystemUserJoined(data: unknown): void {
    // システムイベントからのユーザー参加を処理
    if (typeof data === 'object' && data !== null && 'id' in data) {
      const userId = (data as { id: string }).id
      // 既にPresenceManagerのイベントで処理されている可能性があるため、重複チェック
      if (!this.users.has(userId)) {
        this.handleUserJoin(data as { id: string; profile: { displayName?: string } })
      }
    }
  }

  private handleSystemUserLeft(data: unknown): void {
    // システムイベントからのユーザー退出を処理
    if (typeof data === 'object' && data !== null && 'id' in data) {
      this.handleUserLeave(data as { id: string })
    }
  }

  private emit(event: UserAvatarEvent, user: UserAvatar): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(user)
        } catch (error) {
          this.logger.error(`Error in ${event} handler`, { error })
        }
      }
    }
  }

  getUsers(): UserAvatar[] {
    // Presenceに存在しないユーザーを除外してクリーンアップ
    this.cleanupStaleUsers()
    // 全てのユーザーを返す（位置情報はデフォルト値が設定されている）
    return Array.from(this.users.values())
  }

  getUser(userId: string): UserAvatar | undefined {
    return this.users.get(userId)
  }

  getUserCount(): number {
    return this.users.size
  }

  getUsersInRange(center: { x: number; y: number; z: number }, radius: number): UserAvatar[] {
    return this.getUsers().filter((user) => {
      const dx = user.position.x - center.x
      const dy = user.position.y - center.y
      const dz = user.position.z - center.z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      return distance <= radius
    })
  }

  getNearestUser(center: { x: number; y: number; z: number }): UserAvatar | null {
    const users = this.getUsers()
    if (users.length === 0) return null

    let nearestUser: UserAvatar | null = null
    let minDistance = Infinity

    for (const user of users) {
      const dx = user.position.x - center.x
      const dy = user.position.y - center.y
      const dz = user.position.z - center.z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

      if (distance < minDistance) {
        minDistance = distance
        nearestUser = user
      }
    }

    return nearestUser
  }

  private cleanupStaleUsers(): void {
    // PresenceManagerに存在しないユーザーを削除
    const presenceUsers = this.presenceManager.getUsers()
    const presenceUserIds = new Set(presenceUsers.map((user) => user.id))

    for (const [userId, userAvatar] of this.users.entries()) {
      // Presenceに存在しないユーザーでも、最近更新されたものは保持（NAFユーザー用）
      const recentThreshold = Date.now() - 300000 // 5分
      const isRecentlyUpdated = userAvatar.lastUpdated > recentThreshold

      if (!presenceUserIds.has(userId) && !isRecentlyUpdated) {
        this.logger.debug(`[CLEANUP] Remove stale user: ${userAvatar.nickname} (${userId})`)
        this.users.delete(userId)
      }
    }
  }

  on(event: UserAvatarEvent, handler: (user: UserAvatar) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set())
    }
    this.eventHandlers.get(event)?.add(handler)
  }

  off(event: UserAvatarEvent, handler: (user: UserAvatar) => void): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      handlers.delete(handler)
    }
  }
}
