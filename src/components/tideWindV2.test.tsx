import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { sunriseOn } from '../core/sunrise.ts'
import { curveFromExtremes, type TideExtreme } from '../core/tide.ts'
import { summarise } from '../core/windModels.ts'
import type { Hourly } from '../lib/tideSheetData.ts'
import type { TideInfo } from '../lib/useTide.ts'
import type { TideSheetData } from '../lib/useTideSheet.ts'
import { DEFAULT_UNITS } from '../lib/units.ts'
import type { WindModels } from '../lib/windModelsData.ts'
import { TideContent, TideHow } from './TidePageV2.tsx'
import { Dial, WindContent, WindHow, type WindData } from './WindPageV2.tsx'

/*
 * THE TIDE AND WIND PAGES v2, RENDERED FROM FIXTURES (Batch N, Sections 2-3).
 * The shell (DetailShell) is a portal and does not render on the server, so
 * the page bodies and their "How we got this" are rendered here directly.
 * The numbers are fixtures, not observations: a semidiurnal tide, a sea at
 * 16 °C, a wind from the WNW turning ESE by the afternoon at a beach facing
 * east.
 */
const NY = 'America/New_York'
const VB = { lat: 36.85, lon: -75.98 }
const NOW = new Date('2026-11-02T15:00:00Z') // 10:00 AM in Virginia Beach

const T0 = Date.UTC(2026, 10, 1, 0, 30)
const STEP = (6 * 60 + 12) * 60_000
const EXTREMES: TideExtreme[] = Array.from({ length: 16 }, (_, i) => ({ at: new Date(T0 + i * STEP), feet: i % 2 === 0 ? 3.9 : 0.3, kind: i % 2 === 0 ? ('high' as const) : ('low' as const) }))
const TIDE: TideInfo = {
  status: 'ok',
  station: { id: '8639348', name: 'Sandbridge', at: { lat: 36.75, lon: -75.94 }, state: 'VA' },
  distanceKm: 3.2,
  distant: false,
  predictions: { extremes: EXTREMES, curve: curveFromExtremes(EXTREMES), curveSource: 'derived', provenance: { kind: 'live' } },
}

const hours = Array.from({ length: 240 }, (_, i) => Date.UTC(2026, 10, 1) + i * 3_600_000)
const hourly = (values: Record<string, (number | null)[]>): Hourly => ({ times: hours, values })
const DATA: TideSheetData = {
  facing: { value: { facing: 90, byCircle: 90, byNearest: 92 }, savedAt: null, status: 'ready' },
  month: { value: EXTREMES, savedAt: null, status: 'ready' },
  wind: { value: hourly({ wind_speed_10m: hours.map(() => 1.5), wind_direction_10m: hours.map(() => 270) }), savedAt: null, status: 'ready' },
  marine: { value: hourly({ sea_surface_temperature: hours.map(() => 16) }), savedAt: null, status: 'ready' },
  seaM: { value: 100, savedAt: null, status: 'ready' },
  buoy: null,
  buoys: null,
  surf: false,
}

const BANNED = /\b(safe|clear|legal|wear|should|must)\b/i

describe('TideContent', () => {
  const html = renderToStaticMarkup(<TideContent now={NOW} tide={TIDE} data={DATA} venue={VB} placeName="Sandbridge" timeZone={NY} units={DEFAULT_UNITS} />)
  it('opens with the spot, the direction, the height and the next turn with its countdown', () => {
    expect(html).toContain('Sandbridge · now')
    /* 10:00 AM: the high at 1 Nov 00:30 UTC + 6 x 6 h 12 min = 2 Nov 13:42 UTC, 8:42 AM local; the next low is 2:54 PM local. */
    expect(html).toContain('>Falling<')
    expect(html).toMatch(/data-tide-headline="true"[^>]*>\d\.\d ft · low 2:54 PM · 4 h 54 min</)
  })
  it('draws the day with night shaded, now, and the turns labelled', () => {
    expect(html).toContain('class="dtide__night"')
    expect(html).toContain('data-now')
    expect(html).toContain('>now<')
    expect(html).toContain('>8:42 AM<')
    expect(html).toContain('>3.9 ft<')
  })
  it('has the four tiles', () => {
    expect(html).toContain('Next low')
    expect(html).toContain('>2:54 PM<')
    expect(html).toContain('Next high')
    expect(html).toContain('Range today')
    expect(html).toContain('>3.6 ft<')
    expect(html).toMatch(/moon \d+%/)
    expect(html).toContain('>61°F<')
    expect(html).toContain('4/3 typical')
  })
  it('counts mirror mornings from the one function, and says the rule', () => {
    expect(html).toContain('Mirror mornings')
    expect(html).toContain('low tide within 90 min of sunrise, light wind')
  })
  it('names the days when a low lands on sunrise in light wind', () => {
    const rise = (d: string) => sunriseOn(d, VB.lat, VB.lon, NY) as Date
    const lows: TideExtreme[] = ['2026-11-05', '2026-11-06'].map((d) => ({ at: new Date(rise(d).getTime() + 20 * 60_000), feet: 0.2, kind: 'low' }))
    const withMirror = renderToStaticMarkup(<TideContent now={NOW} tide={TIDE} data={{ ...DATA, month: { value: lows, savedAt: null, status: 'ready' } }} venue={VB} placeName="Sandbridge" timeZone={NY} units={DEFAULT_UNITS} />)
    expect(withMirror).toContain('Mirror mornings · Thu, Fri')
  })
  it('says a dash and why when there is no station, never a number', () => {
    const none = renderToStaticMarkup(<TideContent now={NOW} tide={{ status: 'no-station', nearestKm: 140, nearestName: 'Far Point' }} data={DATA} venue={VB} placeName="Inland" timeZone={NY} units={DEFAULT_UNITS} />)
    expect(none).toContain('>—<')
    expect(none).toContain('Far Point')
  })
  it('says the water is not known, and that it is asking again, when the sea forecast did not load (Batch Map A4)', () => {
    const dry = renderToStaticMarkup(<TideContent now={NOW} tide={TIDE} data={{ ...DATA, marine: { value: null, savedAt: null, status: 'failed' } }} venue={VB} placeName="Sandbridge" timeZone={NY} units={DEFAULT_UNITS} />)
    expect(dry).toContain('sea forecast didn’t load · retrying')
  })
  it('instructs nothing and promises nothing', () => {
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(BANNED)
  })
})

describe('TideHow', () => {
  const html = renderToStaticMarkup(<TideHow tide={TIDE} data={DATA} units={DEFAULT_UNITS} />)
  it('names the station, the datum, predictions not observations, and the sea source', () => {
    expect(html).toContain('NOAA 8639348, Sandbridge')
    expect(html).toContain('MLLW')
    expect(html).toContain('Predictions, not observations')
    expect(html).toContain('Open-Meteo Marine')
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(BANNED)
  })
})

/* -------------------------------------------------------------- wind */

const W_HOURS = Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(2026, 10, 2, 12) + i * 3_600_000))
/* From the WNW (offshore at an east-facing beach) until 18 UTC, then from the ESE (onshore). */
const fromAt = (i: number) => (i < 6 ? 290 : 100)
const speeds = (i: number) => [3, 3.2, 3.5, 3.8, 6.5].map((s) => s + i * 0.1)
const ground = W_HOURS.map((_, i) => summarise(speeds(i), speeds(i).map(() => fromAt(i)), [7 + i * 0.1]))
const MODELS: WindModels = {
  hours: W_HOURS,
  byLevel: { ground, '80m': ground, '120m': ground.map((g) => ({ ...g, median: (g.median ?? 0) * 1.3 })) },
  perModel: Object.fromEntries(['gfs_seamless', 'gfs_hrrr', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless'].map((m, k) => [m, W_HOURS.map((_, i) => speeds(i)[k])])),
  tempC: W_HOURS.map(() => 18),
  cloud: W_HOURS.map(() => 20),
  aloft: W_HOURS.map(() => ({ cls: 'mixing' as const, alpha: 0.1, factor: 1.28 })),
  filled120: ['HRRR'],
}
const WIND: WindData = { models: MODELS, measured: [{ source: 'KNTU', at: new Date('2026-11-02T14:53:00Z'), mps: 2.1, fromDeg: 315, gustMps: null }] }
const W_NOW = new Date('2026-11-02T12:10:00Z')

describe('WindContent', () => {
  const render = (drone: { name: string; maxWindMps: number | null } | null = null, facing: number | 'inland' = 90) =>
    renderToStaticMarkup(<WindContent now={W_NOW} data={WIND} facing={facing} placeName="Sandbridge" timeZone={NY} units={DEFAULT_UNITS} drone={drone} />)
  const html = render()
  it('heads with the speed in the Settings unit, the offshore tag, direction and gusts', () => {
    expect(html).toContain('Sandbridge · now')
    expect(html).toContain('7 kt') // 3.5 m/s
    expect(html).toContain('dwind__tag--offshore')
    expect(html).toMatch(/from the WNW · offshore · gusts 14 kt/)
  })
  it('draws the beach, the tint and the arrow, with the key line', () => {
    expect(html).toContain('data-beach')
    expect(html).toContain('data-kind="offshore"')
    expect(html).toContain('data-kind="onshore"')
    expect(html).toContain('data-to="110"')
    expect(html).toContain('dashed line = the beach · arrow points where the wind goes')
  })
  it('colours the twelve hours by the one function and says when it flips', () => {
    expect(html).toContain('>now<')
    expect(html.match(/class="dwind__h dwind__h--offshore"/g)?.length).toBe(3)
    expect(html.match(/class="dwind__h dwind__h--onshore"/g)?.length).toBe(3)
    expect(html).toContain('Turns onshore around 1 PM')
  })
  it('shows the station and the models; 400 ft only with a drone', () => {
    expect(html).toContain('Station KNTU')
    expect(html).toContain('4 kt NW')
    expect(html).toContain('4 of 5')
    expect(html).not.toContain('At 400 ft')
    const flying = render({ name: 'Mini 4 Pro', maxWindMps: 4 })
    expect(flying).toContain('At 400 ft')
    expect(flying).toContain('9 kt')
    expect(flying).toContain('over rated 8 kt')
  })
  it('draws no beach inland, and says why', () => {
    const inland = render(null, 'inland')
    expect(inland).not.toContain('data-beach')
    expect(inland).toContain('No beach within')
    expect(inland).not.toContain('dwind__tag--')
  })
  it('says a dash while nothing has arrived', () => {
    const empty = renderToStaticMarkup(<WindContent now={W_NOW} data={{ models: null, measured: [] }} facing={null} placeName="" timeZone={NY} units={DEFAULT_UNITS} drone={null} />)
    expect(empty).toContain('>—<')
    expect(empty).toContain('Models still loading · retrying')
  })
  it('instructs nothing and promises nothing', () => {
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(BANNED)
  })
})

describe('Dial labels', () => {
  it('moves "offshore" off the W at a beach facing east (the board drew them on top of each other)', () => {
    const html = renderToStaticMarkup(<Dial facing={90} fromDeg={290} />)
    const lab = /data-label="offshore"/.exec(html)
    expect(lab).not.toBeNull()
    const x = Number(/x="([\d.]+)" y="([\d.]+)"[^>]*data-label="offshore"/.exec(html)?.[1])
    const y = Number(/x="([\d.]+)" y="([\d.]+)"[^>]*data-label="offshore"/.exec(html)?.[2])
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
    expect(Math.abs(y - 100)).toBeGreaterThan(6)
  })
})

describe('WindHow', () => {
  const html = renderToStaticMarkup(<WindHow now={W_NOW} data={WIND} facing={90} unit="kt" />)
  it('names the models, the 120 m level and its factor, the station and the beach', () => {
    expect(html).toContain('GFS, HRRR, ECMWF, ICON, GEM')
    expect(html).toContain('120 m level')
    expect(html).toContain('1.3× the ground wind')
    expect(html).toContain('HRRR has no 120 m level')
    expect(html).toContain('KNTU')
    expect(html).toContain('faces E (90°)')
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(BANNED)
  })
})
