import { readFileSync } from 'node:fs'
import { destination } from '@turf/destination'
import { describe, expect, it } from 'vitest'
import {
  cloudTriple,
  eventToLog,
  EARTH_RADIUS_KM,
  grazingKm,
  grazingKmExact,
  layersLine,
  modelsSplit,
  PATH_KM,
  pathPoints,
  type ModelPath,
} from '../src/core/skyFire.ts'
import { fireVerdict, readModel } from '../src/core/fireOutlook.ts'
import { disagreement, parseMetarSky, skyWords } from '../src/core/metar.ts'
import { FIRST_ENTRY, parseFireLog, readFireLog, trackRecord, withEntry } from '../src/lib/fireLog.ts'
import { firePathsUrl, nearestHour, parseFirePaths, pathsAt } from '../src/lib/skyFireData.ts'
import { stationOf } from '../api/metar.ts'

/*
 * SKY FIRE, 29 Oct 2026, sunrise at the Virginia Beach Fishing Pier: it fired,
 * under a low deck the stations had at 2,900 to 4,000 ft
 * (measurements/2026-10-29-sunrise.md). The cover along the sun's line for
 * that hour is measurements/2026-10-29-sky-fire.md, its raw answer the
 * fixture replayed here.
 */
const FIXTURE = JSON.parse(readFileSync('tests/data/sky-fire-2026-10-29-sunrise.json', 'utf8')) as {
  payload: unknown
  hour: string
  venue: { lat: number; lon: number }
  azimuth: number
  url: string
  event: string
}
const CTX = { event: new Date(FIXTURE.event), kind: 'sunrise' as const, venue: FIXTURE.venue }

describe('29 Oct, replayed', () => {
  const data = parseFirePaths(FIXTURE.payload)
  const paths = data === null ? [] : pathsAt(data, FIXTURE.hour)

  it('has every model\'s figures for the hour, so the verdict is about something', () => {
    expect(paths.length).toBeGreaterThanOrEqual(5)
    expect(FIXTURE.hour).toBe('2026-10-29T11:00')
  })

  it('gives "Color possible" or better: it fired', () => {
    const v = fireVerdict(paths, CTX)
    expect(v).not.toBeNull()
    expect(['possible', 'likely']).toContain(v?.word)
    expect(v?.line).toMatch(/^Color (possible|likely)$/)
  })

  it('reads it as the low deck lit from underneath, the deck ending toward the sun', () => {
    const best = readModel(paths.find((p) => p.model === 'best_match') as ModelPath, CTX)
    const low = best.layers.find((l) => l.layer === 'low')
    expect(low?.canvas).toBe(true)
    expect(low?.reachKm).toBe(100)
    expect(['open', 'partial']).toContain(low?.gap)
    expect(low?.fires).toBe(true)
  })

  it('was asked for with every point rounded to 2 decimals', () => {
    const q = new URL(FIXTURE.url).searchParams
    for (const v of [...(q.get('latitude') ?? '').split(','), ...(q.get('longitude') ?? '').split(',')]) expect(v).toMatch(/^-?\d+\.\d{2}$/)
    /* Kept before the opposite sky was asked (Batch NOW, Section 0): the same eight path points first, then the opposite sky's two, rounded the same. */
    const now = new URL(firePathsUrl(FIXTURE.venue, FIXTURE.azimuth, '2026-10-29')).searchParams
    for (const k of ['latitude', 'longitude']) {
      const was = (q.get(k) ?? '').split(',')
      const is = (now.get(k) ?? '').split(',')
      expect(is.slice(0, was.length)).toEqual(was)
      expect(is).toHaveLength(was.length + 2)
      for (const v of is) expect(v).toMatch(/^-?\d+\.\d{2}$/)
    }
  })
})

describe('the geometry', () => {
  it('sqrt(2Rh) agrees with the exact circle to within 0.1% for decks up to 12 km', () => {
    for (const h of [300, 1000, 2000, 4000, 8000, 12000]) {
      const exact = grazingKmExact(h)
      expect(Math.abs(grazingKm(h) - exact) / exact).toBeLessThan(0.001)
    }
    /* And the exact form is the circle's: at that arc the tangent from R + h meets the surface. */
    const h = 8000
    const theta = grazingKmExact(h) / EARTH_RADIUS_KM
    expect(Math.cos(theta) * (EARTH_RADIUS_KM + h / 1000)).toBeCloseTo(EARTH_RADIUS_KM, 6)
  })

  it('a deck at 1 km is lit through a gap about 113 km off, one at 8 km about 319 km off', () => {
    expect(grazingKm(1000)).toBeCloseTo(112.9, 0)
    expect(grazingKm(8000)).toBeCloseTo(319.3, 0)
  })

  it('the points toward the sun are turf\'s destination points, rounded to 2 decimals', () => {
    const from = { lat: 36.8435575, lon: -75.9713104 }
    const pts = pathPoints(from, 106.4)
    expect(pts.map((p) => p.km)).toEqual([...PATH_KM])
    for (const p of pts) {
      const [lon, lat] = p.km === 0 ? [from.lon, from.lat] : destination([from.lon, from.lat], p.km, 106.4, { units: 'kilometers' }).geometry.coordinates
      expect(p.at.lat).toBe(Math.round(lat * 100) / 100)
      expect(p.at.lon).toBe(Math.round(lon * 100) / 100)
    }
  })
})

const path = (model: ModelPath['model'], f: (km: number) => [number, number, number]): ModelPath => ({
  model,
  samples: PATH_KM.map((km) => {
    const [low, mid, high] = f(km)
    return { low, mid, high }
  }),
})

describe('the checks', () => {
  const all = (f: (km: number) => [number, number, number]) => ['best_match', 'gfs_hrrr', 'gfs_seamless', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless'].map((m) => path(m as ModelPath['model'], f))
  const ctx = { event: new Date('2026-11-02T11:28:51Z'), kind: 'sunrise' as const, venue: { lat: 36.8435575, lon: -75.9713104 } }

  it('a high deck with clear low cloud along its light path fires', () => {
    expect(readModel(path('gfs_hrrr', () => [5, 10, 60]), ctx).fires).toBe(true)
  })

  it('a low deck that runs on past the light\'s way in is a lid', () => {
    expect(fireVerdict(all(() => [95, 0, 0]), ctx)?.line).toBe('Color unlikely: a lid of cloud')
  })

  it('a clear sky has nothing to light', () => {
    expect(fireVerdict(all(() => [0, 0, 0]), ctx)?.line).toBe('Color unlikely: no clouds to catch the light')
  })

  it('a thick low deck right overhead hides a high canvas', () => {
    const r = readModel(path('gfs_hrrr', (km) => [km === 0 ? 95 : 10, 10, 60]), ctx)
    const high = r.layers.find((l) => l.layer === 'high')
    expect(high?.canvas).toBe(true)
    expect(high?.hiddenBy?.layer).toBe('low')
    expect(high?.fires).toBe(false)
  })

  it('says only possible, likely or unlikely: never certain', () => {
    /* What is said, not the comments about what is not said. */
    const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    const src = strip(readFileSync('src/core/skyFire.ts', 'utf8') + readFileSync('src/core/fireOutlook.ts', 'utf8') + readFileSync('src/components/SkyFire.tsx', 'utf8'))
    expect(src).not.toMatch(/\b(certain|guaranteed|will fire|definitely)\b/i)
  })

  it('models split when the five are 50 points apart on low cloud', () => {
    expect(modelsSplit([4, 87, 21, 63, 0])).toBe(true)
    expect(modelsSplit([80, 87, 90, 75, 70])).toBe(false)
  })

  it('the chip and the card say the layers', () => {
    expect(layersLine({ low: 87, mid: 20, high: 0 })).toBe('Low 87 · Mid 20 · High 0')
    expect(cloudTriple({ low: 87, mid: 20, high: 0 })).toBe('87·20·0')
    expect(layersLine({ low: null, mid: 20, high: 0 })).toBe('Low — · Mid 20 · High 0')
  })

  it('the forecast hour is the nearest, in GMT', () => {
    expect(nearestHour(new Date('2026-10-29T11:24:50Z'))).toBe('2026-10-29T11:00')
    expect(nearestHour(new Date('2026-10-29T11:31:00Z'))).toBe('2026-10-29T12:00')
  })
})

describe('the stations', () => {
  const KNTU = 'METAR KNTU 290956Z 03004KT 10SM BKN029 BKN200 16/15 A3025 RMK SLP247 T01610150'

  it('reads the deck from the METAR text', () => {
    const sky = parseMetarSky(KNTU)
    expect(sky?.station).toBe('KNTU')
    expect(skyWords(sky!)).toBe('broken deck at 2,900 ft')
  })

  it('says when the station and the forecast disagree', () => {
    expect(disagreement(parseMetarSky(KNTU)!, 4)).toBe('Station: broken deck at 2,900 ft · forecast said clear')
    expect(disagreement(parseMetarSky(KNTU)!, 87)).toBeNull()
    expect(disagreement(parseMetarSky('KORF 291051Z 03007KT 10SM CLR 16/14 A3026')!, 90)).toMatch(/^Station: clear below 12,000 ft · forecast said a low deck/)
  })

  it('/api/metar takes a station id and nothing else', () => {
    expect(stationOf({ station: 'kntu' })).toBe('KNTU')
    expect(stationOf({ station: '36.84,-75.97' })).toBeNull()
    expect(stationOf({ lat: 36.84 })).toBeNull()
  })
})

describe('the log, on this phone', () => {
  const store = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
  }

  it('starts with 29 Oct at the pier: it fired', () => {
    const log = readFireLog(store())
    expect(log).toEqual([FIRST_ENTRY])
    expect(FIRST_ENTRY).toMatchObject({ date: '2026-10-29', event: 'sunrise', outcome: 'fired' })
  })

  it('one entry per day, event and place, newest first', () => {
    const a = { ...FIRST_ENTRY, id: 'b', date: '2026-10-30', outcome: 'meh' as const, forecast: 'Color possible' }
    const log = withEntry(withEntry([FIRST_ENTRY], a), { ...a, outcome: 'fired' })
    expect(log.map((e) => [e.date, e.outcome])).toEqual([['2026-10-30', 'fired'], ['2026-10-29', 'fired']])
    expect(trackRecord(log)).toEqual({ said: 1, fired: 1 })
  })

  it('drops anything malformed, and a photo that is not an image', () => {
    expect(parseFireLog('{bad')).toEqual([])
    expect(parseFireLog(JSON.stringify([{ ...FIRST_ENTRY, photo: 'https://example.com/x.jpg' }]))?.[0].photo).toBeNull()
  })
})

/*
 * Batch G, item 6: at 6:11 on 2 Nov, the glow over and sunrise at 6:28 still
 * to come, there was no "It fired" button anywhere.
 */
describe('which event the log buttons are for', () => {
  const PIER = { lat: 36.8435575, lon: -75.9713104 }
  const at = (iso: string) => eventToLog(new Date(iso), PIER, 'America/New_York')
  it('from 50 minutes before sunrise: 6:11 on 2 Nov logs that sunrise', () => {
    expect(at('2026-11-02T11:11:00Z')).toMatchObject({ kind: 'sunrise' })
    expect(at('2026-11-02T11:11:00Z')?.at.toISOString().slice(0, 16)).toBe('2026-11-02T11:28')
  })
  it('until 3 hours after, then the last one earlier the same day', () => {
    expect(at('2026-11-02T14:20:00Z')?.kind).toBe('sunrise')
    /* Noon: still this morning's sunrise. */
    expect(at('2026-11-02T17:00:00Z')?.at.toISOString().slice(0, 16)).toBe('2026-11-02T11:28')
    /* After sunset: the sunset. */
    expect(at('2026-11-02T23:30:00Z')?.kind).toBe('sunset')
  })
  it('not before the first one of the day', () => {
    expect(at('2026-11-02T08:00:00Z')).toBeNull()
  })
})
