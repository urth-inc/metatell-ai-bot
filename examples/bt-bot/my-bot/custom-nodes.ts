import { registerAction, registerCondition } from '../src/engine/registry.js'
import type { JsonObject, JsonValue, Status, Vec3 } from '../src/engine/types.js'

/**
 * Advanced tier: register your own nodes here and reference them from
 * tree.json by name. This is the only TypeScript file you need to edit.
 *
 * - registerCondition(name, fn): fn returns true / false.
 * - registerAction(name, fn): fn returns 'SUCCESS' | 'FAILURE' | 'RUNNING',
 *   or a Promise of one of them (the engine keeps the node RUNNING until
 *   the Promise settles).
 *
 * fn receives (ctx, params):
 * - ctx.bb: blackboard（センサーの知覚スナップショットと自由な読み書き）
 * - ctx.inbox: メンションとチャットの受信箱
 * - ctx.api: say / moveTowards / emote / llm などの行動API
 * - ctx.signal: 上位行動に割り込まれた非同期アクションを止めるAbortSignal
 * - params: tree.jsonのparamsに書いた値
 */

// 例1: いちばん近くの人が指定した名前かどうかを判定する条件ノード。
// tree.jsonでの使い方:
//   { "type": "condition", "name": "user_named", "params": { "name": "たろう" } }
registerCondition(
  'user_named',
  (ctx, params) => {
    const target = typeof params.name === 'string' ? params.name : ''
    return target !== '' && ctx.bb.get('nearestUserName') === target
  },
  {
    params: { name: { type: 'string', required: true, description: '探す人の名前' } },
    description: 'いちばん近くの人が指定した名前である',
  },
)

// 例2: おじぎしてから挨拶する行動ノード。
// tree.jsonでの使い方:
//   { "type": "action", "name": "bow" }
registerAction(
  'bow',
  async (ctx): Promise<Status> => {
    void ctx.api.emote('greet')
    return (await ctx.api.say(ctx.api.expand('{userName}さん、いらっしゃいませ！')))
      ? 'SUCCESS'
      : 'FAILURE'
  },
  {
    description: 'おじぎしてから挨拶する',
  },
)

const MAX_REMEMBERED_USERS = 1_000

function userPosition(value: JsonValue | undefined): Vec3 | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record: JsonObject = value
  const { x, y, z } = record
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return undefined
  return { x, y, z }
}

// 例3: 会った人をセッションIDで記憶し、2回目以降は別の挨拶をする。
// tree.jsonでの使い方:
//   { "type": "action", "name": "greet_user",
//     "params": { "repeatText": "また会ったね、{userName}さん！" } }
registerAction(
  'greet_user',
  async (ctx, params): Promise<Status> => {
    const userId = ctx.bb.get('nearestUserId')
    const target = userPosition(ctx.bb.get('nearestUser'))
    if (typeof userId !== 'string' || userId === '' || !target) return 'FAILURE'

    const rememberedValue = ctx.bb.get('greetedUserIds')
    const remembered = Array.isArray(rememberedValue)
      ? rememberedValue.filter((id): id is string => typeof id === 'string')
      : []
    const metBefore = remembered.includes(userId)
    const repeatText =
      typeof params.repeatText === 'string' && params.repeatText !== ''
        ? params.repeatText
        : 'また会ったね、{userName}さん！'
    const text = ctx.api.expand(metBefore ? repeatText : '{greeting}')
    const animation =
      typeof params.animation === 'string' && params.animation !== '' ? params.animation : 'greet'

    // 非同期の演出中に最寄りユーザーが変わっても、開始時の対象へ挨拶する。
    ctx.api.lookAt(target)
    // アニメーションは補助演出なので、失敗してもチャット・音声の挨拶は続ける。
    await ctx.api.emote(animation)
    if (ctx.signal?.aborted) return 'FAILURE'
    if (!(await ctx.api.say(text))) return 'FAILURE'
    if (!metBefore) {
      ctx.bb.set('greetedUserIds', [...remembered, userId].slice(-MAX_REMEMBERED_USERS))
    }
    return 'SUCCESS'
  },
  {
    params: {
      repeatText: {
        type: 'string',
        description: '2回目以降の挨拶。{userName}と{botName}が使える',
      },
      animation: {
        type: 'string',
        description: '挨拶時に再生するemotesの別名。省略時greet',
      },
    },
    description: '対象を向いて演出し、初対面か再会かで挨拶を切り替えて記憶する',
  },
)

// ここから下に自分のノードを追加していく。アイデア例:
// - クイズの正解数をctx.bbに記録して発表する行動
// - ctx.api.llmを使って、許可した行動だけをLLMに計画させる行動
