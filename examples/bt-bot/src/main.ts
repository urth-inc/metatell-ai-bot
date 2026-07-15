#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createMetatellClient } from '@metatell/bot-sdk'
import { loadBotConfig, loadPersona } from './config.js'
import { createBlackboard } from './engine/blackboard.js'
import { buildTree, tickTree } from './engine/engine.js'
import type { BotApi, BTNode, JsonValue, TickContext, TraceEntry } from './engine/types.js'
import { asTreeDef, validateTreeDoc } from './engine/validate.js'
import { envFlag, envString, loadDotEnv } from './env.js'
import { createShutdownController, watchFileChanges } from './lifecycle.js'
import { createLlmApi } from './llm.js'
import { registerBuiltins } from './nodes/index.js'
import {
  clampToBounds,
  createSafeSpeaker,
  KILL_COMMAND,
  stepTowards,
  truncateSay,
} from './safety.js'
import { createSensors } from './sensors.js'

const ROOT_DIR = process.cwd()
const MY_BOT_DIR = path.join(ROOT_DIR, 'my-bot')
const TREE_PATH = path.join(MY_BOT_DIR, 'tree.json')

const log = (message: string): void => {
  console.log(`[bt-bot] ${message}`)
}

function loadTreeOrExplain(): JsonValue | null {
  let doc: JsonValue
  try {
    doc = JSON.parse(fs.readFileSync(TREE_PATH, 'utf8')) as JsonValue
  } catch (error) {
    log(`tree.jsonが読めません: ${String(error)}`)
    log('詳しい場所つきのエラーは pnpm check で確認できます')
    return null
  }
  const issues = validateTreeDoc(doc)
  for (const issue of issues.filter((entry) => entry.level === 'warning')) {
    log(`警告: ${issue.path.join('.')}: ${issue.message}`)
  }
  const errors = issues.filter((entry) => entry.level === 'error')
  if (errors.length > 0) {
    for (const issue of errors) log(`エラー: ${issue.path.join('.')}: ${issue.message}`)
    log('詳しい場所つきのエラーは pnpm check で確認できます')
    return null
  }
  return doc
}

// tick可視化: RUNNINGは黄、SUCCESSは緑、FAILUREは灰で実行経路を表示する
function formatTrace(trace: TraceEntry[]): string {
  const colors = { RUNNING: '\x1b[33m', SUCCESS: '\x1b[32m', FAILURE: '\x1b[90m' }
  return trace
    .map(
      (entry) =>
        `${'  '.repeat(entry.depth)}${colors[entry.status]}${entry.label} [${entry.status}]\x1b[0m`,
    )
    .join('\n')
}

async function main(): Promise<void> {
  loadDotEnv(ROOT_DIR)

  const config = loadBotConfig(MY_BOT_DIR)
  const persona = loadPersona(MY_BOT_DIR)

  registerBuiltins()
  // 上級課題の拡張ノード。importの副作用でregisterAction/registerConditionが走る
  await import('../my-bot/custom-nodes.js')

  const initialDoc = loadTreeOrExplain()
  if (initialDoc === null) process.exit(1)
  let root: BTNode = buildTree(asTreeDef(initialDoc))

  const roomUrl = process.argv[2] ?? envString('METATELL_ROOM_URL')
  if (roomUrl === '') {
    log('使い方: pnpm dev -- <metatell-room-url>（または.envのMETATELL_ROOM_URL）')
    process.exit(1)
  }
  const urlObj = new URL(roomUrl)
  const roomId = urlObj.pathname.split('/')[1] ?? ''
  if (roomId === '') {
    log(`ルームIDがURLから見つかりません: ${roomUrl}`)
    process.exit(1)
  }

  const unsafeMode = envFlag('UNSAFE_MODE')
  if (unsafeMode) {
    log('警告: UNSAFE_MODEが有効です。LLMガードなしの実験用モードです')
  }
  const llmApiKey = envString('LLM_API_KEY')
  const llmBaseUrl = envString('LLM_BASE_URL')
  const llm =
    llmApiKey === '' || llmBaseUrl === ''
      ? null
      : createLlmApi({
          baseUrl: llmBaseUrl,
          apiKey: llmApiKey,
          model: envString('LLM_MODEL', 'gemini-flash-lite-latest'),
          guarded: !unsafeMode,
        })
  if (!llm) {
    log('LLM_API_KEYとLLM_BASE_URLが未設定のため、llm_reply / llm_say / llm_chooseは動きません')
  }

  const operatorSessionIds = envString('OPERATOR_SESSION_IDS')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '')
  if (operatorSessionIds.length === 0) {
    log('OPERATOR_SESSION_IDSが未設定のため、リモートキルスイッチ（/killall）は無効です')
  }

  const client = createMetatellClient({
    serverUrl: `wss://${urlObj.host}`,
    roomId,
    authToken: envString('METATELL_AUTH_TOKEN') || undefined,
    username: config.name,
    debug: envFlag('DEBUG'),
  })

  await client.connect()
  log(`接続しました: ルーム=${roomId} 名前=${config.name}`)

  // 使えるアニメーションはアバターごとに違うため、実機の一覧を取得して照合する
  let animations: Awaited<ReturnType<typeof client.avatar.getAvailableAnimations>> = []
  try {
    animations = await client.avatar.getAvailableAnimations()
    log(
      `利用可能なアニメーション: ${animations
        .map((entry) =>
          entry.name && entry.name !== entry.id ? `${entry.name}(${entry.id})` : entry.id,
        )
        .join(', ')}`,
    )
  } catch (error) {
    log(`アニメーション一覧を取得できませんでした: ${String(error)}`)
  }

  const speaker = createSafeSpeaker(log)
  const bb = createBlackboard()
  bb.set('startedAtMs', Date.now())
  const shutdownController = createShutdownController({
    disconnect: () => client.disconnect(),
    exit: (code) => process.exit(code),
    log,
  })

  // BotApi: ノードが世界に触る唯一の窓口。安全装置はこの内側にある
  let walking = false
  // 未割り当てのemoteの案内はtickごとに繰り返さず1回だけ出す
  const warnedEmotes = new Set<string>()
  const setWalking = (next: boolean): void => {
    if (walking === next) return
    walking = next
    client.avatar.play({ id: next ? 'walking' : 'idle', loop: true }).catch(() => {})
  }

  const api: BotApi = {
    botName: config.name,
    persona,
    llm,
    log,
    say: (text) => speaker.trySend(() => client.chat.send(truncateSay(text)), text),
    moveTowards(target) {
      const from = client.avatar.getPosition()
      if (!from) return 'moving'
      const clamped = clampToBounds(target)
      const { next, arrived } = stepTowards(from, clamped, config.tickMs)
      if (arrived) {
        setWalking(false)
        return 'arrived'
      }
      setWalking(true)
      client.avatar.lookAt(clamped).catch(() => {})
      client.avatar.moveTo(next).catch((error) => log(`moveToに失敗: ${String(error)}`))
      return 'moving'
    },
    lookAt(target) {
      client.avatar.lookAt(clampToBounds(target)).catch(() => {})
    },
    async emote(animation) {
      const target = config.emotes[animation] ?? animation
      const found = animations.find((entry) => entry.id === target || entry.name === target)
      // 一覧が取れなかった環境でも、SDK標準のidle/walkingは通す
      const id = found?.id ?? (target === 'idle' || target === 'walking' ? target : undefined)
      if (id === undefined) {
        if (!warnedEmotes.has(animation)) {
          warnedEmotes.add(animation)
          log(
            `emote「${animation}」に対応するアニメーションがないためスキップします。` +
              'bot.config.jsonの「emotes」に、起動時ログに出た利用可能なIDを割り当ててください',
          )
        }
        return 'skipped'
      }
      walking = false
      try {
        await client.avatar.play({ id, loop: false })
        return 'played'
      } catch (error) {
        log(`アニメーション「${animation}」(${id})を再生できませんでした: ${String(error)}`)
        return 'failed'
      }
    },
    patrolTarget: (index) => config.patrol[index],
    patrolLength: () => config.patrol.length,
    expand(text) {
      const nearestName = bb.get('nearestUserName')
      return text
        .replaceAll('{greeting}', config.greeting)
        .replaceAll('{botName}', config.name)
        .replaceAll('{userName}', typeof nearestName === 'string' ? nearestName : 'みなさん')
    },
  }

  const sensors = createSensors({
    client,
    botName: config.name,
    allowBotPerception: envFlag('ALLOW_BOT_PERCEPTION'),
    operatorSessionIds,
    speaker,
    onKill: (byName) =>
      void shutdownController.shutdown(`キルスイッチ（${byName}さんの${KILL_COMMAND}）`),
    log,
  })

  // tree.jsonのホットリロード: 検証を通過したときだけ差し替える
  const treeWatcher = watchFileChanges(
    TREE_PATH,
    () => {
      const doc = loadTreeOrExplain()
      if (doc === null) {
        log('tree.jsonの変更にエラーがあるため、直前のツリーで動き続けます')
        return
      }
      root = buildTree(asTreeDef(doc))
      log('tree.jsonを再読み込みしました')
    },
    (error) => log(`tree.jsonの監視に失敗しました: ${String(error)}`),
  )
  shutdownController.addCleanup(() => treeWatcher.close())

  const traceEnabled = process.env.BT_TRACE !== '0'
  let lastTraceText = ''
  const tickTimer = setInterval(() => {
    const now = Date.now()
    sensors.snapshot(bb, now)
    const ctx: TickContext = { bb, inbox: sensors.inbox, api, now, trace: [] }
    tickTree(root, ctx)
    if (traceEnabled) {
      const traceText = formatTrace(ctx.trace)
      // 毎tick出すと洪水になるため、実行経路が変わったときだけ表示する
      if (traceText !== lastTraceText) {
        lastTraceText = traceText
        console.log(`\n--- tick ---\n${traceText}`)
      }
    }
  }, config.tickMs)
  shutdownController.addCleanup(() => clearInterval(tickTimer))

  process.on('SIGINT', () => void shutdownController.shutdown('Ctrl+C'))
  process.on('SIGTERM', () => void shutdownController.shutdown('SIGTERM'))
  process.on('unhandledRejection', (reason) => {
    log(`未処理のPromise拒否: ${String(reason)}`)
  })
}

main().catch((error) => {
  console.error(`[bt-bot] 起動に失敗しました: ${String(error)}`)
  process.exit(1)
})
