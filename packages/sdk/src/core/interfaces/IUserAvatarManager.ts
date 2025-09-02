import { ServiceIdentifier } from '../ServiceIdentifier.js'

/**
 * ユーザーアバター情報
 */
export interface UserAvatar {
  /** ユーザーID（セッションID） */
  id: string
  /** ユーザーのニックネーム */
  nickname: string
  /** アバターの位置 */
  position: {
    x: number
    y: number
    z: number
  }
  /** アバターの回転 */
  rotation?: {
    x: number
    y: number
    z: number
    w: number
  }
  /** アバターID */
  avatarId?: string
  /** 最終更新時刻 */
  lastUpdated: number
}

/**
 * ユーザーアバター管理のイベント
 */
export type UserAvatarEvent = 'userJoined' | 'userLeft' | 'userMoved' | 'userUpdated'

/**
 * ユーザーアバター管理インターフェース
 */
export interface IUserAvatarManager {
  /**
   * 現在の全ユーザー情報を取得
   * @returns ユーザーアバター情報の配列
   */
  getUsers(): UserAvatar[]

  /**
   * 特定ユーザーの情報を取得
   * @param userId ユーザーID
   * @returns ユーザーアバター情報（存在しない場合はundefined）
   */
  getUser(userId: string): UserAvatar | undefined

  /**
   * 現在のユーザー数を取得
   * @returns ユーザー数
   */
  getUserCount(): number

  /**
   * 指定した範囲内のユーザーを取得
   * @param center 中心座標
   * @param radius 半径
   * @returns 範囲内のユーザーアバター情報の配列
   */
  getUsersInRange(center: { x: number; y: number; z: number }, radius: number): UserAvatar[]

  /**
   * 最寄りのユーザーを取得
   * @param center 基準位置
   * @returns 最寄りのユーザー（存在しない場合はnull）
   */
  getNearestUser(center: { x: number; y: number; z: number }): UserAvatar | null

  /**
   * イベントハンドラーを登録
   * @param event イベント名
   * @param handler イベントハンドラー
   */
  on(event: UserAvatarEvent, handler: (user: UserAvatar) => void): void

  /**
   * イベントハンドラーを解除
   * @param event イベント名
   * @param handler イベントハンドラー
   */
  off(event: UserAvatarEvent, handler: (user: UserAvatar) => void): void
}

// Service identifier token for dependency injection
export abstract class UserAvatarManager extends ServiceIdentifier<IUserAvatarManager> {}
