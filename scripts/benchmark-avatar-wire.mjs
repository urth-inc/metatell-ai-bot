// Offline serialization comparison. Never connects to a room or publishes a package.
// Run after pnpm build: node scripts/benchmark-avatar-wire.mjs <baseline-ref>
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'
import ts from 'typescript'
import { AvatarController } from '../packages/core/dist/services/AvatarController.js'
import {
  DefaultLoggerProvider,
  registerLoggerProvider,
} from '../packages/core/dist/logging/index.js'

const provider = new DefaultLoggerProvider()
provider.enableConsole(false)
registerLoggerProvider(provider, { allowOverwrite: true })
const baseline = process.argv[2]
if (!baseline) throw new Error('Usage: node scripts/benchmark-avatar-wire.mjs <baseline-ref>')
const coreRequire = createRequire(new URL('../packages/core/package.json', import.meta.url))
function compile(file, imports = {}) {
  const source = execFileSync('git', ['show', `${baseline}:${file}`], { encoding: 'utf8' })
  let output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText
  output = output.replace(/from '([^']+)'/g, (_match, name) => {
    const url =
      imports[name] ??
      (name.startsWith('.')
        ? new URL(
            name,
            new URL(
              `../${file.replace('/src/', '/dist/').replace(/\.ts$/, '.js')}`,
              import.meta.url,
            ),
          ).href
        : pathToFileURL(coreRequire.resolve(name)).href)
    return `from '${url}'`
  })
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
}
const builder = compile('packages/core/src/builders/NafMessageBuilder.ts')
const oldModule = await import(
  compile('packages/core/src/services/AvatarController.ts', {
    '../builders/NafMessageBuilder.js': builder,
  })
)
async function measure(Controller, operation, count) {
  let messages = 0,
    bytes = 0
  const send = async (packet) => {
    messages++
    bytes += Buffer.byteLength(JSON.stringify(packet))
  }
  const controller = new Controller(
    { sendNAF: send, sendNAFR: send },
    {
      getConfiguration: () => ({ profile: { displayName: 'Benchmark' } }),
    },
    { on: (_name, callback) => callback({ session_id: 'benchmark-session' }), emit() {} },
  )
  const position = { x: 11.2, y: 2.3, z: -17.4 }
  const rotation = { x: 0.21, y: 0.37, z: -0.18, w: 0.88 }
  const spawn = () =>
    controller.spawn('benchmark-avatar', position, 'https://example.com/avatar.gltf')
  await spawn()
  messages = 0
  bytes = 0
  const start = performance.now()
  for (let i = 0; i < count; i++) {
    switch (operation) {
      case 'spawn':
        await spawn()
        break
      case 'movement':
        await controller.move(position)
        break
      case 'rotation':
        await controller.rotate(rotation)
        break
      case 'animation':
        await controller.playAnimation('wave')
        break
      case 'resync':
        await controller.resyncAvatar()
        break
    }
  }
  if (messages !== count)
    throw new Error(`${operation}: expected ${count} messages, received ${messages}`)
  return { ms: performance.now() - start, messages, bytesPerMessage: bytes / messages }
}
const count = 10000
const results = {}
for (const operation of ['spawn', 'movement', 'rotation', 'animation', 'resync']) {
  await measure(oldModule.AvatarController, operation, 1000)
  await measure(AvatarController, operation, 1000)
  const before = [],
    after = []
  for (let round = 0; round < 7; round++) {
    if (round % 2) {
      after.push(await measure(AvatarController, operation, count))
      before.push(await measure(oldModule.AvatarController, operation, count))
    } else {
      before.push(await measure(oldModule.AvatarController, operation, count))
      after.push(await measure(AvatarController, operation, count))
    }
  }
  const median = (samples) => samples.sort((a, b) => a.ms - b.ms)[3]
  results[operation] = { before: median(before), after: median(after) }
}
console.log(
  JSON.stringify(
    { baseline, node: process.version, iterations: count, rounds: 7, results },
    null,
    2,
  ),
)
