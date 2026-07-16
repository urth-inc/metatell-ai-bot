import { registerCondition } from '../engine/registry.js'
import type { JsonValue } from '../engine/types.js'

/**
 * Built-in condition nodes.
 * Conditions only read the blackboard snapshot written by the sensor
 * layer (src/sensors.ts) and the chat inbox. They never call the SDK.
 */

function asNumber(value: JsonValue | undefined, fallback: number): number {
  return typeof value === 'number' ? value : fallback
}

function jsonEquals(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (left === right) return true
  if (left === null || right === null || left === undefined || right === undefined) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonEquals(value, right[index]))
    )
  }
  if (typeof left !== 'object' || typeof right !== 'object') return false
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && jsonEquals(left[key], right[key]))
  )
}

// chat_containsが見る「最近」の範囲。tick間隔よりずっと長く、雑談全体よりは短く
const RECENT_CHAT_WINDOW_MS = 15_000

export function registerBuiltinConditions(): void {
  registerCondition('mentioned', (ctx) => ctx.inbox.peekMention() !== undefined, {
    description: 'ボット宛てのチャットメンションまたは認識音声が届いている',
  })

  registerCondition(
    'user_nearby',
    (ctx, params) => {
      const range = asNumber(params.range, 3)
      const distance = ctx.bb.get('nearestUserDistance')
      return typeof distance === 'number' && distance <= range
    },
    {
      params: { range: { type: 'number', description: '距離（メートル）。省略時3' } },
      description: '指定距離以内にユーザーがいる',
    },
  )

  registerCondition('is_alone', (ctx) => asNumber(ctx.bb.get('userCount'), 0) === 0, {
    description: 'ルームに自分以外のユーザーがいない',
  })

  registerCondition('anyone_in_room', (ctx) => asNumber(ctx.bb.get('userCount'), 0) >= 1, {
    description: 'ルームに自分以外のユーザーが1人以上いる',
  })

  registerCondition(
    'user_count',
    (ctx, params) => asNumber(ctx.bb.get('userCount'), 0) >= asNumber(params.min, 1),
    {
      params: { min: { type: 'number', required: true, description: 'この人数以上でSUCCESS' } },
      description: 'ルームのユーザー数が指定以上',
    },
  )

  registerCondition(
    'chat_contains',
    (ctx, params) => {
      const word = typeof params.word === 'string' ? params.word : ''
      if (word === '') return false
      return ctx.inbox
        .recentChat()
        .some((line) => ctx.now - line.atMs <= RECENT_CHAT_WINDOW_MS && line.text.includes(word))
    },
    {
      params: { word: { type: 'string', required: true, description: '探す語句' } },
      description: '直近15秒のチャットに語句が含まれる',
    },
  )

  // 成功した瞬間に時計をリセットする、ゲート型のクールダウン条件。
  // 同じkeyを共有すれば複数の分岐で1つの時計を共有できる
  registerCondition(
    'cooldown',
    (ctx, params) => {
      const key = typeof params.key === 'string' ? params.key : 'default'
      const sec = asNumber(params.sec, 30)
      const bbKey = `cooldown:${key}`
      const last = asNumber(ctx.bb.get(bbKey), Number.NEGATIVE_INFINITY)
      if (ctx.now - last < sec * 1000) return false
      ctx.bb.set(bbKey, ctx.now)
      return true
    },
    {
      params: {
        sec: { type: 'number', required: true, description: '間隔（秒）' },
        key: { type: 'string', description: '時計の名前。省略時default' },
      },
      description: '前回成功から指定秒数が経っていればSUCCESSし、時計をリセットする',
    },
  )

  registerCondition('random_chance', (_ctx, params) => Math.random() < asNumber(params.p, 0.5), {
    params: { p: { type: 'number', required: true, description: '成功確率（0から1）' } },
    description: '指定確率でSUCCESSする',
  })

  registerCondition(
    'blackboard_equals',
    (ctx, params) => {
      const key = typeof params.key === 'string' ? params.key : ''
      return jsonEquals(ctx.bb.get(key), params.value)
    },
    {
      params: {
        key: { type: 'string', required: true, description: 'blackboardのキー' },
        value: { type: 'json', required: true, description: '比較する値' },
      },
      description: 'blackboardの値が指定値と等しい',
    },
  )

  registerCondition(
    'time_elapsed',
    (ctx, params) => {
      const startedAt = asNumber(ctx.bb.get('startedAtMs'), ctx.now)
      return ctx.now - startedAt >= asNumber(params.sec, 0) * 1000
    },
    {
      params: { sec: { type: 'number', required: true, description: '起動からの秒数' } },
      description: 'ボット起動から指定秒数が経過している',
    },
  )
}
