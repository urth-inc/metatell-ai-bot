import type { MetatellClient } from '@metatell/bot-sdk'

export class AvatarHandler {
  private isMoving = false
  private animationInterval?: NodeJS.Timeout

  constructor(private client: MetatellClient) {}

  async initialize() {
    // 利用可能なアニメーションを確認
    const animations = await this.client.avatar.getAvailableAnimations()
    console.log(
      'Available animations:',
      animations.map((a) => `${a.id}: ${a.name}`),
    )

    // 定期的にユーザーを追跡
    this.startFollowingUser()
  }

  /**
   * Play animation with error handling
   */
  private async playAnimation(animationId: string) {
    try {
      await this.client.avatar.play({ id: animationId, loop: true })
    } catch (error) {
      console.warn(`Animation ${animationId} not available:`, error)
    }
  }

  /**
   * Start following the nearest user
   */
  private startFollowingUser() {
    this.animationInterval = setInterval(async () => {
      const users = this.client.getUsers()
      const meInfo = await this.client.getInfo()

      // 自分以外のユーザーを探す
      const otherUser = users.find((user) => user.name !== meInfo.name)
      if (!otherUser?.position) {
        // ユーザーがいない場合は待機
        if (this.isMoving) {
          this.isMoving = false
          await this.playAnimation('idle')
        }
        return
      }

      const currentPosition = this.client.avatar.getPosition()
      if (!currentPosition) return

      // 目標位置を計算（ユーザーから1.5m離れた位置）
      const targetPosition = {
        x: otherUser.position.x + 1.5,
        y: otherUser.position.y,
        z: otherUser.position.z + 1.5,
      }

      // 現在位置と目標位置の距離を計算
      const dx = targetPosition.x - currentPosition.x
      const dy = targetPosition.y - currentPosition.y
      const dz = targetPosition.z - currentPosition.z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

      // 相手の方を向く（常に向きを調整）
      await this.client.avatar.lookAt({
        x: otherUser.position.x,
        y: otherUser.position.y,
        z: otherUser.position.z,
      })

      // 距離に応じて移動とアニメーションを制御
      const moveThreshold = 1.0
      const slowMoveThreshold = 3.0 // 3m以内はゆっくり移動

      if (distance > moveThreshold) {
        // 移動が必要
        if (!this.isMoving) {
          this.isMoving = true
          await this.playAnimation('walking') // 歩行アニメーション開始
        }

        // 段階的に移動（ゆっくり近づく）
        const moveSpeed = distance < slowMoveThreshold ? 0.2 : 1.0 // 近い時は遅く
        const moveRatio = Math.min(moveSpeed, distance) / distance

        const stepPosition = {
          x: currentPosition.x + dx * moveRatio,
          y: currentPosition.y + dy * moveRatio,
          z: currentPosition.z + dz * moveRatio,
        }

        await this.client.avatar.moveTo(stepPosition)
      } else {
        // 十分近い場合は停止
        if (this.isMoving) {
          this.isMoving = false
          await this.playAnimation('idle') // 待機アニメーション
        }
      }
    }, 200) // 200ms間隔で更新
  }

  /**
   * Stop avatar movement and cleanup
   */
  stop() {
    if (this.animationInterval) {
      clearInterval(this.animationInterval)
      this.animationInterval = undefined
    }
  }
}
