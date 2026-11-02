import { describe, expect, it } from 'vitest'
import { photoTiming, scoreSky, SCORE_WIDTH } from './skyScore.ts'

/*
 * THE SKY'S SCORE FROM A PHOTO (Batch F, Section 7), on drawn skies: no
 * photograph in the tests. The 30 Oct sunrise was clear: a smooth gradient,
 * blue above and peach at the horizon, no cloud in it. It must come out
 * Clear, whatever its colours.
 */
const W = SCORE_WIDTH
const H = 72
function sky(paint: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y += 1)
    for (let x = 0; x < W; x += 1) {
      const [r, g, b] = paint(x, y)
      const i = (y * W + x) * 4
      d[i] = r
      d[i + 1] = g
      d[i + 2] = b
      d[i + 3] = 255
    }
  return d
}
/* Cheap repeatable texture: blobs of cloud. */
const blob = (x: number, y: number) => (Math.sin(x * 0.9) * Math.sin(y * 1.3) + Math.sin(x * 0.37 + y * 0.61)) > 0.6
const gradient = (y: number): [number, number, number] => {
  const t = y / H
  return [Math.round(40 + 215 * t), Math.round(70 + 120 * t), Math.round(150 - 20 * t)]
}

describe('the sky in a sunrise photo', () => {
  it('30 Oct sunrise, clear: a smooth dawn gradient is Clear, however warm', () => {
    const s = scoreSky(sky((_, y) => gradient(y)), W, H)
    expect(s.cloud).toBeLessThan(0.08)
    expect(s.suggest).toBe('clear')
  })

  it('cloud lit orange and pink across the sky is Fired', () => {
    const s = scoreSky(sky((x, y) => (blob(x, y) ? [250, 120, 70] : [40, 50, 110])), W, H)
    expect(s.lit).toBeGreaterThanOrEqual(0.2)
    expect(s.suggest).toBe('fired')
  })

  it('a grey deck with no colour on it is Nothing', () => {
    const s = scoreSky(sky((x, y) => (blob(x, y) ? [150, 150, 155] : [95, 98, 105])), W, H)
    expect(s.cloud).toBeGreaterThan(0.08)
    expect(s.lit).toBeLessThan(0.06)
    expect(s.suggest).toBe('nothing')
  })

  it('a featureless grey lid is Nothing, not Clear: overcast is not clear', () => {
    expect(scoreSky(sky(() => [128, 130, 134]), W, H).suggest).toBe('nothing')
  })

  it('some lit cloud among grey is Meh', () => {
    const s = scoreSky(sky((x, y) => (blob(x, y) ? (x < 32 ? [240, 130, 80] : [140, 140, 145]) : [70, 75, 100])), W, H)
    expect(s.suggest).toBe('meh')
  })

  it('looks only at the sky: a busy foreground under the horizon changes nothing', () => {
    const clear = sky((x, y) => (y < 40 ? gradient(y) : blob(x, y) ? [250, 120, 70] : [10, 10, 10]))
    expect(scoreSky(clear, W, H, 40).suggest).toBe('clear')
  })
})

describe('is it a sunrise or sunset photo', () => {
  it('within the hour, facing the sun: nothing to say', () => {
    expect(photoTiming(-12, 100, 110)).toEqual({ near: true, facing: 'toward', note: null })
  })
  it('three hours after: said, not refused', () => {
    const t = photoTiming(185, 100, 110)
    expect(t.near).toBe(false)
    expect(t.note).toMatch(/185 min after/)
  })
  it('facing away is the anti-twilight; side-on is said', () => {
    expect(photoTiming(0, 290, 110).facing).toBe('away')
    expect(photoTiming(0, 230, 110).facing).toBe('side')
  })
})
