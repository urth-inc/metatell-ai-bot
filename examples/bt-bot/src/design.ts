#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { loadBotConfig } from './config.js'
import { actionNames, conditionNames, getAction, getCondition } from './engine/registry.js'
import type { JsonValue, ParamSpec } from './engine/types.js'
import { validateTreeDoc } from './engine/validate.js'
import { envString, loadDotEnv } from './env.js'
import { createLlmApi, parseJsonLoose } from './llm.js'
import { registerBuiltins } from './nodes/index.js'

/**
 * `pnpm design -- "日本語の指示"`: generates tree.json from a natural
 * language instruction with the LLM.
 *
 * Design principle (plan/execute separation): this is an owner command run
 * from the terminal, not a tree node. The LLM produces a plan (tree.json),
 * the plan is schema-validated, and only then does the verified engine
 * execute it. The LLM never drives the avatar directly at runtime.
 */

const MAX_ATTEMPTS = 3

function paramsSignature(spec: ParamSpec): string {
  const parts = Object.entries(spec).map(
    ([key, rule]) => `${key}${rule.required ? '' : '?'}: ${rule.type}`,
  )
  return parts.length === 0 ? '' : `(${parts.join(', ')})`
}

function catalogText(): string {
  const conditions = conditionNames().map((name) => {
    const spec = getCondition(name)
    return `- ${name}${paramsSignature(spec?.paramSpec ?? {})}: ${spec?.description ?? ''}`
  })
  const actions = actionNames().map((name) => {
    const spec = getAction(name)
    return `- ${name}${paramsSignature(spec?.paramSpec ?? {})}: ${spec?.description ?? ''}`
  })
  return `条件ノード（"type": "condition"で使う）:\n${conditions.join('\n')}\n\n行動ノード（"type": "action"で使う）:\n${actions.join('\n')}`
}

const STRUCTURE_RULES = `ツリーの構造ルール:
- 出力は {"root": <ノード>} のJSONオブジェクトのみ。説明文は書かない。
- ノード種別: sequence / selector（"children": [...]が必要）、
  inverter / cooldown / repeat（"child": {...}が必要）、
  condition / action（"name"と任意の"params"が必要）。
- selectorは上の子から順に試し、最初にSUCCESSした子で止まる。優先度の高い行動を上に書く。
- sequenceは子を順に全部実行し、どれかがFAILUREなら止まる。
- 繰り返し発言する分岐には必ずcooldown（"params": {"sec": 秒}）をかける。
- llm_sayは必ずcooldownの中に置く。`

const FEW_SHOT = `例: 「近づいた人に手を振って挨拶して、呼ばれたら返事して、暇なときは巡回して」
{"root": {"type": "selector", "children": [
  {"type": "sequence", "children": [
    {"type": "condition", "name": "mentioned"},
    {"type": "action", "name": "llm_reply"}]},
  {"type": "sequence", "children": [
    {"type": "condition", "name": "user_nearby", "params": {"range": 3}},
    {"type": "condition", "name": "cooldown", "params": {"sec": 30, "key": "greet"}},
    {"type": "action", "name": "emote", "params": {"animation": "wave"}},
    {"type": "action", "name": "say", "params": {"text": "{greeting}"}}]},
  {"type": "action", "name": "patrol_next"}]}}`

async function main(): Promise<void> {
  loadDotEnv(process.cwd())
  const instruction = process.argv.slice(2).join(' ').trim()
  if (instruction === '') {
    console.error('使い方: pnpm design -- "ボットにさせたいことを日本語で"')
    process.exit(1)
  }
  const apiKey = envString('LLM_API_KEY')
  const baseUrl = envString('LLM_BASE_URL')
  if (apiKey === '' || baseUrl === '') {
    console.error('LLM_API_KEYとLLM_BASE_URLを設定してください（.envを確認してください）')
    process.exit(1)
  }

  registerBuiltins()
  await import('../my-bot/custom-nodes.js')

  const config = loadBotConfig(path.join(process.cwd(), 'my-bot'))
  const points = config.patrol
    .map(
      (point) =>
        `- ${point.label}: x=${point.position.x}, y=${point.position.y}, z=${point.position.z}`,
    )
    .join('\n')

  // 生成はオーナーのコマンドなので、チャット向けガード（120文字制限など）は使わない
  const llm = createLlmApi({
    baseUrl,
    apiKey,
    model: envString('LLM_MODEL', 'gemini-flash-lite-latest'),
    guarded: false,
  })

  const system = [
    'あなたはメタバースボットのビヘイビアツリー設計アシスタントです。',
    '指示文から、次の仕様に厳密に従うtree.jsonを生成してください。',
    '',
    STRUCTURE_RULES,
    '',
    catalogText(),
    '',
    points === '' ? '' : `ルームの地点対応表（move_toで使える座標）:\n${points}`,
    '',
    FEW_SHOT,
  ].join('\n')

  let feedback = ''
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    console.log(`生成中です（${attempt}回目）...`)
    const answer = await llm.complete({
      system,
      user: feedback === '' ? instruction : `${instruction}\n\n前回の出力の問題点:\n${feedback}`,
    })

    let doc: JsonValue
    try {
      doc = parseJsonLoose(answer)
    } catch {
      feedback = 'JSONとして解釈できませんでした。JSONオブジェクトだけを出力してください。'
      continue
    }
    const issues = validateTreeDoc(doc)
    const errors = issues.filter((issue) => issue.level === 'error')
    if (errors.length > 0) {
      feedback = errors.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n')
      continue
    }
    const warnings = issues.filter((issue) => issue.level === 'warning')

    const treePath = path.join(process.cwd(), 'my-bot', 'tree.json')
    if (fs.existsSync(treePath)) {
      fs.copyFileSync(treePath, path.join(process.cwd(), 'my-bot', 'tree.backup.json'))
    }
    const output =
      typeof doc === 'object' && doc !== null && !Array.isArray(doc)
        ? { $schema: '../schemas/tree.schema.json', ...doc }
        : doc
    fs.writeFileSync(treePath, `${JSON.stringify(output, null, 2)}\n`)
    console.log('検証を通過したツリーをmy-bot/tree.jsonに保存しました')
    if (warnings.length > 0) {
      console.warn(
        `警告:\n${warnings.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n')}`,
      )
    }
    console.log('（元のツリーはmy-bot/tree.backup.jsonに退避しました）')
    console.log('ボットが起動中なら、数秒以内にホットリロードされます')
    return
  }

  console.error(
    `検証を${MAX_ATTEMPTS}回とも通過できませんでした。指示文をもう少し具体的にしてください`,
  )
  console.error(`最後のエラー:\n${feedback}`)
  process.exit(1)
}

main().catch((error) => {
  console.error(String(error))
  process.exit(1)
})
