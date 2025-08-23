import { Presence } from 'phoenix'
import type { IConnectionManager } from '../interfaces/IConnectionManager.js'
import { type IEventBus, SystemEvents } from '../interfaces/IEventBus.js'
import type { IPresenceManager, PresenceUser } from '../interfaces/IPresenceManager.js'

export class PresenceManager implements IPresenceManager {
  private presence: Presence | null = null
  private users = new Map<string, PresenceUser>()
  private handlers = new Map<string, Set<(user: PresenceUser) => void>>()
  private presenceSetup = false

  constructor(
    private connectionManager: IConnectionManager,
    private eventBus: IEventBus,
  ) {
    this.setupPresence()
  }

  private setupPresence(): void {
    this.eventBus.on(SystemEvents.ROOM_JOINED, () => {
      const channel = this.connectionManager.getHubChannel()
      if (!channel || this.presenceSetup) {
        return
      }

      this.presenceSetup = true
      this.presence = new Presence(channel)

      // Handle presence state sync
      this.presence.onSync(() => {
        const newUsers = new Map<string, PresenceUser>()

        // list() returns an array of transformed values
        const presenceList = this.presence?.list((id: string, data: unknown) => {
          const metaData = data as {
            metas?: Array<{
              profile?: { displayName?: string; avatarId?: string }
              permissions?: Record<string, unknown>
              roles?: Record<string, unknown>
            }>
          }

          // Metatellの実際のデータ構造に対応: metasがない場合はdataから直接取得を試す
          let displayName = metaData.metas?.[0]?.profile?.displayName
          let avatarId = metaData.metas?.[0]?.profile?.avatarId

          // もしmetasが空またはundefinedなら、別の構造を試す
          if (!displayName) {
            const altData = data as Record<string, unknown>
            displayName =
              (altData?.displayName as string) ||
              ((altData?.profile as Record<string, unknown>)?.displayName as string) ||
              (altData?.name as string)
          }

          if (!avatarId) {
            const altData = data as Record<string, unknown>
            avatarId =
              (altData?.avatarId as string) ||
              ((altData?.profile as Record<string, unknown>)?.avatarId as string) ||
              (altData?.avatar_id as string)
          }

          const user: PresenceUser = {
            id,
            profile: {
              displayName: displayName,
              avatarId: avatarId,
            },
            permissions: (metaData.metas?.[0]?.permissions || {}) as Record<string, boolean>,
            roles: (metaData.metas?.[0]?.roles || {}) as Record<string, boolean>,
          }

          newUsers.set(id, user)
          return user // Return the user for the array
        }) || []

        // Find joins and leaves
        const joins: PresenceUser[] = []
        const leaves: PresenceUser[] = []

        // Check for new users (joins)
        for (const [id, user] of newUsers) {
          if (!this.users.has(id)) {
            joins.push(user)
          }
        }

        // Check for removed users (leaves)
        for (const [id, user] of this.users) {
          if (!newUsers.has(id)) {
            leaves.push(user)
          }
        }

        // Update internal state
        this.users = newUsers

        // Emit events
        for (const user of joins) {
          this.handleUserJoin(user)
          this.eventBus.emit(SystemEvents.USER_JOINED, user)
        }

        for (const user of leaves) {
          this.handleUserLeave(user)
          this.eventBus.emit(SystemEvents.USER_LEFT, user)
        }
      })

      // Handle presence diff
      channel.on('presence_diff', (_diff: unknown) => {
        // Suppressed: Presence diff logging
      })
    })
  }

  private handleUserJoin(user: PresenceUser): void {
    const handlers = this.handlers.get('join')
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(user)
        } catch (_error) {
          // Suppressed: Error in presence join handler
        }
      }
    }
  }

  private handleUserLeave(user: PresenceUser): void {
    const handlers = this.handlers.get('leave')
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(user)
        } catch (_error) {
          // Suppressed: Error in presence leave handler
        }
      }
    }
  }

  getUsers(): PresenceUser[] {
    return Array.from(this.users.values())
  }

  getUser(id: string): PresenceUser | undefined {
    return this.users.get(id)
  }

  isUserPresent(id: string): boolean {
    return this.users.has(id)
  }

  on(event: 'join' | 'leave', handler: (user: PresenceUser) => void): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)?.add(handler)
  }

  off(event: 'join' | 'leave', handler: (user: PresenceUser) => void): void {
    const eventHandlers = this.handlers.get(event)
    if (eventHandlers) {
      eventHandlers.delete(handler)
      if (eventHandlers.size === 0) {
        this.handlers.delete(event)
      }
    }
  }
}
