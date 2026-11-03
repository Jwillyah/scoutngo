import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { camsForEvent, camsTowardSun, lookWords } from '../src/core/skyCams.ts'
import { waterCard, type CardDay } from '../src/core/menuCards.ts'
import { COAST_CAMS } from '../src/data/coastCams.ts'
import { beachName, nearestBeach } from '../src/lib/surfBeach.ts'

/* Batch J, Section 7: sky cams toward the sun, link out only; the Water card names its beach. */
const PIER = { lat: 36.8435575, lon: -75.9713104 }

describe('Look west now', () => {
  it('offers the nearest cams that look toward the sun, with where they are; none that look away', () => {
    /* Sunrise on 3 Nov, ESE: the Virginia Beach cams face the sea, east. */
    const rise = camsForEvent(PIER, new Date('2026-11-03T11:30:00Z'), COAST_CAMS)
    expect(rise.look).toBe('Look ESE now')
    expect(rise.cams.length).toBe(2)
    expect(new Set(rise.cams.map((c) => c.cam.name.split(',')[0])).size).toBe(rise.cams.length)
    expect(rise.cams[0].where).toBe('here')
    expect(rise.cams.every((c) => c.cam.facing !== null)).toBe(true)
    /* Sunset, WSW: no beach cam here looks that way, so none is offered. */
    expect(camsForEvent(PIER, new Date('2026-11-02T22:06:00Z'), COAST_CAMS).cams).toEqual([])
    expect(lookWords(252)).toBe('Look WSW now')
  })

  it('never offers a cam with no facing, and one link per page', () => {
    const cams = [
      { id: 'a', name: 'A', operator: 'x', at: PIER, facing: null, url: 'https://a.example/', access: 'free' as const },
      { id: 'b', name: 'B', operator: 'x', at: PIER, facing: 250, url: 'https://b.example/', access: 'free' as const },
      { id: 'c', name: 'B again', operator: 'x', at: PIER, facing: 255, url: 'https://b.example/', access: 'free' as const },
    ]
    expect(camsTowardSun(PIER, 252, cams).map((c) => c.cam.id)).toEqual(['b'])
  })

  it('is a link and nothing else on Today', () => {
    const src = readFileSync('src/components/Briefing.tsx', 'utf8')
    const row = src.slice(src.indexOf('className="bcams"'), src.indexOf('</p>', src.indexOf('className="bcams"')))
    expect(row).toContain('target="_blank" rel="noopener noreferrer"')
    expect(row).not.toMatch(/<img|<iframe|<video|fetch\(/)
  })
})

describe('the Water card names its beach', () => {
  it('the nearest known beach by default, said short', () => {
    expect(nearestBeach(PIER)?.name).toBe('Virginia Beach Pier')
    expect(beachName('Virginia Beach, North End')).toBe('Virginia Beach')
    /* Inland too: Richmond's nearest beach. */
    expect(nearestBeach({ lat: 37.54, lon: -77.43 })).not.toBeNull()
  })

  it('"Surf · <beach>" on the card, with the beach\'s own low tide', () => {
    const day = { index: 0, events: { sunrise: null, sunset: null }, verdicts: { sunrise: null, sunset: null }, reads: { sunrise: null, sunset: null }, call: null, surf: [{ at: new Date('2026-11-02T15:00:00Z'), faceFt: 1, clean: true }], surfTag: 'Fun', surfClean: true, windTag: 'Offshore', wind: [], tide: { next: null, marks: [{ at: new Date('2026-11-02T22:09:00Z'), kind: 'low' as const }] } } as CardDay
    const w = waterCard(day, new Date('2026-11-02T16:00:00Z'), () => '5:09 PM', 'Sandbridge')
    expect(w.sub).toBe('Surf · Sandbridge · small · low 5:09 PM')
    expect(waterCard(null, new Date(), () => '', 'Sandbridge').sub).toBe('Surf · Sandbridge · no sea forecast')
  })
})
