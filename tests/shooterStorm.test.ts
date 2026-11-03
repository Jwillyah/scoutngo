import { describe, expect, it } from 'vitest'
import { getTimes } from 'suncalc'
import { clearingLight, lightningView, rainbowWindow, shelfLikely, shooterLines, sunAzimuth } from '../src/core/shooterStorm.ts'
import { destinationPoint } from '../src/core/geo.ts'
import type { CellCall } from '../src/core/stormCells.ts'

const V = { lat: 36.85, lon: -75.98 }
const DAY = new Date('2026-07-15T12:00:00Z')
const SUNSET = getTimes(DAY, V.lat, V.lon).sunset as Date
const cell = (o: Partial<CellCall>): CellCall => ({ at: V, km: 0, bearingDeg: 0, towardDeg: 90, kmh: 30, over: false, arrives: null, ends: null, passKm: null, passSide: null, passAt: null, beyond: false, sure: 'likely', maxDbz: 45, borrowed: false, ...o })
const hhmm = (d: Date) => d.toISOString().slice(11, 16)

describe('storms in shooter terms (Batch K, Section 4)', () => {
  it('a storm over you that moves off east and ends 10 min before sunset: dramatic light toward the sun', () => {
    const scan = new Date(SUNSET.getTime() - 50 * 60_000)
    const over = cell({ over: true, ends: new Date(SUNSET.getTime() - 10 * 60_000), towardDeg: 90 })
    const c = clearingLight(V, [over], scan)
    expect(c).not.toBeNull()
    expect(c?.look).toMatch(/W/)
    expect(shooterLines(V, [over], [], scan, hhmm, 'mi')[0]).toMatch(/^Storm clears by \d\d:\d\d, sunset \d\d:\d\d: dramatic light possible toward the W/)
  })
  it('not when another cell sits on the sun\u2019s line at sunset', () => {
    const scan = new Date(SUNSET.getTime() - 50 * 60_000)
    const sunAz = sunAzimuth(SUNSET, V)
    const blocker = cell({ at: destinationPoint(V, sunAz, 40_000), towardDeg: null, kmh: 0, km: 40 })
    expect(clearingLight(V, [cell({ over: true, ends: new Date(SUNSET.getTime() - 10 * 60_000) }), blocker], scan)).toBeNull()
  })
  it('a shower opposite a low sun is a rainbow window, toward the antisolar side', () => {
    const scan = new Date(SUNSET.getTime() - 80 * 60_000)
    const anti = (sunAzimuth(scan, V) + 180) % 360
    const shower = cell({ at: destinationPoint(V, anti, 12_000), towardDeg: null, kmh: 0, km: 12 })
    const b = rainbowWindow(V, [shower], scan)
    expect(b).not.toBeNull()
    expect(b?.look).toMatch(/E/)
  })
  it('no rainbow at noon in July (the sun above 42°)', () => {
    const noon = new Date('2026-07-15T17:00:00Z')
    const anti = (sunAzimuth(noon, V) + 180) % 360
    expect(rainbowWindow(V, [cell({ at: destinationPoint(V, anti, 12_000), towardDeg: null, kmh: 0 })], new Date(noon.getTime() - 100 * 60_000 + 100 * 60_000))).toBeNull()
  })
  it('shelf cloud: a strong, fast cell arriving within the hour', () => {
    const scan = DAY
    expect(shelfLikely([cell({ arrives: new Date(scan.getTime() + 30 * 60_000), maxDbz: 55, kmh: 40, bearingDeg: 250 })], scan)?.look).toBe('WSW')
    expect(shelfLikely([cell({ arrives: new Date(scan.getTime() + 30 * 60_000), maxDbz: 45, kmh: 40 })], scan)).toBeNull()
  })
  it('lightning in view only after dusk, and not too near to frame', () => {
    const night = new Date(SUNSET.getTime() + 60 * 60_000)
    const s = [{ at: destinationPoint(V, 270, 40_000), frame: night }, { at: destinationPoint(V, 0, 3_000), frame: night }]
    expect(lightningView(V, s, night)?.look).toBe('W')
    expect(lightningView(V, s, DAY)).toBeNull()
  })
  it('conditions, never instructions', () => {
    const scan = new Date(SUNSET.getTime() - 50 * 60_000)
    for (const l of shooterLines(V, [cell({ over: true, ends: new Date(SUNSET.getTime() - 10 * 60_000) })], [], scan, hhmm, 'mi')) expect(l).not.toMatch(/\b(go|get|head|shoot now|stay|move)\b/i)
  })
})
