import { describe, expect, it } from 'vitest'
import { getPosition } from 'suncalc'
import { goldenNext } from '../src/core/goldenNext.ts'
import { lightCell, skyCell, stripWhen, tideCell } from '../src/core/statStrip.ts'
import { formatShortClock } from '../src/core/timezone.ts'

/* Batch Polish 2, Section 1: the map's stat strip, one line a cell, every one at the time on the bar. */
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const TZ = 'America/New_York'
const alt = (t: Date) => getPosition(t, PIER.lat, PIER.lon).altitude
const light = (iso: string) => {
  const at = new Date(iso)
  return lightCell(goldenNext(alt, at), at, alt(at), TZ, 12)
}

describe('the light cell: the next useful light from the time on the bar', () => {
  it('at night, the next sunrise', () => {
    expect(light('2026-11-11T08:00:00Z')).toMatch(/^Sunrise 6:\d\da$/)
  })
  it('in the day, when golden light starts', () => {
    expect(light('2026-11-11T17:00:00Z')).toMatch(/^Golden 4:\d\dp$/)
  })
  it('inside golden light, how long it has left', () => {
    /* Sunset at the pier on 11 Nov is about 4:55 PM; at 4:40 PM the sun is low. */
    expect(light('2026-11-11T21:40:00Z')).toMatch(/^Golden now · \d+ m$/)
  })
  it('nothing known, nothing said', () => {
    expect(lightCell(null, new Date(), 10, TZ)).toBeNull()
    expect(lightCell({ kind: 'none' }, new Date(), 10, TZ)).toBeNull()
  })
})

describe('the sky cell: which layer matters, in a word', () => {
  it('reads the cover that takes the sun away before the cover that colours it', () => {
    expect(skyCell({ low: 0, mid: 2, high: 5 })).toBe('Clear')
    expect(skyCell({ low: 0, mid: 0, high: 70 })).toBe('High cloud')
    expect(skyCell({ low: 95, mid: 20, high: 0 })).toBe('Overcast')
    expect(skyCell({ low: 40, mid: 0, high: 0 })).toBe('Some cloud')
    expect(skyCell({ low: 10, mid: 70, high: 100 })).toBe('Mostly cloudy')
    expect(skyCell({ low: 15, mid: 0, high: 20 })).toBe('A few clouds')
  })
  it('a dash when no layer was said', () => {
    expect(skyCell(null)).toBeNull()
    expect(skyCell({ low: null, mid: null, high: null })).toBeNull()
  })
})

describe('the tide cell: the next turn and which way the water is going', () => {
  it('falling to a low, rising to a high', () => {
    const at = new Date('2026-11-11T06:54:00Z')
    expect(tideCell({ kind: 'low', at }, TZ, 12)).toEqual({ text: 'Low 1:54a', going: 'falling' })
    expect(tideCell({ kind: 'high', at }, TZ, 12)).toEqual({ text: 'High 1:54a', going: 'rising' })
    expect(tideCell(null, TZ)).toBeNull()
  })
})

describe('"at 7:36 AM Wed": the strip says the time on the bar when it is not now', () => {
  const now = new Date('2026-11-11T12:36:00Z')
  it('away from now', () => {
    expect(stripWhen(new Date('2026-11-11T12:36:00Z'), new Date('2026-11-10T20:00:00Z'), TZ, 12)).toBe('at 7:36 AM Wed')
  })
  it('at now, nothing', () => {
    expect(stripWhen(new Date(now.getTime() + 60_000), now, TZ, 12)).toBeNull()
  })
  it('a short clock for a narrow cell', () => {
    expect(formatShortClock(new Date('2026-11-11T21:22:00Z'), TZ, 12)).toBe('4:22p')
    expect(formatShortClock(new Date('2026-11-11T21:22:00Z'), TZ, 24)).toBe('16:22')
  })
})

describe('the wind field fades where it ends (Batch Polish 2, Section 1)', () => {
  it('cells near the edge of the field are fainter, the far ones untouched; and it says the view is only partly covered', async () => {
    const { fadeEdges } = await import('../src/core/windViewport.ts')
    const cols = 12
    const rows = 3
    const px = new Uint8ClampedArray(cols * rows * 4)
    /* Painted in the left ten columns, nothing in the right two. */
    for (let y = 0; y < rows; y += 1) for (let x = 0; x < 10; x += 1) px[(y * cols + x) * 4 + 3] = 200
    expect(fadeEdges(px, cols, rows, 5)).toBe(true)
    const a = (x: number) => px[(1 * cols + x) * 4 + 3]
    expect(a(9)).toBe(40)
    expect(a(7)).toBe(120)
    expect(a(2)).toBe(200)
    expect(a(10)).toBe(0)
  })
  it('a field covering the whole view is left alone', async () => {
    const { fadeEdges } = await import('../src/core/windViewport.ts')
    const px = new Uint8ClampedArray(4 * 4 * 4).fill(200)
    expect(fadeEdges(px, 4, 4, 5)).toBe(false)
    expect([...px].every((v) => v === 200)).toBe(true)
  })
})
