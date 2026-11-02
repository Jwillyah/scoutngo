import { readFileSync } from 'node:fs'
import { getPosition } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { FOG_LIGHT_DEG, MAX_WINDOW_H, shootable, type Special } from '../src/core/specialLight.ts'
import { parseSpecial, parseThin, specialsFrom } from '../src/lib/specialLightData.ts'

/*
 * SPECIAL LIGHT, ONLY SHOOTABLE WINDOWS (Batch G, Section 5). The week from
 * 2 Nov at the Virginia Beach Fishing Pier, Open-Meteo's answers kept by
 * scripts/measure-special-week.mjs. Under the old rules that week read a
 * rainbow 7 AM–5 PM on Thu 5 Nov and fog 4 PM–9 AM and 10 PM–10 AM
 * (measurements/2026-11-02-special-week.md); the replay under these rules is
 * measurements/2026-11-02-special-week-replay.md.
 */
const FX = JSON.parse(readFileSync('tests/data/special-2026-11-02.json', 'utf8')) as { venue: { lat: number; lon: number }; week: unknown; thin: unknown; marine: { hourly: { time: string[]; sea_surface_temperature: (number | null)[] } } }
const week = parseSpecial(FX.week)!
const thin = parseThin(FX.thin, week.hours)
const sea = new Map(FX.marine.hourly.time.map((t, i) => [new Date(`${t}:00Z`).getTime(), FX.marine.hourly.sea_surface_temperature[i]]))
const list = specialsFrom({ ...week, thin }, FX.venue, (t) => sea.get(t.getTime()) ?? null)
const hours = (s: Special) => (s.to.getTime() - s.from.getTime()) / 3_600_000
const sunAt = (d: Date) => getPosition(d, FX.venue.lat, FX.venue.lon).altitude

describe('the 2 Nov week', () => {
  it('has windows to show at all', () => {
    expect(list.length).toBeGreaterThan(5)
  })

  it('no window longer than two hours: no eleven-hour rainbow', () => {
    for (const s of list) expect(hours(s), `${s.kind} ${s.from.toISOString()}`).toBeLessThanOrEqual(MAX_WINDOW_H)
    const rainbows = list.filter((s) => s.kind === 'rainbow')
    expect(rainbows.every((s) => hours(s) <= 2)).toBe(true)
  })

  it('no overnight fog: every hour of a fog window is in the light', () => {
    const fog = list.filter((s) => s.kind === 'fog')
    expect(fog.length).toBeGreaterThan(0)
    for (const s of fog) for (let t = s.from.getTime(); t < s.to.getTime(); t += 3_600_000) expect(sunAt(new Date(t)), s.from.toISOString()).toBeGreaterThan(FOG_LIGHT_DEG)
  })

  it('a rainbow only with the sun under 42° and up', () => {
    for (const s of list.filter((x) => x.kind === 'rainbow')) for (let t = s.from.getTime(); t < s.to.getTime(); t += 3_600_000) {
      expect(sunAt(new Date(t))).toBeGreaterThan(0)
      expect(sunAt(new Date(t))).toBeLessThan(42)
    }
  })
})

describe('shootable, by hand', () => {
  const h = (n: number) => new Date(Date.UTC(2026, 10, 5, n))
  const hrs = Array.from({ length: 16 }, (_, i) => h(i))
  it('fog sitting through the night is said where it lifts in the light, not 7 PM–9 AM', () => {
    /* Yes from hour 2 to hour 13; light from hour 11. */
    const sun = hrs.map((_, i) => (i >= 11 ? 5 * (i - 10) : -30))
    const w = shootable('fog', hrs, [hrs.map((_, i) => i >= 2 && i <= 13)], sun, () => '')
    expect(w.map((s) => [s.from.getUTCHours(), s.to.getUTCHours()])).toEqual([[12, 14]])
  })
  it('fog forming in the evening light is said where it forms', () => {
    const sun = hrs.map((_, i) => 20 - 6 * i)
    const w = shootable('fog', hrs, [hrs.map((_, i) => i >= 1)], sun, () => '')
    expect(w.map((s) => [s.from.getUTCHours(), s.to.getUTCHours()])).toEqual([[1, 3]])
  })
  it('a long run of anything else gives its best two hours, the most models first, then the lower sun', () => {
    const sun = hrs.map((_, i) => 10 + i * 2)
    const a = hrs.map((_, i) => i >= 2 && i <= 12)
    const b = hrs.map((_, i) => i >= 6 && i <= 7)
    expect(shootable('rays', hrs, [a, b], sun, () => '').map((s) => [s.from.getUTCHours(), s.to.getUTCHours(), s.agree])).toEqual([[6, 8, 2]])
    expect(shootable('rainbow', hrs, [a], sun, () => '').map((s) => [s.from.getUTCHours(), s.to.getUTCHours()])).toEqual([[2, 4]])
  })
})
