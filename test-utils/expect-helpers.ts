// Vitest expectのヘルパー関数

// 関数であることを検証するマッチャー
export function toBeFunction(received: unknown): boolean {
  return typeof received === 'function'
}

// カスタムマッチャーのエラーメッセージ
export function toBeFunctionMessage(received: unknown, pass: boolean): string {
  return pass
    ? `expected ${received} not to be a function`
    : `expected ${received} to be a function`
}
