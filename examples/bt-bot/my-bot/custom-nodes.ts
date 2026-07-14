import { registerAction, registerCondition } from '../src/engine/registry.js'
import type { Status } from '../src/engine/types.js'

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

// ここから下に自分のノードを追加していく。アイデア例:
// - 会った人をctx.bbに記憶して、2回目は別の挨拶をする条件と行動
// - クイズの正解数をctx.bbに記録して発表する行動
// - ctx.api.llmを使って、許可した行動だけをLLMに計画させる行動
