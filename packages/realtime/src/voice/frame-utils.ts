/**
 * Frame processing utilities.
 * Provides frame normalization (chunk, pad, truncate) inside the bridge.
 * Resampling is not performed here; use SDK-side pcm-utils when needed.
 */

/**
 * Creates an Int16Array view over a Uint8Array without copying. Assumes little-endian PCM.
 * @param u8 - Input byte array.
 * @returns Int16Array view.
 */
export function toInt16View(u8: Uint8Array): Int16Array {
  // Drop the trailing byte when the byte length is odd.
  const length = Math.floor(u8.byteLength / 2)
  return new Int16Array(u8.buffer, u8.byteOffset, length)
}

/**
 * Normalizes an input Int16Array into frames of expectedSamples.
 * - Short input: zero-pad.
 * - Long input: chunk, and zero-pad the remainder.
 * - Exact length: return as-is.
 *
 * @param src - Input PCM data.
 * @param expectedSamples - Expected sample count, usually 480 or 960.
 * @yields Normalized frames.
 */
export function* chunkToFrames(
  src: Int16Array,
  expectedSamples: number,
): Generator<Int16Array, void, unknown> {
  // Exact length.
  if (src.length === expectedSamples) {
    yield src
    return
  }

  // Long input: chunk into frames.
  if (src.length > expectedSamples) {
    for (let i = 0; i < src.length; i += expectedSamples) {
      const end = i + expectedSamples
      if (end <= src.length) {
        // Complete frame.
        yield src.subarray(i, end)
      } else {
        // Remainder: zero-pad.
        const out = new Int16Array(expectedSamples)
        out.set(src.subarray(i))
        yield out
      }
    }
    return
  }

  // Short input: zero-pad.
  const out = new Int16Array(expectedSamples)
  out.set(src)
  yield out
}

/**
 * Helper for frame validation.
 * @param frame - Frame to validate.
 * @param expectedSamples - Expected sample count.
 * @returns Whether the frame is valid.
 */
export function isValidFrame(frame: Int16Array, expectedSamples: number): boolean {
  return frame.length === expectedSamples
}
