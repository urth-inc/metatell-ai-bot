export interface PresenceUser {
  id: string
  profile: {
    displayName?: string
    avatarId?: string
  }
  permissions?: Record<string, boolean>
  roles?: Record<string, boolean>
}

export interface IPresenceManager {
  getUsers(): PresenceUser[]
  getUser(id: string): PresenceUser | undefined
  isUserPresent(id: string): boolean
  on(event: 'join' | 'leave', handler: (user: PresenceUser) => void): void
  off(event: 'join' | 'leave', handler: (user: PresenceUser) => void): void
}