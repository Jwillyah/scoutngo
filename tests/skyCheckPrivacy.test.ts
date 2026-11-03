import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bandStats, skyCheckWords } from '../src/core/skyCheck.ts'

/*
 * THE SKY CHECK READS PIXELS, AND KEEPS NONE (Batch J, Section 7). The
 * viewfinder's rule is that the picture never leaves the <video>
 * (tests/viewfinderPrivacy.test.ts, which still holds Viewfinder.tsx). The
 * check asked for "on-device, never uploaded" needs a look at the pixels, so
 * it lives in one file, src/lib/skyCheckRead.ts, held here: a canvas of at
 * most 32 x 24 made in the function and never on the page; out come numbers;
 * nothing encoded, recorded, stored or sent.
 */
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
const READ = strip(readFileSync('src/lib/skyCheckRead.ts', 'utf8'))

describe('the sky check', () => {
  it('reads a tiny frame and keeps nothing', () => {
    for (const bad of [/\btoDataURL\b|\btoBlob\b|\bconvertToBlob\b|\btransferToImageBitmap\b/, /\bMediaRecorder\b|\bImageCapture\b|\bcaptureStream\b/, /\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\b|\bWebSocket\b/, /\blocalStorage\b|\bindexedDB\b|\bcaches\b|\bsessionStorage\b/, /document\.|appendChild|createElement/]) {
      expect(bad.exec(READ)?.[0] ?? null).toBeNull()
    }
    expect(READ).toMatch(/export const SAMPLE_W = 32\b/)
    expect(READ).toMatch(/export const SAMPLE_H = 24\b/)
    expect(READ).toMatch(/new OffscreenCanvas\(SAMPLE_W, SAMPLE_H\)/)
    /* It returns the stats, nothing else. */
    expect(READ).toMatch(/return bandStats\(inBand, all\)/)
  })

  it('the viewfinder itself still draws nothing and reads nothing', () => {
    const vf = strip(readFileSync('src/components/Viewfinder.tsx', 'utf8'))
    expect(vf).not.toMatch(/\bdrawImage\b|\bgetImageData\b|OffscreenCanvas|<canvas/)
    expect(vf).toContain('readBand(v, band)')
  })

  it('says the gap in words from the numbers', () => {
    const px = (r: number, g: number, b: number, n: number) => Array.from({ length: n }, () => [r, g, b, 255]).flat()
    expect(skyCheckWords(bandStats(px(250, 170, 90, 10), px(120, 110, 110, 100)))).toBe('Gap looks bright and warm')
    expect(skyCheckWords(bandStats(px(60, 65, 75, 10), px(120, 120, 120, 100)))).toBe('Gap looks dim and grey-blue')
    expect(skyCheckWords(bandStats(px(120, 120, 118, 10), px(120, 120, 120, 100)))).toBe('Gap looks no brighter than the rest and neutral')
  })
})
