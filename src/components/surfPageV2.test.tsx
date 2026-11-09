import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { correctedRange, type SkillSample, type SpotStats } from '../core/spotSkill.ts'
import { surfEstimate } from '../core/surf.ts'
import { rangeWords, SURF_SPREAD_SOURCE } from '../core/surfRange.ts'
import type { SkyCam } from '../core/skyCams.ts'
import type { BuoyReading } from '../lib/buoy.ts'
import type { Hourly } from '../lib/tideSheetData.ts'
import type { SurfSea } from '../lib/useSurfSea.ts'
import { SurfBody, SurfHow, type SurfBodyProps } from './SurfPageV2.tsx'

/*
 * A FIXTURE SEA, NOT AN OBSERVATION: a steady east swell on an east-facing
 * beach (Virginia Beach's facing, about 100°) with a light west (offshore)
 * wind, the week from 2 Nov 2026, so the page has every card to draw.
 */
const SPOT = { lat: 36.85, lon: -75.97 }
const FACING = 100
const START = Date.UTC(2026, 10, 2, 0)
const HOURS = 24 * 8
const times = Array.from({ length: HOURS }, (_, i) => START + i * 3_600_000)
const flat = (v: number) => times.map(() => v)
const SWELL_M = 0.6
const SWELL_S = 8
const WAVE_M = 0.8
const WAVE_S = 7
const marine: Hourly = {
  times,
  values: {
    swell_wave_height: flat(SWELL_M),
    swell_wave_period: flat(SWELL_S),
    swell_wave_direction: flat(100),
    wave_height: flat(WAVE_M),
    wave_period: flat(WAVE_S),
    wave_direction: flat(100),
    wind_wave_height: flat(0.3),
  },
}
const wind: Hourly = {
  times,
  values: { wind_speed_10m: flat(2), wind_direction_10m: flat(270) },
}
const buoy: BuoyReading = {
  status: 'ok',
  buoy: {
    id: '44099',
    name: 'Cape Henry, VA',
    at: { lat: 36.92, lon: -75.72 },
    km: 24,
  },
  at: new Date('2026-11-02T14:56:00Z'),
  waveM: 0.7,
  periodS: 8,
  fromDeg: 100,
  split: null,
}
const NONE: SpotStats = { n: 0, biasFt: null, spreadFt: null, days: 0 }
const kept: SkillSample[] = [{ at: Date.UTC(2026, 10, 2, 12), forecastFt: 2, buoyFt: 2.2, rating: null }]
const sea: SurfSea = {
  status: 'ready',
  marine,
  wind,
  facing: FACING,
  facingState: 'ok',
  buoy,
}
const cam: SkyCam = {
  cam: {
    id: 'c1',
    name: 'Virginia Beach, 31st St',
    operator: 'x',
    at: SPOT,
    facing: 100,
    url: 'https://example.invalid/cam',
    access: 'free',
  },
  km: 0.4,
  where: 'here',
}
const NOW = new Date('2026-11-02T15:10:00Z')

const props = (over: Partial<SurfBodyProps> = {}): SurfBodyProps => ({
  now: NOW,
  timeZone: 'America/New_York',
  spot: SPOT,
  spotName: 'Virginia Beach',
  miles: true,
  away: null,
  sea,
  stats: NONE,
  kept,
  shoot: false,
  cam,
  ...over,
})
const render = (over: Partial<SurfBodyProps> = {}) => renderToStaticMarkup(<SurfBody {...props(over)} />)
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

describe('Surf page v2 (Batch N, Section 1)', () => {
  it('heads with a range, the one computed from the forecast and the band, never one number', () => {
    /* Worked out here from the fixture, not read back from the page's own helper. */
    const swellFace = surfEstimate(SWELL_M, SWELL_S, 100, FACING).faceFt
    const wholeFace = surfEstimate(WAVE_M, WAVE_S, 100, FACING).faceFt
    const want = rangeWords(correctedRange(swellFace, Math.abs(swellFace - wholeFace), NONE))
    const html = render()
    const big = /<p class="dhead__big" data-shared="surf">([^<]*)<\/p>/.exec(html)?.[1]
    expect(big).toBe(want)
    expect(big).toMatch(/^\d+–\d+ ft$/)
    expect(text(html)).toMatch(/Virginia Beach · now .*clean, offshore · 8 s/)
  })

  it('draws the band, the line, the clean stretch, now, and the buoy readings as dots', () => {
    const html = render()
    expect(html).toContain('class="dsurf__band"')
    expect(html).toContain('class="dsurf__fline"')
    expect(html).toContain('class="dsurf__clean"')
    expect(html).toContain('class="dsurf__now"')
    /* The kept 7 AM check and the live 9:56 AM reading. */
    expect(html.match(/class="dsurf__dot"/g)?.length).toBe(2)
    expect(text(html)).toContain('forecast likely range buoy readings')
  })

  it('says the buoy against the forecast, its name, number and time', () => {
    const t = text(render())
    expect(t).toMatch(/Buoy reads \d+\.\d ft · 8 s/)
    expect(t).toMatch(/Cape Henry 44099 · 9:56 AM · (in line with|bigger than|smaller than) forecast/)
  })

  it('shows the cam as a link out, and no card without one', () => {
    expect(render()).toContain('href="https://example.invalid/cam"')
    expect(text(render())).toContain('See it yourself Virginia Beach, 31st St · 0.2 mi · faces E')
    expect(text(render({ cam: null }))).not.toContain('See it yourself')
  })

  it('seven days, each with a range, the last four faded', () => {
    const html = render()
    expect(html.match(/class="dsurf__day( dsurf__day--later)?"/g)?.length).toBe(7)
    expect(html.match(/dsurf__day--later/g)?.length).toBe(4)
    expect(html.match(/class="dsurf__drange">\d+–\d+</g)?.length).toBe(7)
  })

  it('the light on the face only for Shoot', () => {
    expect(text(render({ shoot: true }))).toContain('Light on the face')
    expect(text(render({ shoot: false }))).not.toContain('Light on the face')
  })

  it('names the nearest surf beach when the venue is not on one', () => {
    expect(
      text(
        render({
          away: { name: 'Virginia Beach', far: '12 mi' },
          spotName: 'Virginia Beach',
        }),
      ),
    ).toContain('nearest surf beach, 12 mi')
  })

  it('a dash and the fact, never a number, with no forecast', () => {
    const t = text(render({ sea: { ...sea, status: 'ready', marine: null } }))
    expect(t).toContain('—')
    expect(t).toContain("The sea forecast didn't load · retrying")
    expect(t).not.toMatch(/\d+–\d+ ft/)
  })

  it('never calls the water safe or clear, in any state', () => {
    const all = [render(), render({ shoot: true }), render({ sea: { ...sea, marine: null } }), renderToStaticMarkup(<SurfHow sea={sea} stats={NONE} away={null} placeName="Here" />)]
    for (const html of all) expect(text(html)).not.toMatch(/\b(safe|clear|clears|all clear)\b/i)
  })

  it('how we got this: the model, the buoy check, the spread source and this spot record', () => {
    const t = text(renderToStaticMarkup(<SurfHow sea={sea} stats={NONE} away={null} placeName="Here" />))
    expect(t).toContain('Open-Meteo Marine')
    expect(t).toContain('NDBC 44099')
    expect(t).toContain(SURF_SPREAD_SOURCE)
    expect(t).toContain('This spot: no history here yet')
  })
})
