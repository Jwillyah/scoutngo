import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { beachFactorAt } from '../core/beachFactor.ts'
import { buoyFaceFt } from '../core/spotSkill.ts'
import { nearestBuoys, type BuoyReading } from '../lib/buoy.ts'
import { travelWords } from '../lib/buoyPageWords.ts'
import type { Hourly } from '../lib/tideSheetData.ts'
import { DEFAULT_UNITS } from '../lib/units.ts'
import { BuoysBody, BuoysHow } from './BuoysPageV2.tsx'

/*
 * THE BUOYS PAGE v2 (Batch N, Section 4; board docs/mockups/Detail2B.png) at
 * the Virginia Beach pier, from NDBC's files as published on 2 Nov 2026, and
 * a marine forecast fixture (not an observation) for the comparison line.
 * tests/swellTravel.test.ts holds LATEST to the files themselves.
 */
const PIER = { lat: 36.8436, lon: -75.9713 }
const TZ = 'America/New_York'
const UNITS = { ...DEFAULT_UNITS, clock: 12 as const }

/* The newest line of each file in tests/data/ndbc-2026-11-02/<id>.txt: time, WVHT, DPD, MWD. */
const LATEST: Record<string, { at: string; waveM: number; periodS: number; fromDeg: number }> = {
  '44099': { at: '2026-11-02T16:56:00Z', waveM: 0.7, periodS: 8, fromDeg: 106 },
  '44100': { at: '2026-11-02T16:30:00Z', waveM: 0.9, periodS: 8, fromDeg: 95 },
  '44056': { at: '2026-11-02T16:00:00Z', waveM: 0.9, periodS: 9, fromDeg: 90 },
}

const readings: BuoyReading[] = nearestBuoys(PIER, 3, 100).map((buoy) => {
  const r = LATEST[buoy.id]
  return { status: 'ok', buoy, at: new Date(r.at), waveM: r.waveM, periodS: r.periodS, fromDeg: r.fromDeg, split: null }
})

const marine = (waveM: number): Hourly => {
  const t0 = Date.parse('2026-11-02T12:00:00Z')
  const times = Array.from({ length: 12 }, (_, i) => t0 + i * 3_600_000)
  return { times, values: { wave_height: times.map(() => waveM) } }
}

const html = (props: Partial<Parameters<typeof BuoysBody>[0]> = {}) =>
  renderToStaticMarkup(<BuoysBody venue={PIER} placeName="Sandbridge" timeZone={TZ} units={UNITS} buoys={readings} marine={marine(0.7)} marineFailed={false} {...props} />)
const render = (props: Partial<Parameters<typeof BuoysBody>[0]> = {}) => html(props).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

const NEVER = /\b(safe|clear|all clear|no hazard)/i

describe('the Buoys page v2', () => {
  it('headline: Near <spot>, the biggest reading (44100, 0.9 m = 3.0 ft), its period and direction', () => {
    expect(render()).toMatch(/^ ?Near Sandbridge 3\.0 ft biggest reading · 8 s from the E /)
  })

  it('the list: each buoy and its time; a travel time only for Cape Henry (Duck’s waves head west, past the pier)', () => {
    const text = render()
    expect(text).toContain('Cape Henry 44099 2.3 ft · 8 s · from ESE · 11:56 AM')
    expect(text).toContain('44100')
    expect(text).toContain('44056')
    expect(text.match(/to reach you/g)?.length).toBe(1)
    expect(text).toContain('~1 h 3 min to reach you')
    expect(text).toContain('Travel time from swell period and distance · NDBC')
  })

  it('the map: a few Esri imagery tiles, a pin and a dotted path per buoy, "id · height · period" pills', () => {
    const h = html()
    const tiles = h.match(/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\/\d+\/\d+\/\d+/g) ?? []
    expect(tiles.length).toBeGreaterThan(0)
    expect(tiles.length).toBeLessThanOrEqual(6)
    expect(h.match(/class="dbuoy__path[ "]/g)?.length).toBe(3)
    expect(h.match(/class="dbuoy__pin[ "]/g)?.length).toBe(3)
    expect(h.match(/dbuoy__path--off/g)?.length).toBe(2)
    expect(h).toContain('44056 · 3.0 ft · 9 s')
    expect(h).toContain('44099 · 2.3 ft · 8 s')
  })

  it('against the forecast: as forecast, smaller, bigger, and what it says when it cannot compare', () => {
    expect(render()).toContain('Running about as forecast · 44099 2.3 ft, forecast 2.3 ft')
    expect(render({ marine: marine(1.2) })).toContain('Running smaller than forecast · 44099 2.3 ft, forecast 3.9 ft')
    expect(render({ marine: marine(0.3) })).toContain('Running bigger than forecast')
    expect(render({ marine: 'inland' })).toContain('No sea forecast here to compare')
    expect(render({ marine: null, marineFailed: true })).toContain('The sea forecast didn’t load')
    const outside = { times: [Date.parse('2026-11-05T00:00:00Z')], values: { wave_height: [1] } }
    expect(render({ marine: outside })).toContain('The forecast did not say for 11:56 AM')
  })

  it('one buoy→beach number: the faces line is buoyFaceFt at the beach facing, the Surf page’s own function', () => {
    const b = readings[0] as Extract<BuoyReading, { status: 'ok' }>
    const ft = buoyFaceFt({ waveM: b.waveM, periodS: b.periodS, fromDeg: b.fromDeg }, 80, beachFactorAt(PIER))
    expect(ft).not.toBeNull()
    expect(render({ facing: 80 })).toContain(`${b.buoy.id} as faces at this beach ≈ ${(ft as number).toFixed(1)} ft`)
    /* No facing yet: no faces number, and the model's height is never called "beach". */
    expect(render()).not.toContain('as faces at this beach')
    expect(render({ facing: 80 })).not.toMatch(/, beach \d/)
  })

  it('no buoy: a dash and the reason, no number', () => {
    const text = render({ buoys: [{ status: 'none', reason: 'No NDBC buoy within 150 km on this water.' }] })
    expect(text).toContain('—')
    expect(text).toContain('No NDBC buoy within 150 km')
    expect(text).not.toMatch(/\d ft/)
  })

  it('metres when asked', () => {
    expect(render({ units: { ...UNITS, distance: 'm' } })).toContain('0.9 m')
  })

  it('no monospace class, and never says safe or clear, on the page or under How we got this', () => {
    expect(html()).not.toMatch(/class="[^"]*\bnum\b/)
    expect(render()).not.toMatch(NEVER)
    const how = renderToStaticMarkup(<BuoysHow venue={PIER} buoys={readings} units={UNITS} />)
    expect(how).not.toMatch(NEVER)
    expect(how).toContain('g·T / 4π')
    expect(how).toContain('45°')
    expect(how).toContain('44099')
  })

  it('travel words', () => {
    expect(travelWords(40.4)).toBe('~40 min')
    expect(travelWords(85)).toBe('~1 h 25 min')
    expect(travelWords(120)).toBe('~2 h')
  })
})
