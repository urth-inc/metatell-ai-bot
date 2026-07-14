import fs from 'node:fs'
import path from 'node:path'
import type { JsonObject, JsonValue, Vec3 } from './engine/types.js'

/** One patrol destination defined in bot.config.json. */
export interface PatrolPoint {
  label: string
  position: Vec3
}

/** User-editable settings (beginner tier edits only this file and .env). */
export interface BotConfig {
  name: string
  greeting: string
  patrol: PatrolPoint[]
  tickMs: number
  /** Aliases used by the emote node, e.g. { "greet": "<animation id>" }. Empty values mean unassigned. */
  emotes: Record<string, string>
}

const DEFAULT_TICK_MS = 500
const MIN_TICK_MS = 200

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Loads and validates my-bot/bot.config.json with Japanese error messages. */
export function loadBotConfig(myBotDir: string): BotConfig {
  const file = path.join(myBotDir, 'bot.config.json')
  if (!fs.existsSync(file)) {
    throw new Error(`bot.config.jsonが見つかりません: ${file}`)
  }
  let doc: JsonValue
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8')) as JsonValue
  } catch (error) {
    throw new Error(`bot.config.jsonがJSONとして読めません: ${String(error)}`)
  }
  if (!isObject(doc)) throw new Error('bot.config.jsonはオブジェクトで書いてください')

  const errors: string[] = []
  const name = typeof doc.name === 'string' && doc.name !== '' ? doc.name : null
  if (!name) errors.push('「name」（ボットの名前）が必要です')
  const greeting = typeof doc.greeting === 'string' ? doc.greeting : ''
  if (greeting === '') errors.push('「greeting」（挨拶のセリフ）が必要です')

  const patrol: PatrolPoint[] = []
  if (!Array.isArray(doc.patrol)) {
    errors.push('「patrol」（巡回地点の配列）が必要です。空配列でも構いません')
  } else {
    doc.patrol.forEach((entry, index) => {
      if (
        !isObject(entry) ||
        typeof entry.x !== 'number' ||
        typeof entry.y !== 'number' ||
        typeof entry.z !== 'number'
      ) {
        errors.push(`patrolの${index + 1}番目にはx, y, z（数値）が必要です`)
        return
      }
      patrol.push({
        label: typeof entry.label === 'string' ? entry.label : `地点${index + 1}`,
        position: { x: entry.x, y: entry.y, z: entry.z },
      })
    })
  }

  const tickMs =
    typeof doc.tickMs === 'number' ? Math.max(MIN_TICK_MS, doc.tickMs) : DEFAULT_TICK_MS

  const emotes: Record<string, string> = {}
  if (doc.emotes !== undefined) {
    if (!isObject(doc.emotes)) {
      errors.push('「emotes」は { "別名": "アニメーションID" } のオブジェクトで書いてください')
    } else {
      for (const [alias, value] of Object.entries(doc.emotes)) {
        if (typeof value !== 'string') {
          errors.push(`emotesの「${alias}」の値は文字列で書いてください`)
        } else if (value !== '') {
          // 空文字は「未割り当て」の意味で許容する（配布時の雛形用）
          emotes[alias] = value
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`bot.config.jsonにエラーがあります:\n- ${errors.join('\n- ')}`)
  }
  return { name: name ?? '', greeting, patrol, tickMs, emotes }
}

/** Loads my-bot/persona.md (natural-language character sheet). */
export function loadPersona(myBotDir: string): string {
  const file = path.join(myBotDir, 'persona.md')
  if (!fs.existsSync(file)) {
    throw new Error(`persona.mdが見つかりません: ${file}`)
  }
  const text = fs.readFileSync(file, 'utf8').trim()
  if (text === '') throw new Error('persona.mdが空です。キャラ設定を書いてください')
  return text
}
