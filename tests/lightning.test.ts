import { describe, expect, it } from 'vitest'
import { lightningLine, nearestStrike, stormOnMap } from '../src/core/lightning.ts'
import { destinationPoint } from '../src/core/geo.ts'
import { parseAlerts, strikeFrames, strikeUrl } from '../src/lib/stormData.ts'

const V = { lat: 36.85, lon: -75.98 }
const F = new Date('2026-07-15T23:00:00Z')

describe('lightning as a fact (Batch K, Section 2)', () => {
  it('the nearest strike cell, its direction and its frame', () => {
    const s = [
      { at: destinationPoint(V, 247.5, 12_900), frame: F },
      { at: destinationPoint(V, 90, 40_000), frame: F },
    ]
    expect(nearestStrike(V, s)?.km).toBeCloseTo(12.9, 0)
    expect(lightningLine(V, s, 'mi', () => '7:00 PM')).toBe('Lightning 8 mi WSW · 15-min map of 7:00 PM')
  })
  it('none in reach is null, never "clear"', () => {
    expect(lightningLine(V, [{ at: destinationPoint(V, 0, 300_000), frame: F }], 'mi', () => 'x')).toBeNull()
  })
  it('no countdown, no rule, no advice', () => {
    const line = lightningLine(V, [{ at: destinationPoint(V, 0, 5_000), frame: F }], 'mi', () => '7:00 PM') ?? ''
    expect(line).not.toMatch(/30|rule|shelter|inside|seconds|minutes until/i)
  })
  it('dots fade with age on the map', () => {
    const fc = stormOnMap([{ at: V, frame: F }, { at: V, frame: new Date(F.getTime() - 45 * 60_000) }], [], new Date(F.getTime() + 15 * 60_000))
    const fades = fc.features.map((f) => (f.properties as { fade: number }).fade)
    expect(fades[0]).toBe(1)
    expect(fades[1]).toBeCloseTo(0.25, 2)
  })
  it('asks four 15-minute frames, the newest a quarter hour back', () => {
    const fr = strikeFrames(new Date('2026-11-03T12:11:00Z'))
    expect(fr.map((d) => d.toISOString().slice(11, 16))).toEqual(['11:45', '11:30', '11:15', '11:00'])
  })
  it('the lightning box is the venue to a tenth of a degree', () => {
    const u = new URL(strikeUrl({ lat: 36.8435575, lon: -75.9713104 }, F))
    expect(u.searchParams.get('bbox')).toBe('35.3,-77.5,38.3,-74.5')
    expect(u.toString()).not.toMatch(/36\.84|75\.97/)
  })
  it('alerts: the official event and text', () => {
    const a = parseAlerts({ features: [{ id: 'https://api.weather.gov/alerts/urn:oid:1', properties: { event: 'Severe Thunderstorm Warning', headline: 'Severe Thunderstorm Warning issued July 15', description: 'At 702 PM EDT, a severe thunderstorm was located...', severity: 'Severe', ends: '2026-07-15T23:45:00Z', senderName: 'NWS Wakefield VA' } }] })
    expect(a[0].event).toBe('Severe Thunderstorm Warning')
    expect(a[0].url).toContain('api.weather.gov/alerts/')
  })
})

describe('the storm map stays readable', () => {
  it('eight cells at most, paths for the three listed', async () => {
    const { MAP_CELLS } = await import('../src/core/lightning.ts')
    const call = { at: V, km: 10, bearingDeg: 270, towardDeg: 90, kmh: 30, over: false, arrives: null, ends: null, passKm: null, passSide: null, passAt: null, beyond: false, sure: 'likely' as const, maxDbz: 50, borrowed: false }
    const fc = stormOnMap([], Array(20).fill(call), F)
    expect(fc.features.filter((f) => f.properties?.kind === 'cell').length).toBe(MAP_CELLS)
    expect(fc.features.filter((f) => f.properties?.kind === 'track').length).toBe(3)
  })
})
