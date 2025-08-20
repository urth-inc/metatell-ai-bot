import { getLogger } from '../../sdk/logging/index.js'
import { NafComponentId } from '../builders/NafMessageBuilder.js'
import { type IEventBus, SystemEvents } from '../interfaces/IEventBus.js'
import type { IMessageService } from '../interfaces/IMessageService.js'
import type { IPresenceManager } from '../interfaces/IPresenceManager.js'
import type {
  IUserAvatarManager,
  UserAvatar,
  UserAvatarEvent,
} from '../interfaces/IUserAvatarManager.js'

interface NAFComponent {
  networkId: string
  owner: string
  creator: string
  template: string
  components: Record<string, unknown>
}

interface NAFMessage {
  dataType: 'u' | 'r' | 'um'
  data: NAFComponent | { d: NAFComponent[] }
}

export class UserAvatarManager implements IUserAvatarManager {
  private users = new Map<string, UserAvatar>()
  private eventHandlers = new Map<UserAvatarEvent, Set<(user: UserAvatar) => void>>()
  private logger = getLogger('UserAvatarManager')

  constructor(
    private messageService: IMessageService,
    private presenceManager: IPresenceManager,
    private eventBus: IEventBus,
  ) {
    this.setupEventListeners()
    this.setupConnectionMonitoring()
  }

  private setupEventListeners(): void {
    // NAFメッセージを監視してアバターの位置情報を追跡
    this.messageService.on('naf', (data: unknown) => this.handleNAFMessage(data as NAFMessage))
    this.messageService.on('nafr', (data: unknown) => this.handleNAFRMessage(data as NAFMessage))

    // PresenceManagerからユーザー情報を同期
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
      await new Promise(resolve => setTimeout(resolve, delayMs))
      delayMs = Math.min(delayMs * 2, 32000)
      attempts++
    }

    // Validation failed after max attempts
    const presenceUsers = this.presenceManager.getUsers()
    if (presenceUsers.length > 0 && this.users.size === 0) {
      this.logger.error('[UserAvatarManager] All users were lost after reconnection and did not recover after retries!')
    }
  }

  private handleNAFMessage(message: NAFMessage): void {
    if (message.dataType === 'u') {
      // 新規アバター作成
      const data = message.data as NAFComponent
      this.updateUserFromNAF(data)
    }
  }

  private handleNAFRMessage(message: NAFMessage): void {
    if (message.dataType === 'um') {
      // アバター更新
      const data = message.data as { d: NAFComponent[] }
      if (data.d && Array.isArray(data.d)) {
        for (const component of data.d) {
          this.updateUserFromNAF(component)
        }
      }
    }
  }

  private updateUserFromNAF(data: NAFComponent): void {
    const networkId = data.networkId
    if (!networkId) return

    // デバッグ: NAFメッセージの構造をログ出力（最初の10回のみ）
    const debugCounter = '_UserAvatarManager_debugCount'
    const globalState = globalThis as unknown as Record<string, number>
    if (!(debugCounter in globalState)) globalState[debugCounter] = 0
    if (globalState[debugCounter] < 3) {
      this.logger.debug(
        `[DEBUG] NAF message for ${networkId}:`,
        JSON.stringify(
          {
            networkId,
            components: data.components,
          },
          null,
          2,
        ),
      )
      globalState[debugCounter]++
    }

    // PresenceManagerから詳細なユーザー情報を取得
    const presenceUser = this.presenceManager.getUser(networkId)
    let nickname = presenceUser?.profile.displayName

    // PresenceManagerにユーザー情報がない場合は、Unknownを使用
    if (!nickname) {
      nickname = 'Unknown'
    }

    // 既存のユーザー情報を取得または新規作成
    const existingUser = this.users.get(networkId)
    const isNewUser = !existingUser

    // 位置情報を取得
    const positionComponent = data.components[NafComponentId.Position] as { x: number; y: number; z: number; isVector3?: boolean } | undefined
    const position = positionComponent || existingUser?.position

    // 位置情報がない場合は処理をスキップ（デフォルト値を設定しない）
    if (!position) {
      this.logger.debug(`[NAF] No position data for ${networkId}, skipping update`)
      return
    }

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
      const eulerRotation = data.components[NafComponentId.BodyRotation] as { x: number; y: number; z: number }
      const { x, y, z } = eulerRotation
      rotation = this.eulerToQuaternion(x, y, z)
    } else if (data.components[NafComponentId.Velocity]) {
      // 従来のクォータニオン形式（後方互換性）
      const velocityRotation = data.components[NafComponentId.Velocity] as { x: number; y: number; z: number }
      const { x, y, z } = velocityRotation
      // クォータニオンの w を計算（正規化されていると仮定）
      const w = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z))
      rotation = { x, y, z, w }
    }

    // アバターID を取得
    const avatarComponent = data.components[NafComponentId.Avatar] as { avatarSrc?: string } | undefined
    const avatarId = avatarComponent?.avatarSrc
      ? this.extractAvatarId(avatarComponent.avatarSrc)
      : existingUser?.avatarId

    const userAvatar: UserAvatar = {
      id: networkId,
      nickname,
      position: { x: position.x, y: position.y, z: position.z },
      rotation: rotation || { x: 0, y: 0, z: 0, w: 1 },
      avatarId,
      lastUpdated: Date.now(),
    }

    // ユーザー情報を更新
    this.users.set(networkId, userAvatar)

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

    return {
      x: sx * cy * cz - cx * sy * sz,
      y: cx * sy * cz + sx * cy * sz,
      z: cx * cy * sz - sx * sy * cz,
      w: cx * cy * cz + sx * sy * sz,
    }
  }

  private extractAvatarId(avatarSrc: string): string | undefined {
    // avatarSrcからアバターIDを抽出
    const match = avatarSrc.match(/avatar_id=([^&]+)/)
    return match ? match[1] : undefined
  }

  private handleUserJoin(user: { id: string; profile: { displayName?: string } }): void {
    // PresenceManagerからのユーザー参加イベントを処理
    if (!this.users.has(user.id)) {
      const userAvatar: UserAvatar = {
        id: user.id,
        nickname: user.profile.displayName || 'Unknown',
        position: null as unknown as { x: number; y: number; z: number }, // 位置情報は後でNAFメッセージから設定
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        lastUpdated: Date.now(),
      }
      this.users.set(user.id, userAvatar)
      this.logger.debug(
        `[PRESENCE] User joined: ${userAvatar.nickname} (${user.id}), awaiting position data`,
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
    // 位置情報があるユーザーのみを返す
    return Array.from(this.users.values()).filter((user) => user.position !== null)
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
