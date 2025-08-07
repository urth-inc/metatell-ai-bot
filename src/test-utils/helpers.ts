// テストで使用する共通のヘルパー関数

// 空のブロックを避けるためのnoop関数
export const noop = (): void => undefined

// console系のモック作成ヘルパー
export const mockConsole = {
  log: () => noop,
  error: () => noop,
  warn: () => noop,
  info: () => noop,
  debug: () => noop,
}
