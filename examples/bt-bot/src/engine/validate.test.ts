import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerBuiltins } from '../nodes/index.js'
import { JsonSyntaxError, lineAt, parseJsonWithLines } from './json-lines.js'
import { validateTreeDoc } from './validate.js'

/* Validation and line-number reporting tests for `pnpm check`. */

registerBuiltins()

test('rootがないと日本語エラーになる', () => {
  const issues = validateTreeDoc({})
  assert.equal(issues.length, 1)
  assert.match(issues[0].message, /root/)
})

test('childrenのないselectorはエラーになる', () => {
  const issues = validateTreeDoc({ root: { type: 'selector' } })
  assert.ok(issues.some((issue) => issue.level === 'error' && issue.message.includes('children')))
})

test('priority_selectorもchildrenを持つ正しい複合ノードとして検証できる', () => {
  const issues = validateTreeDoc({
    root: {
      type: 'priority_selector',
      children: [{ type: 'action', name: 'patrol_next' }],
    },
  })
  assert.deepEqual(issues, [])
})

test('未知のノード種別にはもしかして候補が付く', () => {
  const issues = validateTreeDoc({ root: { type: 'selecter', children: [] } })
  assert.ok(issues.some((issue) => issue.message.includes('selector')))
})

test('未知のトップレベルキーはschemaと同じくエラーになる', () => {
  const issues = validateTreeDoc({
    root: { type: 'action', name: 'patrol_next' },
    rooot: {},
  })

  assert.ok(issues.some((issue) => issue.path.join('.') === 'rooot' && issue.level === 'error'))
})

test('未知のノードキーはschemaと同じくエラーになる', () => {
  const issues = validateTreeDoc({
    root: { type: 'action', name: 'patrol_next', parmas: {} },
  })

  assert.ok(
    issues.some((issue) => issue.path.join('.') === 'root.parmas' && issue.level === 'error'),
  )
})

test('タイプミスした条件名にはもしかして候補が付く', () => {
  const issues = validateTreeDoc({
    root: { type: 'condition', name: 'user_nearbyy' },
  })
  assert.ok(
    issues.some((issue) => issue.level === 'error' && issue.message.includes('user_nearby')),
  )
})

test('必須paramsの欠落はエラーになる', () => {
  const issues = validateTreeDoc({
    root: { type: 'action', name: 'say' },
  })
  assert.ok(issues.some((issue) => issue.level === 'error' && issue.message.includes('text')))
})

test('cooldownの外のllm_sayは警告になる', () => {
  const issues = validateTreeDoc({
    root: { type: 'action', name: 'llm_say' },
  })
  assert.ok(issues.some((issue) => issue.level === 'warning' && issue.message.includes('cooldown')))
})

test('cooldownの中のllm_sayは警告にならない', () => {
  const issues = validateTreeDoc({
    root: {
      type: 'cooldown',
      params: { sec: 60 },
      child: { type: 'action', name: 'llm_say' },
    },
  })
  assert.equal(issues.length, 0)
})

test('正しいツリーはエラーも警告も出ない', () => {
  const issues = validateTreeDoc({
    $schema: '../schemas/tree.schema.json',
    root: {
      type: 'selector',
      children: [
        {
          type: 'sequence',
          children: [
            { type: 'condition', name: 'mentioned' },
            { type: 'action', name: 'llm_reply' },
          ],
        },
        {
          type: 'sequence',
          children: [
            { type: 'condition', name: 'user_nearby', params: { range: 3 } },
            { type: 'condition', name: 'cooldown', params: { sec: 30, key: 'greet' } },
            { type: 'action', name: 'say', params: { text: '{greeting}' } },
          ],
        },
        { type: 'action', name: 'patrol_next' },
      ],
    },
  })
  assert.deepEqual(issues, [])
})

test('JSON構文エラーは行番号つきで報告される', () => {
  try {
    parseJsonWithLines('{\n  "root": {\n    "type": "selector"\n  \n}')
    assert.fail('例外になるはず')
  } catch (error) {
    assert.ok(error instanceof JsonSyntaxError)
    assert.equal(error.line, 5)
  }
})

test('lineAtはパスからtree.json内の行番号を引ける', () => {
  const located = parseJsonWithLines(
    [
      '{',
      '  "root": {',
      '    "type": "selector",',
      '    "children": [',
      '      { "type": "action", "name": "patrol_next" }',
      '    ]',
      '  }',
      '}',
    ].join('\n'),
  )
  assert.equal(lineAt(located, ['root']), 2)
  assert.equal(lineAt(located, ['root', 'children', 0]), 5)
})

test('RFC 8259で有効な数値をJSON.parseと同じ値へ変換する', () => {
  const validNumbers = ['0', '-0', '1', '-1', '10', '0.5', '-0.5', '1e2', '1E+2', '1e-2']

  for (const raw of validNumbers) {
    assert.deepEqual(parseJsonWithLines(raw).value, JSON.parse(raw), raw)
  }
})

test('RFC 8259で無効な数値表記を拒否する', () => {
  const invalidNumbers = ['01', '-01', '1.', '.1', '-.1', '1e', '1e+', '+1', '--1']

  for (const raw of invalidNumbers) {
    assert.throws(() => JSON.parse(raw), undefined, `JSON.parse should reject ${raw}`)
    assert.throws(
      () => parseJsonWithLines(raw),
      (error: unknown) => error instanceof JsonSyntaxError,
      raw,
    )
  }
})
