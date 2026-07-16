import type { MetatellClient } from '@metatell/bot-sdk'
import type { Blackboard, ChatInbox, ChatLine, PendingMention } from './engine/types.js'
import { KILL_COMMAND, type SafeSpeaker, truncateSay } from './safety.js'

// SDKのUser型のうちセンサー層が読む部分だけの構造型
interface RoomUser {
  id: string
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
  allowBotPerception: boolean
  /** Session IDs allowed to trigger the kill switch. Empty disables remote kills. */
  operatorSessionIds: string[]
  speaker: SafeSpeaker
  onKill: (byName: string) => void
  log: (message: string) => void
}

export interface Sensors {
  inbox: ChatInbox
  /** Fail-closed gate checked before room audio is sent to Speech-to-Text. */
  canPerceiveSpeech(fromIdentity: string): boolean
  /** Adds one final Speech-to-Text result to the existing chat/mention perception queues. */
  acceptSpeech(fromIdentity: string, text: string): void
  /** Writes the perception snapshot for this tick into the blackboard. */
  snapshot(bb: Blackboard, now: number): void
}

export function createSensors(options: SensorOptions): Sensors {
  const { client, botName, allowBotPerception, operatorSessionIds, speaker, log } = options
  const recentChat: ChatLine[] = []
  const mentions: PendingMention[] = []

  const isSelf = (user: RoomUser): boolean => {
    const currentSessionId = client.getSessionId()
    return currentSessionId === null ? user.name === botName : user.id === currentSessionId
  }
  const isPerceivable = (user: RoomUser): boolean =>
    !isSelf(user) && (allowBotPerception || user.isBot !== true)
  const isPerceivableChat = (user: RoomUser): boolean => {
    if (isSelf(user)) return false
    if (allowBotPerception) return true

    // chat event側のisBotはPresence同期前だとfalseになり得る。同期済み一覧で
    // humanと確認できるまで捨て、bot同士の応答ループをfail-closedで防ぐ。
    const presenceUser = client.getUsers().find((candidate) => candidate.id === user.id)
    return presenceUser?.isBot === false
  }
  const perceivableSpeechUser = (fromIdentity: string): RoomUser | null => {
    const user = client.getUsers().find((candidate) => candidate.id === fromIdentity)
    return user && isPerceivableChat(user) ? user : null
  }
  const appendRecentChat = (fromName: string, text: string): void => {
    recentChat.push({ fromName, text, atMs: Date.now() })
    if (recentChat.length > MAX_RECENT_CHAT) recentChat.shift()
  }
  const appendMention = (mention: PendingMention): void => {
    if (mentions.length >= MAX_PENDING_MENTIONS) mentions.shift()
    mentions.push(mention)
  }
  client.chat.onMessage(({ from, text, mention, reply }) => {
    // キルスイッチはあらゆる知覚除外より先に判定する（ボット経由でも止められるように）
    if (text.trim() === KILL_COMMAND && !isSelf(from)) {
      if (operatorSessionIds.includes(from.id)) {
        options.onKill(from.name ?? '(不明)')
        return
      }
      log(
        `キルスイッチ: ${from.name}（session ID: ${from.id}）は運営（OPERATOR_SESSION_IDS）ではないため無視しました`,
      )
      return
    }
    if (!isPerceivableChat(from)) return

    appendRecentChat(from.name ?? '(名無し)', text)

    const currentSessionId = client.getSessionId()
    if (mention && currentSessionId !== null && mention.sessionId === currentSessionId) {
      appendMention({
        fromName: from.name ?? '(名無し)',
        text,
        // 人が明示的に呼んだ返信は間隔内でも捨てず、安全な時刻まで待って1回送る。
        reply: (answer) =>
          speaker.sendWhenReady(() => reply(truncateSay(answer)), answer, {
            targetSessionId: from.id,
          }),
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

    canPerceiveSpeech: (fromIdentity) => perceivableSpeechUser(fromIdentity) !== null,

    acceptSpeech(fromIdentity, text) {
      const user = perceivableSpeechUser(fromIdentity)
      const transcript = text.trim()
      if (!user || transcript === '') return

      const fromName = user.name ?? '(名無し)'
      appendRecentChat(fromName, transcript)
      log(`音声認識（BT入力へ追加）: ${fromName}: ${transcript}`)

      appendMention({
        fromName,
        text: transcript,
        // 音声にはchat reply threadがないため、通常送信を共通speakerで音声付き返信にする。
        reply: (answer) =>
          speaker.sendWhenReady(() => client.chat.send(truncateSay(answer)), answer, {
            targetSessionId: fromIdentity,
          }),
      })
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
      let nearest: {
        id: string
        name: string
        x: number
        y: number
        z: number
        distance: number
      } | null = null
      if (self) {
        for (const user of users) {
          if (!user.position) continue
          const dx = user.position.x - self.x
          const dy = user.position.y - self.y
          const dz = user.position.z - self.z
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (!nearest || distance < nearest.distance) {
            nearest = {
              id: user.id,
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
        bb.set('nearestUserId', nearest.id)
        bb.set('nearestUserName', nearest.name)
        bb.set('nearestUserDistance', nearest.distance)
      } else {
        bb.delete('nearestUser')
        bb.delete('nearestUserId')
        bb.delete('nearestUserName')
        bb.delete('nearestUserDistance')
      }
      bb.set('nowMs', now)
    },
  }
}
