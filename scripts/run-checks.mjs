#!/usr/bin/env node
// Cross-platform runner for the Oxfmt + Oxlint "check" pipeline.
//
// Why this exists instead of a shell one-liner:
//   * No `sh -c`: `sh` is not guaranteed to exist (Windows/CI images), and the
//     previous script hard-coupled the whole toolchain to a POSIX shell.
//   * No nested quoting / `"$@"` forwarding: quoting rules differ between sh,
//     bash, cmd.exe and PowerShell, so paths with spaces or globs break subtly.
//   * No `&&` chaining or `shell: true`: ordering, exit-status and signal
//     handling become shell-dependent instead of explicit.
//
// Instead we resolve each tool's real bin from its package `bin` metadata and
// launch it with `node <bin>` so we never depend on Unix-only `node_modules/.bin`
// symlinks (Windows uses `.cmd`/`.ps1` shims). Commands run sequentially, stop on
// the first failure, and the terminating exit code or signal is propagated.

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

/**
 * Resolve the absolute path of a package's executable from its `bin` metadata,
 * rather than guessing `node_modules/.bin/<name>`.
 */
export function resolveBin(pkgName, binName = pkgName, req = require) {
  const pkgJsonPath = req.resolve(`${pkgName}/package.json`)
  const meta = req(pkgJsonPath)
  const relative = typeof meta.bin === 'string' ? meta.bin : meta.bin?.[binName]
  if (!relative) {
    throw new Error(`Unable to resolve bin "${binName}" from package "${pkgName}".`)
  }
  return path.resolve(path.dirname(pkgJsonPath), relative)
}

/**
 * pnpm forwards the literal `--` separator into argv (verified:
 * `pnpm check -- a b` yields `["--", "a", "b"]`). Drop a single leading `--`
 * so Lefthook's `pnpm check -- {staged_files}` forwards clean file paths.
 */
export function normalizeForwardedArgs(args = []) {
  const files = [...args]
  if (files[0] === '--') {
    files.shift()
  }
  return files
}

/**
 * Build the ordered command plan: Oxfmt first, Oxlint second.
 */
export function buildCommands(mode, files = []) {
  const unmatched = '--no-error-on-unmatched-pattern'
  const oxfmtArgs = mode === 'fix' ? ['--write'] : ['--check']
  const oxlintArgs = mode === 'fix' ? ['--fix', '--max-warnings=0'] : ['--max-warnings=0']
  return [
    { name: 'oxfmt', pkg: 'oxfmt', bin: 'oxfmt', args: [...oxfmtArgs, unmatched, ...files] },
    { name: 'oxlint', pkg: 'oxlint', bin: 'oxlint', args: [...oxlintArgs, unmatched, ...files] },
  ]
}

function defaultSpawn(command, args) {
  return spawnSync(command, args, { stdio: 'inherit' })
}

/**
 * Run the check pipeline sequentially, stopping on the first failure and
 * reporting the terminating exit code or signal.
 *
 * `spawn` and `resolve` are injectable seams so the behaviour (argument
 * forwarding, ordering, stop-on-failure, exit/signal propagation) can be tested
 * deterministically without invoking the real tools.
 */
export function runChecks({
  mode,
  files = [],
  spawn = defaultSpawn,
  resolve = resolveBin,
  node = process.execPath,
} = {}) {
  const commands = buildCommands(mode, normalizeForwardedArgs(files))
  for (const command of commands) {
    const binPath = resolve(command.pkg, command.bin)
    const result = spawn(node, [binPath, ...command.args])
    if (result.error) {
      return { step: command.name, code: 1, signal: null, error: result.error }
    }
    if (result.signal) {
      return { step: command.name, code: null, signal: result.signal }
    }
    if (result.status !== 0) {
      return { step: command.name, code: result.status ?? 1, signal: null }
    }
  }
  return { step: null, code: 0, signal: null }
}

function main(argv) {
  const [mode, ...rest] = argv
  if (mode !== 'check' && mode !== 'fix') {
    console.error(`Unknown mode "${mode ?? ''}". Expected "check" or "fix".`)
    process.exit(2)
  }
  const outcome = runChecks({ mode, files: rest })
  if (outcome.error) {
    console.error(outcome.error.message ?? String(outcome.error))
  }
  if (outcome.signal) {
    // Faithfully re-raise the terminating signal so the parent observes it.
    process.kill(process.pid, outcome.signal)
    return
  }
  process.exit(outcome.code ?? 0)
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  main(process.argv.slice(2))
}
