import { ServiceIdentifier } from '../ServiceIdentifier.js'

/**
 * User avatar information.
 */
export interface UserAvatar {
  /** User ID, usually the session ID. */
  id: string
  /** User nickname. */
  nickname: string
  /** Avatar position. */
  position: {
    x: number
    y: number
    z: number
  }
  /** Avatar rotation. */
  rotation?: {
    x: number
    y: number
    z: number
    w: number
  }
  /** Avatar ID. */
  avatarId?: string
  /** Last update timestamp. */
  lastUpdated: number
}

/**
 * User avatar management events.
 */
export type UserAvatarEvent = 'userJoined' | 'userLeft' | 'userMoved' | 'userUpdated'

/**
 * User avatar management interface.
 */
export interface IUserAvatarManager {
  /**
   * Gets all current user avatar information.
   * @returns Array of user avatar information.
   */
  getUsers(): UserAvatar[]

  /**
   * Gets information for a specific user.
   * @param userId User ID.
   * @returns User avatar information, or undefined when the user does not exist.
   */
  getUser(userId: string): UserAvatar | undefined

  /**
   * Gets the current user count.
   * @returns Number of users.
   */
  getUserCount(): number

  /**
   * Gets users within the specified range.
   * @param center Center position.
   * @param radius Radius.
   * @returns Array of user avatar information within the range.
   */
  getUsersInRange(center: { x: number; y: number; z: number }, radius: number): UserAvatar[]

  /**
   * Gets the nearest user.
   * @param center Reference position.
   * @returns Nearest user, or null when no user exists.
   */
  getNearestUser(center: { x: number; y: number; z: number }): UserAvatar | null

  /**
   * Registers an event handler.
   * @param event Event name.
   * @param handler Event handler.
   */
  on(event: UserAvatarEvent, handler: (user: UserAvatar) => void): void

  /**
   * Unregisters an event handler.
   * @param event Event name.
   * @param handler Event handler.
   */
  off(event: UserAvatarEvent, handler: (user: UserAvatar) => void): void
}

// Service identifier token for dependency injection
export abstract class UserAvatarManager extends ServiceIdentifier<IUserAvatarManager> {}
