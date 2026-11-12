import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { spotStats } from '../src/core/spotSkill.ts'
import { surfBand, surfCall } from '../src/core/surfCall.ts'
import { weekSurfRow } from '../src/core/homeDay.ts'
import { surfTag } from '../src/core/surf.ts'
import { MARINE_NAMES, BRIEF_WIND_NAMES, parseHourly } from '../src/lib/tideSheetData.ts'
import { surfNowFrom, surfWords } from '../src/lib/useSurfNow.ts'

/*
 * ONE SURF NUMBER EVERYWHERE (Batch TRUTH, Section 1). 12 Nov at the
 * Virginia Beach pier read 0–2 on the home card, 1–2 in the week list and
 * 0–3 on the Surf page's week strip (fixtures/truth/2026-11-12-vb.json).
 * The forecast for 12-18 Nov as Open-Meteo answered it on the 12th
 * (tests/data/surf-2026-11-12/), through the one call each screen reads.
 */
const marine = parseHourly(JSON.parse(readFileSync('tests/data/surf-2026-11-12/marine.json', 'utf8')), MARINE_NAMES)
const wind = parseHourly(JSON.parse(readFileSync('tests/data/surf-2026-11-12/wind.json', 'utf8')), BRIEF_WIND_NAMES)
const sea = { status: 'ready' as const, marine, wind, facing: 100, facingState: 'ok' as const, buoy: null }
const now = new Date('2026-11-12T11:56:00Z')
const read = surfNowFrom(sea, spotStats([], now.getTime()), now, 'America/New_York')

describe('the same day says the same surf on every screen', () => {
  it('home today card, week list Today and the Surf page strip and head: one range, one word', () => {
    const today = read.week[0]
    expect(today.call).not.toBeNull()
    const homeCard = surfWords(read.now)
    const weekRow = weekSurfRow(today.call, 0)
    const strip = today.call!.words
    expect(homeCard).toBe(strip)
    expect(weekRow.fact).toBe(strip)
  })
  it('tomorrow: the home\'s tomorrow card, the week list and the strip', () => {
    expect(surfWords(read.tomorrow)).toBe(read.week[1].call?.words)
    expect(weekSurfRow(read.week[1].call, 1).fact).toBe(read.week[1].call?.words)
  })
  it('every day of the week is one band wide under 4 ft', () => {
    for (const d of read.week) {
      if (d.call === null) continue
      const w = d.call.highFt - d.call.lowFt
      expect(d.call.lowFt < 4 ? w : 2).toBe(d.call.lowFt < 4 ? 1 : 2)
      expect(d.call.words).not.toMatch(/^(0–2|1–4|2–4) ft$/)
    }
  })
  it('12 Nov morning, ankle to knee and clean: Small, not Flat', () => {
    const truth = JSON.parse(readFileSync('fixtures/truth/2026-11-12-vb.json', 'utf8')) as { surf: { observed: { sizeWord: string } } }
    expect(read.week[0].call?.size).toBe(truth.surf.observed.sizeWord)
  })
})

describe('the band rule', () => {
  it('one foot under 4 ft, two from 4 ft', () => {
    expect(surfBand(0.3)).toEqual([0, 1])
    expect(surfBand(1.1)).toEqual([1, 2])
    expect(surfBand(3.9)).toEqual([3, 4])
    expect(surfBand(4.2)).toEqual([4, 6])
    expect(surfBand(5.6)).toEqual([5, 7])
  })
  it('the size word from the same centre: Flat under 0.6 ft, Small to 2.5', () => {
    expect(surfTag(0.5, 'Clean')).toBe('Flat')
    expect(surfTag(0.6, 'Clean')).toBe('Small')
    expect(surfCall({ centerFt: 1.1, shape: 'Clean', side: 'offshore' }, 0)).toMatchObject({ words: '1–2 ft', size: 'Small', wind: 'clean, offshore', confidence: 'firm' })
    expect(surfCall({ centerFt: 1.1, shape: null, side: null }, 4)?.confidence).toBe('guess')
  })
})
