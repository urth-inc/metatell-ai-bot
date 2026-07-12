import type { MetatellClient } from '@metatell/bot-sdk'
import type { Blackboard, ChatInbox, ChatLine, PendingMention } from './engine/types.js'
import { KILL_COMMAND, type SafeSpeaker, truncateSay } from './safety.js'

// SDKのUser型のうちセンサー層が読む部分だけの構造型
interface RoomUser {
  name: string | null
  isBot?: boolean
  position?: { x: number; y: number; z: number }
}

/**
 * Sensor layer: turns SDK events and polling into a blackboard snapshot
 * and a chat inbox that condition nodes can read.
 *
 * Safety guard baked in here: chat written by bots is excluded from
 * perception so that LLM bots cannot end up in an infinite reply loop
 * with each other. ALLOW_BOT_PERCEPTION=1 relaxes this for supervised
 * multi-bot demonstrations only.
 */

const MAX_RECENT_CHAT = 30
const MAX_PENDING_MENTIONS = 5

export interface SensorOptions {
  client: MetatellClient
  botName: string
  botSessionId: string | undefined
  allowBotPerception: boolean
  /** Users allowed to trigger the kill switch. Empty = anyone (with a startup warning). */
  operators: string[]
  speaker: SafeSpeaker
  onKill: (byName: string) => void
  log: (message: string) => void
}

export interface Sensors {
  inbox: ChatInbox
  /** Writes the perception snapshot for this tick into the blackboard. */
  snapshot(bb: Blackboard, now: number): void
}

export function createSensors(options: SensorOptions): Sensors {
  const { client, botName, botSessionId, allowBotPerception, operators, speaker, log } = options
  const recentChat: ChatLine[] = []
  const mentions: PendingMention[] = []

  const isSelf = (user: RoomUser): boolean => user.name === botName
  const isPerceivable = (user: RoomUser): boolean =>
    !isSelf(user) && (allowBotPerception || user.isBot !== true)

  client.chat.onMessage(({ from, text, mention, reply }) => {
    // キルスイッチはあらゆる知覚除外より先に判定する（ボット経由でも止められるように）
    if (text.trim() === KILL_COMMAND && !isSelf(from)) {
      if (operators.length === 0 || operators.includes(from.name ?? '')) {
        options.onKill(from.name ?? '(不明)')
        return
      }
      log(`キルスイッチ: ${from.name}は運営（OPERATOR_NAMES）ではないため無視しました`)
      return
    }
    if (!isPerceivable(from)) return

    recentChat.push({ fromName: from.name ?? '(名無し)', text, atMs: Date.now() })
    if (recentChat.length > MAX_RECENT_CHAT) recentChat.shift()

    if (mention && botSessionId !== undefined && mention.sessionId === botSessionId) {
      if (mentions.length >= MAX_PENDING_MENTIONS) mentions.shift()
      mentions.push({
        fromName: from.name ?? '(名無し)',
        text,
        // 返信も発言間隔ガードを通す。ガードを迂回する発言経路を作らない
        reply: (answer) => speaker.trySend(() => reply(truncateSay(answer)), answer),
      })
    }
  })

  client.on('user-join', (user) => {
    if (!isPerceivable(user)) return
    log(`入室: ${user.name}`)
  })

  return {
    inbox: {
      peekMention: () => mentions[0],
      takeMention: () => mentions.shift(),
      recentChat: () => [...recentChat],
    },

    snapshot(bb, now) {
      const self = client.avatar.getPosition()
      if (self) bb.set('position', { x: self.x, y: self.y, z: self.z })

      const users = client.getUsers().filter(isPerceivable)
      bb.set('userCount', users.length)
      bb.set(
        'users',
        users.map((user) => ({
          name: user.name ?? '(名無し)',
          x: user.position?.x ?? null,
          y: user.position?.y ?? null,
          z: user.position?.z ?? null,
        })),
      )

      // 自分から最も近いユーザーを条件・行動ノード用に切り出す
      let nearest: { name: string; x: number; y: number; z: number; distance: number } | null = null
      if (self) {
        for (const user of users) {
          if (!user.position) continue
          const dx = user.position.x - self.x
          const dy = user.position.y - self.y
          const dz = user.position.z - self.z
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (!nearest || distance < nearest.distance) {
            nearest = {
              name: user.name ?? '(名無し)',
              x: user.position.x,
              y: user.position.y,
              z: user.position.z,
              distance,
            }
          }
        }
      }
      if (nearest) {
        bb.set('nearestUser', { name: nearest.name, x: nearest.x, y: nearest.y, z: nearest.z })
        bb.set('nearestUserName', nearest.name)
        bb.set('nearestUserDistance', nearest.distance)
      } else {
        bb.delete('nearestUser')
        bb.delete('nearestUserName')
        bb.delete('nearestUserDistance')
      }
      bb.set('nowMs', now)
    },
  }
}
