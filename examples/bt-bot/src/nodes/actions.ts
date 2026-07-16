import { registerAction } from '../engine/registry.js'
import type { JsonObject, JsonValue, Status, Vec3 } from '../engine/types.js'

/**
 * Built-in action nodes.
 * Actions talk to the world only through ctx.api, which enforces the
 * safety guards (say interval, bounds clamp, speed cap).
 */

function asNumber(value: JsonValue | undefined, fallback: number): number {
  return typeof value === 'number' ? value : fallback
}

// センサーが書いたnearestUserスナップショットを座標として読み出す
function nearestUserPosition(value: JsonValue | undefined): Vec3 | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record: JsonObject = value
  const { x, y, z } = record
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return undefined
  return { x, y, z }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function registerBuiltinActions(): void {
  registerAction(
    'say',
    async (ctx, params): Promise<Status> => {
      const text = typeof params.text === 'string' ? params.text : ''
      if (text === '') return 'FAILURE'
      return (await ctx.api.say(ctx.api.expand(text))) ? 'SUCCESS' : 'FAILURE'
    },
    {
      params: {
        text: {
          type: 'string',
          required: true,
          description: '発言内容。{userName} {botName} {greeting}が使える',
        },
      },
      description: 'チャットで発言する',
    },
  )

  registerAction(
    'move_to',
    (ctx, params) => {
      const target = {
        x: asNumber(params.x, 0),
        y: asNumber(params.y, 0),
        z: asNumber(params.z, 0),
      }
      return ctx.api.moveTowards(target) === 'arrived' ? 'SUCCESS' : 'RUNNING'
    },
    {
      params: {
        x: { type: 'number', required: true },
        y: { type: 'number', required: true },
        z: { type: 'number', required: true },
      },
      description: '指定座標へ歩いて移動する（到着でSUCCESS）',
    },
  )

  registerAction(
    'patrol_next',
    (ctx) => {
      const total = ctx.api.patrolLength()
      if (total === 0) return 'FAILURE'
      const index = asNumber(ctx.bb.get('patrolIndex'), 0) % total
      const target = ctx.api.patrolTarget(index)
      if (!target) return 'FAILURE'
      if (ctx.api.moveTowards(target.position) === 'arrived') {
        ctx.bb.set('patrolIndex', (index + 1) % total)
        return 'SUCCESS'
      }
      return 'RUNNING'
    },
    {
      description: 'bot.config.jsonの巡回地点を順番に1つ進む（到着でSUCCESS）',
    },
  )

  registerAction(
    'move_to_user',
    (ctx) => {
      const target = nearestUserPosition(ctx.bb.get('nearestUser'))
      if (!target) return 'FAILURE'
      return ctx.api.moveTowards(target) === 'arrived' ? 'SUCCESS' : 'RUNNING'
    },
    {
      description: 'いちばん近くのユーザーのそばへ移動する（到着でSUCCESS）',
    },
  )

  registerAction(
    'look_at_user',
    (ctx) => {
      const target = nearestUserPosition(ctx.bb.get('nearestUser'))
      if (!target) return 'FAILURE'
      ctx.api.lookAt(target)
      return 'SUCCESS'
    },
    {
      description: 'いちばん近くのユーザーの方を向く',
    },
  )

  registerAction(
    'emote',
    async (ctx, params): Promise<Status> => {
      const animation = typeof params.animation === 'string' ? params.animation : ''
      if (animation === '') return 'FAILURE'
      return (await ctx.api.emote(animation)) === 'failed' ? 'FAILURE' : 'SUCCESS'
    },
    {
      params: {
        animation: {
          type: 'string',
          required: true,
          description:
            'bot.config.jsonのemotesで割り当てた別名、または起動時ログに出る利用可能なアニメーションのID/名前',
        },
      },
      description: 'アバターのアニメーションを再生する（未割り当ての別名はスキップして成功扱い）',
    },
  )

  registerAction(
    'emote_from_blackboard',
    async (ctx, params): Promise<Status> => {
      const key = typeof params.key === 'string' ? params.key : ''
      const animation = key === '' ? undefined : ctx.bb.get(key)
      if (typeof animation !== 'string' || animation === '') return 'FAILURE'
      return (await ctx.api.emote(animation)) === 'failed' ? 'FAILURE' : 'SUCCESS'
    },
    {
      params: {
        key: {
          type: 'string',
          required: true,
          description: '再生する別名またはアニメーションID/名前を読み出すblackboardキー',
        },
      },
      description:
        'llm_chooseなどがblackboardへ保存したアニメーションの別名またはID/名前を、同じkeyで読み出して再生する',
    },
  )

  registerAction(
    'wait',
    async (_ctx, params): Promise<Status> => {
      await sleep(asNumber(params.sec, 1) * 1000)
      return 'SUCCESS'
    },
    {
      params: { sec: { type: 'number', required: true, description: '待つ秒数' } },
      description: '指定秒数なにもせず待つ（待機中はRUNNING）',
    },
  )

  registerAction(
    'set_blackboard',
    (ctx, params) => {
      const key = typeof params.key === 'string' ? params.key : ''
      if (key === '' || params.value === undefined) return 'FAILURE'
      ctx.bb.set(key, params.value)
      return 'SUCCESS'
    },
    {
      params: {
        key: { type: 'string', required: true, description: '書き込むキー' },
        value: { type: 'json', required: true, description: '書き込む値' },
      },
      description: 'blackboardに値を書き込む',
    },
  )

  registerAction(
    'report_users',
    async (ctx): Promise<Status> => {
      const users = ctx.bb.get('users')
      const names = Array.isArray(users)
        ? users
            .map((user) =>
              typeof user === 'object' && user !== null && !Array.isArray(user) ? user.name : null,
            )
            .filter((name): name is string => typeof name === 'string')
        : []
      const text =
        names.length === 0
          ? 'いまルームには私しかいません'
          : `いまルームにいるのは${names.join('さん、')}さんです`
      return (await ctx.api.say(text)) ? 'SUCCESS' : 'FAILURE'
    },
    {
      description: 'ルームにいるユーザーの名前をチャットで報告する',
    },
  )
}
