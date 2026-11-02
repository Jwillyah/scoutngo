import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { agreementLine, clockStrips, fireVerdict, lookWindow, readModel, stationRead, throughCloud, type FireContext } from '../src/core/fireOutlook.ts'
import { parseMetarSky } from '../src/core/metar.ts'
import { GAP_OPEN, GAP_PARTIAL, geometricFromApparent, stripTimes } from '../src/core/skyColour.ts'
import { PATH_KM, type ModelPath } from '../src/core/skyFire.ts'
import { formatClock } from '../src/core/timezone.ts'
import { parseFirePaths, pathsAt } from '../src/lib/skyFireData.ts'
import { getPosition } from 'suncalc'
import { fourSkies } from '../src/core/skyPages.ts'

/*
 * SKY FIRE, REPLAYED (Batch G, Section 1). Four sunrises at the Virginia Beach
 * Fishing Pier, each the forecast API's figures for that hour as kept by
 * scripts/measure-sky-fire.mjs, and KORF's METARs round it from the Iowa
 * Environmental Mesonet archive (tests/data/korf-sunrise-metars.txt):
 *
 *   29 Oct  a low deck at ~3,400 ft lit from under: it fired
 *   2 Nov   high cirrus over a clear low horizon (KORF CLR): it fired, the
 *           second miss ("Fire unlikely: a lid of cloud")
 *   30 Oct  clear: nothing to light (Batch F's "Clear" case)
 *   11 Oct  overcast at 800 ft with rain, every model's low deck running on
 */
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const METARS = readFileSync('tests/data/korf-sunrise-metars.txt', 'utf8')
  .split('\n')
  .filter((l) => l.startsWith('ORF,'))
  .map((l) => {
    const [, t, m] = l.split(',')
    return { at: new Date(`${t.replace(' ', 'T')}:00Z`), sky: parseMetarSky(m) }
  })

function replay(date: string) {
  const fx = JSON.parse(readFileSync(`tests/data/sky-fire-${date}-sunrise.json`, 'utf8')) as { payload: unknown; hour: string; event: string }
  const data = parseFirePaths(fx.payload)
  const paths = data === null ? [] : pathsAt(data, fx.hour)
  const event = new Date(fx.event)
  /* The report nearest the event, as the page takes the latest one in the two hours round it. */
  const near = METARS.filter((m) => m.sky !== null).sort((a, b) => Math.abs(a.at.getTime() - event.getTime()) - Math.abs(b.at.getTime() - event.getTime()))[0]
  const ctx: FireContext = { event, kind: 'sunrise', venue: PIER, aod: 0.1, station: near.sky === null ? null : { sky: near.sky, at: near.at } }
  return { paths, event, ctx, verdict: fireVerdict(paths, ctx) }
}

const clock = (d: Date) => formatClock(d, 'America/New_York', 12)
const minutes = (d: Date | null | undefined) => (d == null ? null : d.getTime() / 60_000)

describe('the four replays', () => {
  it('29 Oct, the low deck lit from under: fire possible or likely (kept)', () => {
    const { verdict } = replay('2026-10-29')
    expect(['possible', 'likely']).toContain(verdict?.word)
    expect(verdict?.perLayer.find((x) => x.layer === 'low')?.agree).toBeGreaterThanOrEqual(3)
  })

  it('2 Nov, high cirrus over a clear low horizon: fire possible or better, glow 6:01–6:11, deepest about 6:05', () => {
    const { verdict } = replay('2026-11-02')
    expect(verdict).not.toBeNull()
    expect(['possible', 'likely']).toContain(verdict?.word)
    const high = verdict?.sky.layers.find((l) => l.layer === 'high')
    expect(high?.fires).toBe(true)
    expect(clock(high?.times?.glowFrom as Date)).toBe('6:01 AM')
    expect(clock(high?.times?.glowTo as Date)).toBe('6:11 AM')
    const deepest = minutes(high?.times?.deepest) as number
    expect(Math.abs(deepest - minutes(new Date('2026-11-02T11:05:00Z'))!)).toBeLessThanOrEqual(1)
    /* The window to look is that glow. */
    expect(clock(lookWindow(verdict!)?.from as Date)).toBe('6:01 AM')
  })

  it('30 Oct, a clear sky: unlikely, no clouds to catch the light', () => {
    expect(replay('2026-10-30').verdict?.line).toBe('Fire unlikely: no clouds to catch the light')
  })

  it('11 Oct, overcast at 800 ft (KORF) and every model\'s low deck running on: unlikely, a lid of cloud', () => {
    const { verdict, ctx } = replay('2026-10-11')
    expect(stationRead(ctx.station, ctx.event)?.lowOverhead).toBe(100)
    expect(verdict?.line).toBe('Fire unlikely: a lid of cloud')
  })
})

const path = (model: ModelPath['model'], f: (km: number) => [number, number, number]): ModelPath => ({
  model,
  samples: PATH_KM.map((km) => {
    const [low, mid, high] = f(km)
    return { low, mid, high }
  }),
})
const ALL = ['best_match', 'gfs_hrrr', 'gfs_seamless', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless'] as const
const NOV2: FireContext = { event: new Date('2026-11-02T11:28:51Z'), kind: 'sunrise', venue: PIER, aod: 0.1 }

describe('bug 1: high cirrus is the canvas, not a lid', () => {
  it('Mid 6 + High 84 over you reads as canvas yes, and fires with a clear low horizon', () => {
    const r = readModel(path('gfs_hrrr', () => [0, 6, 84]), NOV2)
    const high = r.layers.find((l) => l.layer === 'high')
    expect(high?.canvas).toBe(true)
    expect(high?.fires).toBe(true)
    /* Even at 100%: cirrus that thick is still a canvas, never "a lid". */
    expect(fireVerdict(ALL.map((m) => path(m, () => [0, 6, 100])), NOV2)?.word).not.toBe('unlikely')
  })

  it('a lid is a thick LOW or MID deck: low 95% running on is one', () => {
    expect(fireVerdict(ALL.map((m) => path(m, () => [95, 0, 84])), NOV2)?.line).toBe('Fire unlikely: a lid of cloud')
  })
})

describe('bug 2: the gap, per layer, on the real ray', () => {
  it('a low deck 200 km out does not block 8 km cirrus once the ray passes above it', () => {
    /* Old check: low cloud 200–400 km over 40% = "no gap". */
    /* Cirrus over you only, so its lit edge is near and its ray crosses the low layer inside the 400 km asked. */
    const p = path('gfs_hrrr', (km) => [km >= 200 ? 90 : 0, 0, km <= 25 ? 70 : 0])
    const high = readModel(p, NOV2).layers.find((l) => l.layer === 'high')
    expect(high?.fires).toBe(true)
    /* At the cirrus' first light the ray dips through the low layer out there; minutes later it passes above it. */
    const alt = (t: Date) => getPosition(t, PIER.lat, PIER.lon).altitude
    const lift = ((high?.reachKm as number) / 6371) * (180 / Math.PI)
    const first = high?.strip?.minutes.find((m) => m.light !== null)?.at as Date
    const early = throughCloud(p, high?.reachKm as number, 8000, geometricFromApparent(alt(first)) + lift)
    const later = throughCloud(p, high?.reachKm as number, 8000, geometricFromApparent(alt(new Date(first.getTime() + 8 * 60_000))) + lift)
    expect(early.open).toBeLessThan(GAP_PARTIAL)
    expect(early.worst?.layer).toBe('low')
    expect(later.open).toBe(1)
  })

  it('52% low cloud where the ray crosses it is a partial gap, not a no', () => {
    const p = path('gfs_hrrr', () => [52, 0, 70])
    const r = throughCloud(p, 0, 8000, -3.2)
    expect(r.open).toBeCloseTo(0.48, 2)
    expect(r.open).toBeGreaterThanOrEqual(GAP_PARTIAL)
    expect(r.open).toBeLessThan(GAP_OPEN)
  })

  it('the ray only counts cloud inside that cloud\'s layer: none when it stays above them', () => {
    /* The sun 1° up at the cirrus: the ray climbs from 8 km, above every lower layer. */
    expect(throughCloud(path('gfs_hrrr', () => [100, 100, 100]), 0, 8000, 1).open).toBe(1)
  })
})

describe('bug 3: the verdict and the colour clock are one arithmetic', () => {
  it('in every replay, when the clock shows a layer lit, the verdict is not a bare "unlikely"', () => {
    for (const d of ['2026-10-29', '2026-11-02', '2026-10-30', '2026-10-11']) {
      const { verdict } = replay(d)
      const lit = clockStrips(verdict!).some((s) => stripTimes(s).glowFrom !== null)
      if (lit) expect(verdict?.line).not.toMatch(/^Fire unlikely: (a lid|no clouds|no gap)/)
    }
  })

  it('when most models do not see what the clock shows, the line says so', () => {
    /* The models' mean has cirrus over you; only one model does. */
    const paths = ALL.map((m) => path(m, () => [0, 0, m === 'ecmwf_ifs025' ? 100 : 20]))
    const v = fireVerdict(paths, NOV2)
    if (v?.word === 'unlikely' && v.sky.fires) expect(v.line).toMatch(/^Fire unlikely: only \d of 5 models see lit high cirrus$/)
    expect(v?.word).toBe('unlikely')
  })
})

describe('bug 4: agreement per layer', () => {
  it('2 Nov: "4 of 5 see lit high cirrus"', () => {
    expect(agreementLine(replay('2026-11-02').verdict!)).toBe('4 of 5 see lit high cirrus')
  })
})

describe('bug 5: the station confirms the low gap', () => {
  const clr = { sky: parseMetarSky('KORF 021151Z 05004KT 10SM CLR 14/12 A3043')!, at: new Date('2026-11-02T11:51:00Z') }
  it('"clear below 12,000 ft" within two hours: the low gap is open, said with the station', () => {
    const p = path('ecmwf_ifs025', (km) => [km >= 150 ? 80 : 0, 0, 99])
    const without = readModel(p, NOV2).layers.find((l) => l.layer === 'high')
    const withStation = readModel(p, { ...NOV2, station: clr }).layers.find((l) => l.layer === 'high')
    expect(withStation?.openBy).toBe('KORF')
    expect(withStation?.open).toBe(1)
    expect((withStation?.open ?? 0) >= (without?.open ?? 0)).toBe(true)
  })
  it('more than two hours from the event it is not used', () => {
    expect(stationRead({ ...clr, at: new Date('2026-11-02T08:51:00Z') }, NOV2.event)).toBeNull()
  })
})

describe('item 7: the four forecasts drawn from the same read', () => {
  /*
   * Batch G, item 7: on 2 Nov the four said "no fire" and looked alike under
   * 84-100% cirrus. Each is now its model's own read, drawn at its deepest
   * glow with the colour clock's light: lit cirrus is orange to red, before
   * sunrise.
   */
  it('2 Nov: lit cirrus, drawn before sunrise in the clock\'s warm light', () => {
    const fx = JSON.parse(readFileSync('tests/data/sky-fire-2026-11-02-sunrise.json', 'utf8')) as { payload: unknown; hour: string; event: string }
    const paths = pathsAt(parseFirePaths(fx.payload)!, fx.hour)
    const event = new Date(fx.event)
    const s = fourSkies(paths, fireVerdict(paths, { event, kind: 'sunrise', venue: PIER, aod: 0.1 }), event)
    const lit = s.filter((m) => m.lit === 'high')
    expect(lit.map((m) => m.model)).toEqual(['gfs_hrrr', 'ecmwf_ifs025', 'icon_seamless'])
    for (const m of lit) {
      expect(m.at.getTime()).toBeLessThan(event.getTime())
      const [r, g, b] = m.glow.high as readonly number[]
      /* Warm: red the strongest, green under half of it, blue least. */
      expect(r).toBe(1)
      expect(g).toBeLessThan(0.5)
      expect(b).toBeLessThan(g)
    }
    expect(s.find((m) => m.model === 'gem_seamless')?.lit).toBeNull()
  })
})
