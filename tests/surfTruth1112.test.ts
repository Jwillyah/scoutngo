import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { windTag } from '../src/core/briefing.ts'
import { windSide } from '../src/core/coastFacing.ts'
import { sideWords } from '../src/core/homeDay.ts'
import { spotStats } from '../src/core/spotSkill.ts'
import { surfShape, towardBeachM } from '../src/core/surf.ts'
import { dialSectors } from '../src/core/windDial.ts'
import { BRIEF_WIND_NAMES, MARINE_NAMES, parseHourly } from '../src/lib/tideSheetData.ts'
import { surfNowFrom } from '../src/lib/useSurfNow.ts'

/*
 * SURF PHYSICS AGAINST 12 NOV (Batch TRUTH, Section 2). The field truth is
 * fixtures/truth/2026-11-12-vb.json; the forecast as kept that day is
 * tests/data/surf-2026-11-12/.
 */
const truth = JSON.parse(readFileSync('fixtures/truth/2026-11-12-vb.json', 'utf8')) as { place: { facingDeg: number }; windObs: { deg: number }[] }
const FACING = truth.place.facingDeg
const KT = 0.514444

describe('the wind to the beach in five', () => {
  it('SSW 200° at a beach facing 100° is cross-offshore; NW at Virginia Beach is offshore', () => {
    expect(windSide(200, FACING)).toBe('cross-offshore')
    expect(windSide(315, FACING)).toBe('offshore')
    expect(windTag(315, FACING)).toBe('Offshore')
    expect(sideWords(windTag(200, FACING)!)).toBe('cross-offshore')
    /* Every wind the stations read that morning was cross-offshore at this beach. */
    for (const o of truth.windObs) expect(windSide(o.deg, FACING)).toBe('cross-offshore')
  })
  it('the five, in order round from the sea', () => {
    expect([100, 150, 190, 230, 280].map((d) => windSide(d, FACING))).toEqual(['onshore', 'cross-onshore', 'cross-shore', 'cross-offshore', 'offshore'])
  })
  /* Batch DRONE, Section 1: the line moved from 12 kt to 8 (16 Nov, 8.8 kt NNW was wind-chop, not clean); 12 Nov's 4-7 kt stays clean. */
  it('cross-offshore under 8 kt reads clean, not bumpy; at 8 kt and up, bumpy', () => {
    expect(surfShape(7 * KT, 210, FACING)).toBe('Clean')
    expect(surfShape(7.9 * KT, 210, FACING)).toBe('Clean')
    expect(surfShape(8 * KT, 210, FACING)).toBe('Bumpy')
    expect(surfShape(8 * KT, 190, FACING)).toBe('Bumpy')
  })
  it('the dial\'s wedges are the same five bands', () => {
    expect(new Set(dialSectors(FACING).map((s) => s.kind))).toEqual(new Set(['onshore', 'cross-onshore', 'cross-shore', 'cross-offshore', 'offshore']))
  })
})

describe('wind sea blown off the land never reaches the beach', () => {
  /* Batch LIVE, Section 9A: a taper, not a cut: the wind sea's share by the spread cos² of its angle (src/core/surf.ts reachShare). */
  it('a wind sea blowing off the land comes out of the height; one from the sea stays, nearly whole', () => {
    expect(towardBeachM(1, 0.8, 315, FACING)).toBeCloseTo(0.6, 5)
    expect(towardBeachM(1, 0.8, 120, FACING)).toBeGreaterThan(0.95)
    expect(towardBeachM(1, 0.8, 0, FACING)).toBeGreaterThan(0.6)
    expect(towardBeachM(1, 0.8, 0, FACING)).toBeLessThan(1)
    expect(towardBeachM(1, null, 315, FACING)).toBe(1)
  })
  it('Fri 13 Nov, NW wind: no longer the 1–4 ft the screens said; Small at most', () => {
    const marine = parseHourly(JSON.parse(readFileSync('tests/data/surf-2026-11-12/marine.json', 'utf8')), MARINE_NAMES)
    const wind = parseHourly(JSON.parse(readFileSync('tests/data/surf-2026-11-12/wind.json', 'utf8')), BRIEF_WIND_NAMES)
    const now = new Date('2026-11-12T11:56:00Z')
    const read = surfNowFrom({ status: 'ready', marine, wind, facing: FACING, facingState: 'ok', buoy: null }, spotStats([], now.getTime()), now, 'America/New_York')
    const fri = read.week.find((d) => d.date === '2026-11-13')?.call
    expect(fri).toBeDefined()
    expect(fri!.highFt - fri!.lowFt).toBe(1)
    expect(['Flat', 'Small']).toContain(fri!.size)
  })
})
