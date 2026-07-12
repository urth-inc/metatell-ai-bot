#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { JsonSyntaxError, lineAt, parseJsonWithLines } from './engine/json-lines.js'
import type { JsonValue } from './engine/types.js'
import { validateTreeDoc } from './engine/validate.js'
import { registerBuiltins } from './nodes/index.js'

/**
 * `pnpm check`: validates a tree.json and prints Japanese errors with
 * line numbers, so users can fix files without reading stack traces.
 */

function countNodes(doc: JsonValue): number {
  if (Array.isArray(doc)) return doc.reduce((sum: number, entry) => sum + countNodes(entry), 0)
  if (typeof doc === 'object' && doc !== null) {
    const self = typeof doc.type === 'string' ? 1 : 0
    return (
      self + Object.values(doc).reduce((sum: number, entry) => sum + countNodes(entry ?? null), 0)
    )
  }
  return 0
}

async function main(): Promise<void> {
  const target = path.resolve(process.argv[2] ?? path.join('my-bot', 'tree.json'))
  if (!fs.existsSync(target)) {
    console.error(`ファイルが見つかりません: ${target}`)
    process.exit(1)
  }

  // カスタムノードも登録してから検証する（名前の存在チェックのため）
  registerBuiltins()
  try {
    await import('../my-bot/custom-nodes.js')
  } catch (error) {
    console.error(`custom-nodes.tsの読み込みに失敗しました: ${String(error)}`)
    process.exit(1)
  }

  const text = fs.readFileSync(target, 'utf8')
  let located: ReturnType<typeof parseJsonWithLines>
  try {
    located = parseJsonWithLines(text)
  } catch (error) {
    if (error instanceof JsonSyntaxError) {
      console.error(`${path.basename(target)} ${error.line}行目: ${error.message}`)
      console.error('JSONの構文エラーです。カンマや閉じ括弧を確認してください')
      process.exit(1)
    }
    throw error
  }

  const issues = validateTreeDoc(located.value)
  const errors = issues.filter((issue) => issue.level === 'error')
  const warnings = issues.filter((issue) => issue.level === 'warning')

  for (const issue of errors) {
    console.error(
      `${issue.path.length === 0 ? 1 : lineAt(located, issue.path)}行目: ${issue.message}`,
    )
  }
  for (const issue of warnings) {
    console.warn(`警告 ${lineAt(located, issue.path)}行目: ${issue.message}`)
  }

  if (errors.length > 0) {
    console.error(`\nエラーが${errors.length}件あります: ${target}`)
    process.exit(1)
  }
  console.log(
    `OK: ツリーは有効です（ノード数${countNodes(located.value)}、警告${warnings.length}件）: ${target}`,
  )
}

main().catch((error) => {
  console.error(String(error))
  process.exit(1)
})
