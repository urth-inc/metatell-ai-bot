import { registerAction } from '../engine/registry.js'
import type { JsonValue, Status, TickContext } from '../engine/types.js'

/**
 * LLM nodes: the "brain" parts of the tree.
 * The design principle of this template is that the LLM never drives the
 * avatar directly. It only produces text (llm_reply / llm_say) or picks a
 * branch (llm_choose); the verified engine executes everything else.
 */

// llm_sayの内部下限。cooldownを忘れたツリーでも連続自発発話はここで止まる
const LLM_SAY_FLOOR_MS = 30_000

function situationSnapshot(ctx: TickContext): string {
  const nearestName = ctx.bb.get('nearestUserName')
  const userCount = ctx.bb.get('userCount')
  const chat = ctx.inbox
    .recentChat()
    .slice(-5)
    .map((line) => `${line.fromName}: ${line.text}`)
    .join('\n')
  return [
    `ルームにいる人数（自分以外）: ${typeof userCount === 'number' ? userCount : 0}`,
    typeof nearestName === 'string' ? `いちばん近くにいる人: ${nearestName}` : '',
    chat === '' ? '' : `直近のチャット:\n${chat}`,
  ]
    .filter((part) => part !== '')
    .join('\n')
}

export function registerLlmActions(): void {
  registerAction(
    'llm_reply',
    async (ctx): Promise<Status> => {
      const mention = ctx.inbox.takeMention()
      if (!mention) return 'FAILURE'
      if (!ctx.api.llm) {
        ctx.api.log('llm_reply: LLM_API_KEYが未設定のためスキップします')
        return 'FAILURE'
      }
      const answer = await ctx.api.llm.complete({
        system: `${ctx.api.persona}\n\nあなたの名前は${ctx.api.botName}です。メンションに1、2文で返事してください。`,
        user: `${mention.fromName}さんからのメッセージ: ${mention.text}\n\n${situationSnapshot(ctx)}`,
      })
      return (await mention.reply(answer)) ? 'SUCCESS' : 'FAILURE'
    },
    {
      description:
        'ボット宛てメンションにペルソナに沿った返事をする（mentioned条件とセットで使う）',
    },
  )

  registerAction(
    'llm_say',
    async (ctx, params): Promise<Status> => {
      if (!ctx.api.llm) {
        ctx.api.log('llm_say: LLM_API_KEYが未設定のためスキップします')
        return 'FAILURE'
      }
      const last = ctx.bb.get('llmSay:lastMs')
      if (typeof last === 'number' && ctx.now - last < LLM_SAY_FLOOR_MS) return 'FAILURE'
      ctx.bb.set('llmSay:lastMs', ctx.now)
      const topic = typeof params.topic === 'string' ? `\n話題のヒント: ${params.topic}` : ''
      const utterance = await ctx.api.llm.complete({
        system: `${ctx.api.persona}\n\nあなたの名前は${ctx.api.botName}です。いまの状況を見て、自発的なひとことを1文だけ発してください。`,
        user: `${situationSnapshot(ctx)}${topic}`,
      })
      return (await ctx.api.say(utterance)) ? 'SUCCESS' : 'FAILURE'
    },
    {
      params: { topic: { type: 'string', description: '話題のヒント（任意）' } },
      description: '状況を見て自発的にひとこと話す（必ずcooldownの中に置く）',
    },
  )

  registerAction(
    'llm_choose',
    async (ctx, params): Promise<Status> => {
      if (!ctx.api.llm) {
        ctx.api.log('llm_choose: LLM_API_KEYが未設定のためスキップします')
        return 'FAILURE'
      }
      const rawChoices: JsonValue | undefined = params.choices
      const choices = Array.isArray(rawChoices)
        ? rawChoices.filter((choice): choice is string => typeof choice === 'string')
        : []
      if (choices.length < 2) {
        ctx.api.log('llm_choose: params.choicesには2つ以上の文字列が必要です')
        return 'FAILURE'
      }
      const key = typeof params.key === 'string' ? params.key : 'choice'
      const question =
        typeof params.question === 'string'
          ? params.question
          : 'いまの気分に合うものを選んでください'
      const index = await ctx.api.llm.choose({
        system: `${ctx.api.persona}\n\nあなたの名前は${ctx.api.botName}です。`,
        user: `${question}\n\n${situationSnapshot(ctx)}`,
        choices,
      })
      ctx.bb.set(key, choices[index])
      ctx.api.log(`llm_choose: 「${choices[index]}」を選びました（blackboard.${key}）`)
      return 'SUCCESS'
    },
    {
      params: {
        choices: { type: 'json', required: true, description: '選択肢の文字列配列' },
        key: { type: 'string', description: '結果を書くblackboardキー。省略時choice' },
        question: { type: 'string', description: 'LLMへの質問文（任意）' },
      },
      description:
        'LLMに選択肢から1つ選ばせ、結果をblackboardに書く（blackboard_equalsで分岐する）',
    },
  )
}
