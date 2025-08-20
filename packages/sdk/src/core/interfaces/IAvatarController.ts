export interface Position {
  x: number
  y: number
  z: number
}

export interface Rotation {
  x: number
  y: number
  z: number
  w?: number
}

export interface AvatarState {
  networkId: string
  position: Position
  rotation: Rotation
  avatarId: string
  avatarSrc?: string
  displayName?: string
}

export interface IAvatarController {
  spawn(avatarId: string, position?: Position): Promise<void>
  move(position: Position): Promise<void>
  rotate(rotation: Rotation): Promise<void>
  updateState(state: Partial<AvatarState>): Promise<void>
  getState(): AvatarState | null
  destroy(): Promise<void>
  /**
   * Resync avatar state for newly joined users
   * Sends the complete avatar state with isFirstSync flag
   */
  resyncAvatar(): Promise<void>
}
