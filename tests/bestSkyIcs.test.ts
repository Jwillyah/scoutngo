import { describe, expect, it } from 'vitest'
import type { RankedSpot } from '../src/core/bestSky.ts'
import { BEST_SKY_NOTE, bestSkyIcs, bestSkyIcsFilename, remindAt, REMIND_BEFORE_MIN } from '../src/core/bestSkyIcs.ts'
import { gridSummary } from '../src/core/bestSkyWords.ts'

/* "REMIND ME 4:30" AND THE LIST'S LINE (Batch BEST SKY, Section 4; board BestSky_Card). */
const input = { kind: 'sunset' as const, spotName: 'Lynnhaven Inlet', word: 'Likely', setUp: new Date('2026-11-11T21:41:00Z'), colorFrom: new Date('2026-11-11T21:51:00Z'), colorTo: new Date('2026-11-11T22:13:00Z'), stamp: new Date('2026-11-11T21:00:00Z') }

describe('the reminder file, made on the phone', () => {
  it('runs from set up to the end of the colour, rings 10 min before set up, says it is no promise', () => {
    const f = bestSkyIcs(input)
    expect(f).toContain('DTSTART:20261111T214100Z')
    expect(f).toContain('DTEND:20261111T221300Z')
    expect(f).toContain(`TRIGGER:-PT${REMIND_BEFORE_MIN}M`)
    expect(f).toContain('SUMMARY:Sunset color · Lynnhaven Inlet')
    expect(f.replace(/\r\n /g, '')).toContain(BEST_SKY_NOTE.replace(/,/g, '\\,').replace(/;/g, '\\;'))
    expect(f.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
    expect(remindAt(input.setUp).toISOString()).toBe('2026-11-11T21:31:00.000Z')
    expect(bestSkyIcsFilename(input)).toBe('scoutngo-sunset-color-2026-11-11.ics')
  })
  it('carries no coordinate: the spot by its name only', () => {
    expect(bestSkyIcs(input)).not.toMatch(/GEO:|\d+\.\d{3,}/)
  })
})

describe('what the grid says, in a line', () => {
  const r = (name: string, why0: string) => ({ spot: { id: name, name, at: { lat: 0, lon: 0 }, facing: null, openDeg: 0, water: false, silhouette: null }, score: 0, word: 'Little', view: '', why: [why0], seesSun: false, tie: { aimDeg: 0, inView: 0, water: false, km: null } }) as RankedSpot
  it('one patch, clear elsewhere; all clear; nothing in reach', () => {
    expect(gridSummary([r('Lynnhaven Inlet', 'patch overhead'), r('VB Pier', 'clear sky')])).toBe('cloud over Lynnhaven Inlet · clear elsewhere')
    expect(gridSummary([r('VB Pier', 'clear sky')])).toBe('clear everywhere in reach')
    expect(gridSummary([])).toBe('')
  })
})
