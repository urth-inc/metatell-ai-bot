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

const BUMP = process.env.BUMP
const ALLOWED = new Set(['patch', 'minor', 'major'])
if (!ALLOWED.has(BUMP)) {
  console.error(`BUMP must be one of: patch | minor | major. Got: ${BUMP}`)
  process.exit(1)
}

let fromRef = trySh('git describe --tags --abbrev=0')
if (!fromRef) {
  fromRef = sh('git rev-list --max-parents=0 HEAD')
}

const range = `${fromRef}..HEAD`

const rawSubjects = trySh(`git log ${range} --pretty=%s`)
const subjects = (rawSubjects ? rawSubjects.split('\n') : []).map((s) => s.trim()).filter(Boolean)

if (subjects.length === 0) {
  console.error(`No commits found in range ${range}. Abort generating changeset.`)
  process.exit(1)
}

function parsePnpmLsJson(text) {
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
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
        const pkgJson = path.join(p, 'package.json')
        try {
          const buf = await fs.readFile(pkgJson, 'utf8')
          const pkg = JSON.parse(buf)
          out.push({ name: pkg.name, private: !!pkg.private, dir: p })
        } catch {
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
      const name = n?.name ?? n?.manifest?.name
      const isPrivate = Boolean(n?.private ?? n?.manifest?.private)
      if (name) out.push({ name, private: isPrivate })
    }
  }
  if (out.length > 0) return out

  return await discoverPackagesViaFs()
}

const allPkgs = await getWorkspacePackages()

const targetPkgs = allPkgs
  .filter((p) => typeof p.name === 'string')
  .filter((p) => /^@metatell\/bot-/.test(p.name))
  .filter((p) => p.private !== true)
  .map((p) => p.name)
  .sort()

if (targetPkgs.length === 0) {
  console.error('No target packages matched (@metatell/bot-*) or all are private.')
  process.exit(1)
}

const frontmatterLines = targetPkgs.map((name) => `"${name}": ${BUMP}`).join('\n')
const bodyLines = subjects.map((s) => `- ${s}`).join('\n')

const content = `---\n${frontmatterLines}\n---\n\n${bodyLines}\n`

const outDir = path.join(cwd, '.changeset')
await ensureDir(outDir)
const file = path.join(outDir, `${uniqueName()}.md`)
await fs.writeFile(file, content, 'utf8')

console.log(`Created changeset: ${file}`)
