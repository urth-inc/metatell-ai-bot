import { describe, expect, it } from 'vitest'

// @ts-expect-error - JS ESM runner without type declarations.
import { buildCommands, normalizeForwardedArgs, resolveBin, runChecks } from './run-checks.mjs'

const NODE = '/usr/bin/node'
const ok = { status: 0, signal: null }

/** Deterministic spawn seam that records invocations and replays scripted results. */
function makeSpawn(results: Array<Record<string, unknown>> = [ok, ok]) {
  const calls: Array<{ command: string; args: string[] }> = []
  const spawn = (command: string, args: string[]) => {
    calls.push({ command, args })
    return results[calls.length - 1] ?? ok
  }
  return { spawn, calls }
}

const resolve = (pkg: string, bin: string) => `/abs/${pkg}/bin/${bin}`

describe('normalizeForwardedArgs', () => {
  it('drops a single leading -- forwarded by pnpm', () => {
    expect(normalizeForwardedArgs(['--', 'a.ts', 'b.ts'])).toEqual(['a.ts', 'b.ts'])
  })

  it('leaves args without a leading -- untouched', () => {
    expect(normalizeForwardedArgs(['a.ts', 'b.ts'])).toEqual(['a.ts', 'b.ts'])
  })

  it('only strips the first -- and preserves later ones', () => {
    expect(normalizeForwardedArgs(['--', '--', 'a.ts'])).toEqual(['--', 'a.ts'])
  })

  it('handles no args', () => {
    expect(normalizeForwardedArgs([])).toEqual([])
    expect(normalizeForwardedArgs()).toEqual([])
  })
})

describe('buildCommands', () => {
  it('runs oxfmt before oxlint in check mode', () => {
    const [first, second] = buildCommands('check', [])
    expect(first.name).toBe('oxfmt')
    expect(second.name).toBe('oxlint')
    expect(first.args).toEqual(['--check', '--no-error-on-unmatched-pattern'])
    expect(second.args).toEqual(['--max-warnings=0', '--no-error-on-unmatched-pattern'])
  })

  it('uses write/fix flags in fix mode', () => {
    const [first, second] = buildCommands('fix', [])
    expect(first.args).toEqual(['--write', '--no-error-on-unmatched-pattern'])
    expect(second.args).toEqual(['--fix', '--max-warnings=0', '--no-error-on-unmatched-pattern'])
  })

  it('appends forwarded file arguments after -- to both commands', () => {
    const [first, second] = buildCommands('check', ['a.ts', 'b.ts'])
    expect(first.args).toEqual(['--check', '--no-error-on-unmatched-pattern', '--', 'a.ts', 'b.ts'])
    expect(second.args).toEqual([
      '--max-warnings=0',
      '--no-error-on-unmatched-pattern',
      '--',
      'a.ts',
      'b.ts',
    ])
  })

  it('does not insert -- when no files are provided', () => {
    const [first, second] = buildCommands('check', [])
    expect(first.args).not.toContain('--')
    expect(second.args).not.toContain('--')
  })

  it('treats option-like filenames as path operands after --', () => {
    const [first, second] = buildCommands('fix', ['--fix'])
    expect(first.args).toEqual(['--write', '--no-error-on-unmatched-pattern', '--', '--fix'])
    expect(second.args).toEqual([
      '--fix',
      '--max-warnings=0',
      '--no-error-on-unmatched-pattern',
      '--',
      '--fix',
    ])
  })
})

describe('runChecks', () => {
  it('invokes oxfmt then oxlint via node with resolved bins', () => {
    const { spawn, calls } = makeSpawn()
    const outcome = runChecks({ mode: 'check', files: [], spawn, resolve, node: NODE })
    expect(outcome).toEqual({ step: null, code: 0, signal: null })
    expect(calls).toHaveLength(2)
    expect(calls[0].command).toBe(NODE)
    expect(calls[0].args[0]).toBe('/abs/oxfmt/bin/oxfmt')
    expect(calls[1].args[0]).toBe('/abs/oxlint/bin/oxlint')
  })

  it('forwards file arguments (with pnpm -- stripped) to both tools', () => {
    const { spawn, calls } = makeSpawn()
    runChecks({ mode: 'check', files: ['--', 'a.ts', 'b c.ts'], spawn, resolve, node: NODE })
    expect(calls[0].args).toEqual([
      '/abs/oxfmt/bin/oxfmt',
      '--check',
      '--no-error-on-unmatched-pattern',
      '--',
      'a.ts',
      'b c.ts',
    ])
    expect(calls[1].args).toEqual([
      '/abs/oxlint/bin/oxlint',
      '--max-warnings=0',
      '--no-error-on-unmatched-pattern',
      '--',
      'a.ts',
      'b c.ts',
    ])
  })

  it('stops on the first failure and does not run oxlint', () => {
    const { spawn, calls } = makeSpawn([{ status: 3, signal: null }, ok])
    const outcome = runChecks({ mode: 'check', files: [], spawn, resolve, node: NODE })
    expect(outcome).toEqual({ step: 'oxfmt', code: 3, signal: null })
    expect(calls).toHaveLength(1)
  })

  it('propagates a non-zero exit code from oxlint', () => {
    const { spawn, calls } = makeSpawn([ok, { status: 1, signal: null }])
    const outcome = runChecks({ mode: 'fix', files: [], spawn, resolve, node: NODE })
    expect(outcome).toEqual({ step: 'oxlint', code: 1, signal: null })
    expect(calls).toHaveLength(2)
  })

  it('propagates a terminating signal', () => {
    const { spawn } = makeSpawn([{ status: null, signal: 'SIGINT' }])
    const outcome = runChecks({ mode: 'check', files: [], spawn, resolve, node: NODE })
    expect(outcome).toEqual({ step: 'oxfmt', code: null, signal: 'SIGINT' })
  })

  it('reports a spawn error as a failure', () => {
    const error = new Error('ENOENT')
    const { spawn } = makeSpawn([{ error }])
    const outcome = runChecks({ mode: 'check', files: [], spawn, resolve, node: NODE })
    expect(outcome.step).toBe('oxfmt')
    expect(outcome.code).toBe(1)
    expect(outcome.error).toBe(error)
  })
})

describe('resolveBin', () => {
  it('resolves an absolute path from package bin metadata', () => {
    const fakeRequire = Object.assign((_id: string) => ({ bin: { oxfmt: 'bin/oxfmt' } }), {
      resolve: (_id: string) => '/root/node_modules/oxfmt/package.json',
    })
    const resolved = resolveBin('oxfmt', 'oxfmt', fakeRequire)
    expect(resolved).toBe('/root/node_modules/oxfmt/bin/oxfmt')
  })

  it('throws when the bin is missing', () => {
    const fakeRequire = Object.assign((_id: string) => ({ bin: {} }), {
      resolve: (_id: string) => '/root/node_modules/oxfmt/package.json',
    })
    expect(() => resolveBin('oxfmt', 'oxfmt', fakeRequire)).toThrow(/Unable to resolve bin/)
  })
})
