import { describe, expect, it } from 'vitest'
import { chunkToFrames, isValidFrame, toInt16View } from './frame-utils.js'

describe('frame-utils', () => {
  describe('toInt16View', () => {
    it('should convert Uint8Array to Int16Array view', () => {
      const u8 = new Uint8Array([0x00, 0x01, 0x00, 0x02])
      const i16 = toInt16View(u8)

      expect(i16.length).toBe(2)
      expect(i16[0]).toBe(256) // 0x0100 in LE
      expect(i16[1]).toBe(512) // 0x0200 in LE
    })

    it('should handle odd byte length by truncating', () => {
      const u8 = new Uint8Array([0x00, 0x01, 0xff]) // 3 bytes
      const i16 = toInt16View(u8)

      expect(i16.length).toBe(1) // 最後の1バイトは切り捨て
      expect(i16[0]).toBe(256)
    })

    it('should work with buffer offsets', () => {
      const buffer = new ArrayBuffer(8)
      const u8 = new Uint8Array(buffer, 2, 4) // offset=2, length=4
      u8.set([0x00, 0x01, 0x00, 0x02])

      const i16 = toInt16View(u8)
      expect(i16.length).toBe(2)
      expect(i16.byteOffset).toBe(2)
    })
  })

  describe('chunkToFrames', () => {
    it('should yield as-is when exact match', () => {
      const src = new Int16Array(960) // 20ms frame
      const frames = [...chunkToFrames(src, 960)]

      expect(frames.length).toBe(1)
      expect(frames[0]).toBe(src)
    })

    it('should zero-pad when shorter', () => {
      const src = new Int16Array([1, 2, 3]) // 3 samples
      const frames = [...chunkToFrames(src, 480)] // expects 480

      expect(frames.length).toBe(1)
      expect(frames[0].length).toBe(480)
      expect(frames[0][0]).toBe(1)
      expect(frames[0][1]).toBe(2)
      expect(frames[0][2]).toBe(3)
      expect(frames[0][3]).toBe(0) // padded
      expect(frames[0][479]).toBe(0) // padded
    })

    it('should chunk when longer', () => {
      const src = new Int16Array(2400) // 50ms worth
      for (let i = 0; i < src.length; i++) {
        src[i] = i // 識別用の値
      }

      const frames = [...chunkToFrames(src, 480)] // 10ms chunks

      expect(frames.length).toBe(5)

      // 各フレームの検証
      for (let i = 0; i < 5; i++) {
        expect(frames[i].length).toBe(480)
        expect(frames[i][0]).toBe(i * 480)
        expect(frames[i][479]).toBe(i * 480 + 479)
      }
    })

    it('should pad remainder when not divisible', () => {
      const src = new Int16Array(1000) // 960 + 40
      const frames = [...chunkToFrames(src, 960)]

      expect(frames.length).toBe(2)
      expect(frames[0].length).toBe(960)
      expect(frames[1].length).toBe(960) // 40 samples + 920 zeros

      // 2番目のフレームの最後はゼロ
      expect(frames[1][40]).toBe(0)
      expect(frames[1][959]).toBe(0)
    })
  })

  describe('isValidFrame', () => {
    it('should validate frame size', () => {
      const valid480 = new Int16Array(480)
      const valid960 = new Int16Array(960)
      const invalid = new Int16Array(500)

      expect(isValidFrame(valid480, 480)).toBe(true)
      expect(isValidFrame(valid960, 960)).toBe(true)
      expect(isValidFrame(invalid, 480)).toBe(false)
      expect(isValidFrame(invalid, 960)).toBe(false)
    })
  })
})
