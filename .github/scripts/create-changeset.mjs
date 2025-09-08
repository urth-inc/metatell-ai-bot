import { execSync } from 'node:child_process'
import crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const cwd = process.cwd()

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] })
    .toString()
    .trim()
}

function trySh(cmd) {
  try {
    return sh(cmd)
  } catch {
    return null
  }
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true })
}

function uniqueName() {
  const now = new Date().toISOString().replace(/[:.]/g, '-')
  const rand = crypto.randomBytes(4).toString('hex')
  return `${now}-${rand}`
}

// --- Input validation ---
const BUMP = process.env.BUMP
const ALLOWED = new Set(['patch', 'minor', 'major'])
if (!ALLOWED.has(BUMP)) {
  console.error(`BUMP must be one of: patch | minor | major. Got: ${BUMP}`)
  process.exit(1)
}

// --- Determine range (latest tag .. HEAD) ---
let fromRef = trySh('git describe --tags --abbrev=0')
if (!fromRef) {
  // タグが無い場合は初回コミットから
  fromRef = sh('git rev-list --max-parents=0 HEAD')
}

const range = `${fromRef}..HEAD`

// --- Collect commit subjects ---
const rawSubjects = trySh(`git log ${range} --pretty=%s`)
const subjects = (rawSubjects ? rawSubjects.split('\n') : []).map((s) => s.trim()).filter(Boolean)

// コミットが無ければ無駄な version PR を避ける
if (subjects.length === 0) {
  console.error(`No commits found in range ${range}. Abort generating changeset.`)
  process.exit(1)
}

// --- Resolve target packages ---
// 仕様では pnpm -r ls --json から @metatell/bot-* を抽出。
// PNPM の出力形態差異に備え、失敗時は packages/ 配下をフォールバック探索。
function parsePnpmLsJson(text) {
  // 1) 単一の JSON（配列 or オブジェクト）
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    // 2) 改行区切りの JSON Lines
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const out = []
    for (const line of lines) {
      try {
        out.push(JSON.parse(line))
      } catch {
        // skip
      }
    }
    return out
  }
}

async function discoverPackagesViaFs() {
  const base = path.join(cwd, 'packages')
  const out = []
  async function walk(dir) {
    let entries = []
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        // package.json がある階層を対象
        const pkgJson = path.join(p, 'package.json')
        try {
          const buf = await fs.readFile(pkgJson, 'utf8')
          const pkg = JSON.parse(buf)
          out.push({ name: pkg.name, private: !!pkg.private, dir: p })
        } catch {
          // 再帰継続
          await walk(p)
        }
      }
    }
  }
  await walk(base)
  return out
}

async function getWorkspacePackages() {
  const out = []
  const raw = trySh('pnpm -r ls --json')
  if (raw) {
    const nodes = parsePnpmLsJson(raw)
    for (const n of nodes) {
      // pnpm ls の形はバージョン差異あり。name/private が取れない場合があるため防御的に。
      const name = n?.name ?? n?.manifest?.name
      const isPrivate = Boolean(n?.private ?? n?.manifest?.private)
      if (name) out.push({ name, private: isPrivate })
    }
  }
  if (out.length > 0) return out

  // フォールバック：packages/ を走査
  return await discoverPackagesViaFs()
}

const allPkgs = await getWorkspacePackages()

// 指定パターン & 非private の公開対象
const targetPkgs = allPkgs
  .filter((p) => typeof p.name === 'string')
  .filter((p) => /^@metatell\/bot-/.test(p.name))
  .filter((p) => p.private !== true)
  .map((p) => p.name)
  .sort()

// 対象パッケージが無ければ中止
if (targetPkgs.length === 0) {
  console.error('No target packages matched (@metatell/bot-*) or all are private.')
  process.exit(1)
}

// --- Build changeset content ---
const frontmatterLines = targetPkgs.map((name) => `"${name}": ${BUMP}`).join('\n')
const bodyLines = subjects.map((s) => `- ${s}`).join('\n')

const content = `---\n${frontmatterLines}\n---\n\n${bodyLines}\n`

// --- Write file ---
const outDir = path.join(cwd, '.changeset')
await ensureDir(outDir)
const file = path.join(outDir, `${uniqueName()}.md`)
await fs.writeFile(file, content, 'utf8')

console.log(`Created changeset: ${file}`)
