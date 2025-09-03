/**
 * PCM audio utility functions
 */

import type { PcmInput } from './types.js'

/**
 * 16-bit PCMのサンプルレートを変換します。
 * 内部では品質とパフォーマンスのバランスが良い線形補間を使用します。
 */
async function* resample(
  input: PcmInput,
  fromHz: number,
  toHz: number,
  _channels: 1 | 2 = 1,
): AsyncIterable<Int16Array> {
  const ratio = toHz / fromHz
  let buffer: Int16Array = new Int16Array(0)
  const _inputIndex = 0

  const inputIterable = makeIterable(input)

  for await (const chunk of inputIterable) {
    // 既存バッファと新しいチャンクを結合
    const newBuffer = new Int16Array(buffer.length + chunk.length)
    newBuffer.set(buffer)
    newBuffer.set(chunk, buffer.length)
    buffer = newBuffer

    // リサンプリング実行
    const outputLength = Math.floor(buffer.length * ratio)
    if (outputLength > 0) {
      const output = new Int16Array(outputLength)

      for (let i = 0; i < outputLength; i++) {
        const sourceIndex = i / ratio
        const index1 = Math.floor(sourceIndex)
        const index2 = Math.min(index1 + 1, buffer.length - 1)
        const fraction = sourceIndex - index1

        if (index1 < buffer.length) {
          // 線形補間
          const sample1 = buffer[index1] || 0
          const sample2 = buffer[index2] || 0
          output[i] = Math.round(sample1 + (sample2 - sample1) * fraction)
        }
      }

      yield output

      // 処理済みサンプルを削除
      const consumedSamples = Math.floor(outputLength / ratio)
      buffer = buffer.slice(consumedSamples)
    }
  }
}

/**
 * PCMストリームを指定サンプル数ごとのチャンクに分割します。
 */
async function* chunk(
  input: AsyncIterable<Int16Array>,
  samplesPerChunk: number,
): AsyncIterable<Int16Array> {
  let buffer = new Int16Array(0)

  for await (const chunk of input) {
    // バッファに追加
    const newBuffer = new Int16Array(buffer.length + chunk.length)
    newBuffer.set(buffer)
    newBuffer.set(chunk, buffer.length)
    buffer = newBuffer

    // 指定サイズのチャンクを出力
    while (buffer.length >= samplesPerChunk) {
      yield buffer.slice(0, samplesPerChunk)
      buffer = buffer.slice(samplesPerChunk)
    }
  }

  // 残りのデータがある場合は出力
  if (buffer.length > 0) {
    yield buffer
  }
}

/**
 * 様々な入力タイプを統一されたAsyncIterableに変換
 */
async function* makeIterable(input: PcmInput): AsyncIterable<Int16Array> {
  if (input instanceof Int16Array) {
    yield input
  } else if (Symbol.asyncIterator in input) {
    for await (const chunk of input as AsyncIterable<Int16Array>) {
      yield chunk
    }
  } else {
    // NodeJS.ReadableStreamの場合
    const stream = input as NodeJS.ReadableStream
    for await (const chunk of stream) {
      if (chunk instanceof Int16Array) {
        yield chunk
      } else if (chunk instanceof Buffer) {
        // BufferをInt16Arrayに変換
        const samples = new Int16Array(chunk.length / 2)
        for (let i = 0; i < samples.length; i++) {
          samples[i] = chunk.readInt16LE(i * 2)
        }
        yield samples
      }
    }
  }
}

export const pcm = {
  resample,
  chunk,
}
