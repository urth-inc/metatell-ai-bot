/**
 * フレーム処理ユーティリティ
 * ブリッジ内でのフレーム整形（chunk/pad/truncate）を提供
 * resampleは行わない（SDK側のpcm-utilsを利用してもらう）
 */

/**
 * Uint8Array → Int16Array のビュー化（コピー回避, LE前提）
 * @param u8 - 入力バイト配列
 * @returns Int16Arrayビュー
 */
export function toInt16View(u8: Uint8Array): Int16Array {
  // バイト長が奇数の場合は最後の1バイトを切り捨て
  const length = Math.floor(u8.byteLength / 2)
  return new Int16Array(u8.buffer, u8.byteOffset, length)
}

/**
 * 入力 Int16Array を expectedSamples のフレーム群に整える
 * - 短い：zero-pad
 * - 長い：切り出し（余りもpadして出力）
 * - ちょうど：そのまま
 *
 * @param src - 入力PCMデータ
 * @param expectedSamples - 期待されるサンプル数（480 or 960）
 * @yields 整形されたフレーム
 */
export function* chunkToFrames(
  src: Int16Array,
  expectedSamples: number,
): Generator<Int16Array, void, unknown> {
  // ちょうどの場合
  if (src.length === expectedSamples) {
    yield src
    return
  }

  // 長い場合：切り出し
  if (src.length > expectedSamples) {
    for (let i = 0; i < src.length; i += expectedSamples) {
      const end = i + expectedSamples
      if (end <= src.length) {
        // 完全なフレーム
        yield src.subarray(i, end)
      } else {
        // 最後の端数：zero-pad
        const out = new Int16Array(expectedSamples)
        out.set(src.subarray(i))
        yield out
      }
    }
    return
  }

  // 短い場合：zero-pad
  const out = new Int16Array(expectedSamples)
  out.set(src)
  yield out
}

/**
 * フレーム検証用ヘルパー
 * @param frame - 検証対象のフレーム
 * @param expectedSamples - 期待されるサンプル数
 * @returns 有効なフレームかどうか
 */
export function isValidFrame(frame: Int16Array, expectedSamples: number): boolean {
  return frame.length === expectedSamples
}
