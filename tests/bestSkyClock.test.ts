import { describe, expect, it } from 'vitest'
import { clockParts } from '../src/core/bestSkyClock.ts'

/* THE COLOUR'S CLOCK AS A BAR (Batch BEST SKY, Section 5; board BestSky_Spot). */
const t = (hm: string) => new Date(`2026-11-11T${hm}:00Z`)
describe('the bar', () => {
  it('sunset: set up, colour, fade to dark, dark; the shares add to 1 and follow the minutes', () => {
    const p = clockParts({ kind: 'sunset', setUp: t('21:41'), colorFrom: t('21:51'), colorTo: t('22:13'), dark: t('22:24') })
    expect(p.map((x) => x.part)).toEqual(['setup', 'color', 'fade', 'dark'])
    expect(p.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1, 9)
    expect(p[1].share).toBeCloseTo(22 / 53, 9)
  })
  it('sunrise: dark first; no dark known, no dark part', () => {
    const p = clockParts({ kind: 'sunrise', setUp: t('11:25'), colorFrom: t('11:35'), colorTo: t('11:57'), dark: t('11:20') })
    expect(p.map((x) => x.part)).toEqual(['dark', 'fade', 'setup', 'color'])
    expect(clockParts({ kind: 'sunset', setUp: t('21:41'), colorFrom: t('21:51'), colorTo: t('22:13'), dark: null }).map((x) => x.part)).toEqual(['setup', 'color'])
  })
})
