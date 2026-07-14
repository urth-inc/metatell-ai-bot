import type { JsonValue } from './types.js'

/**
 * Minimal JSON parser that records the line number of every value.
 * Used by `pnpm check` to report Japanese validation errors with
 * the exact line in tree.json. Dependency-free on purpose.
 */

export interface Located {
  value: JsonValue
  /** 1-based line where this value starts. */
  line: number
  /** Child locations for objects (by key) and arrays (by index). */
  entries?: Map<string | number, Located>
}

export class JsonSyntaxError extends Error {
  constructor(
    public line: number,
    message: string,
  ) {
    super(message)
    this.name = 'JsonSyntaxError'
  }
}

export function parseJsonWithLines(text: string): Located {
  let pos = 0
  let line = 1

  const fail = (message: string): never => {
    throw new JsonSyntaxError(line, message)
  }

  const advance = (): string => {
    const ch = text[pos]
    if (ch === '\n') line += 1
    pos += 1
    return ch
  }

  const skipWhitespace = (): void => {
    while (pos < text.length && ' \t\r\n'.includes(text[pos])) advance()
  }

  const expect = (ch: string): void => {
    if (text[pos] !== ch) {
      fail(`「${ch}」が必要ですが「${text[pos] ?? '入力の終わり'}」が見つかりました`)
    }
    advance()
  }

  const parseString = (): string => {
    expect('"')
    let result = ''
    for (;;) {
      if (pos >= text.length) fail('文字列が閉じられていません（"が足りません）')
      const ch = advance()
      if (ch === '"') return result
      if (ch === '\\') {
        const esc = advance()
        if (esc === 'n') result += '\n'
        else if (esc === 't') result += '\t'
        else if (esc === 'r') result += '\r'
        else if (esc === 'b') result += '\b'
        else if (esc === 'f') result += '\f'
        else if (esc === 'u') {
          let hex = ''
          for (let i = 0; i < 4; i += 1) hex += advance()
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail(`不正なユニコードエスケープ「\\u${hex}」です`)
          result += String.fromCharCode(Number.parseInt(hex, 16))
        } else if (esc === '"' || esc === '\\' || esc === '/') result += esc
        else fail(`不正なエスケープ「\\${esc}」です`)
      } else if (ch === '\n') {
        fail('文字列の途中で改行されています（"で閉じてください）')
      } else {
        result += ch
      }
    }
  }

  const parseNumber = (): number => {
    const start = pos
    if (text[pos] === '-') advance()

    if (text[pos] === '0') {
      advance()
    } else if (/[1-9]/.test(text[pos] ?? '')) {
      while (/[0-9]/.test(text[pos] ?? '')) advance()
    } else {
      fail(`不正な数値「${text.slice(start, pos + 1)}」です`)
    }

    if (text[pos] === '.') {
      advance()
      if (!/[0-9]/.test(text[pos] ?? '')) fail('小数点の後には数字が必要です')
      while (/[0-9]/.test(text[pos] ?? '')) advance()
    }

    if (text[pos] === 'e' || text[pos] === 'E') {
      advance()
      if (text[pos] === '+' || text[pos] === '-') advance()
      if (!/[0-9]/.test(text[pos] ?? '')) fail('指数部には数字が必要です')
      while (/[0-9]/.test(text[pos] ?? '')) advance()
    }

    const raw = text.slice(start, pos)
    return Number(raw)
  }

  const parseValue = (): Located => {
    skipWhitespace()
    if (pos >= text.length) fail('値が必要ですが入力が終わりました')
    const startLine = line
    const ch = text[pos]

    if (ch === '{') {
      advance()
      const entries = new Map<string | number, Located>()
      const objectValue: { [key: string]: JsonValue } = {}
      skipWhitespace()
      if (text[pos] === '}') {
        advance()
        return { value: objectValue, line: startLine, entries }
      }
      for (;;) {
        skipWhitespace()
        if (text[pos] !== '"') fail('オブジェクトのキーは"で囲んでください')
        const key = parseString()
        skipWhitespace()
        expect(':')
        const child = parseValue()
        if (Object.hasOwn(objectValue, key)) fail(`キー「${key}」が重複しています`)
        objectValue[key] = child.value
        entries.set(key, child)
        skipWhitespace()
        if (text[pos] === ',') {
          advance()
          continue
        }
        expect('}')
        return { value: objectValue, line: startLine, entries }
      }
    }

    if (ch === '[') {
      advance()
      const entries = new Map<string | number, Located>()
      const arrayValue: JsonValue[] = []
      skipWhitespace()
      if (text[pos] === ']') {
        advance()
        return { value: arrayValue, line: startLine, entries }
      }
      for (;;) {
        const child = parseValue()
        entries.set(arrayValue.length, child)
        arrayValue.push(child.value)
        skipWhitespace()
        if (text[pos] === ',') {
          advance()
          continue
        }
        expect(']')
        return { value: arrayValue, line: startLine, entries }
      }
    }

    if (ch === '"') return { value: parseString(), line: startLine }
    if (ch === '-' || /[0-9]/.test(ch)) return { value: parseNumber(), line: startLine }
    if (text.startsWith('true', pos)) {
      for (let i = 0; i < 4; i += 1) advance()
      return { value: true, line: startLine }
    }
    if (text.startsWith('false', pos)) {
      for (let i = 0; i < 5; i += 1) advance()
      return { value: false, line: startLine }
    }
    if (text.startsWith('null', pos)) {
      for (let i = 0; i < 4; i += 1) advance()
      return { value: null, line: startLine }
    }
    return fail(`不正な値の始まり「${ch}」です`)
  }

  const root = parseValue()
  skipWhitespace()
  if (pos < text.length) fail(`値の後に余分な文字「${text[pos]}」があります`)
  return root
}

/** Follows a path (object keys / array indexes) and returns the line of that value. */
export function lineAt(root: Located, path: (string | number)[]): number {
  let current = root
  for (const segment of path) {
    const next = current.entries?.get(segment)
    if (!next) return current.line
    current = next
  }
  return current.line
}
