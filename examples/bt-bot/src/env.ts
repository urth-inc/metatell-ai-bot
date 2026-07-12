import fs from 'node:fs'
import path from 'node:path'

/**
 * Tiny .env loader. Dependency-free so the example ships
 * without node_modules beyond the SDK itself.
 * Existing process.env values always win.
 */
export function loadDotEnv(dir: string): void {
  const file = path.join(dir, '.env')
  if (!fs.existsSync(file)) return
  for (const rawLine of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

export function envString(key: string, fallback = ''): string {
  const value = process.env[key]
  return value === undefined || value === '' ? fallback : value
}

export function envFlag(key: string): boolean {
  const value = process.env[key]
  return value === '1' || value === 'true'
}
