import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gaugeName, nearestSst, parseBuoyWater, parseCoopsWater, parseUsgsWater, pickWater, readingAge, satelliteDay, sitesNear, sstCell, STATION_KM, waterHead, waterSource, type SstGrid, type WaterReading, type WaterSite } from '../src/core/waterTemp.ts'
import { cellOf, gridOf, murUrl, POST as sstPost } from '../api/sst.ts'
import { parseRealtimeWater } from '../api/buoy.ts'
import { askWater, forgetWater, keepWater, keptWater, waterAt, waterKeyOf, type WaterDeps } from '../src/lib/waterTemp.ts'
import { COOPS_WATER_TEMP } from '../src/data/coopsWaterTemp.ts'
import { USGS_WATER_TEMP } from '../src/data/usgsWaterTemp.ts'
import { NDBC_BUOYS } from '../src/data/ndbc.ts'

/*
 * THE WATER'S TEMPERATURE, FROM INSTRUMENTS ONLY (Batch FIX, Section 4). Recorded
 * 17 Nov 2026 at about 7:57 AM EST (tests/data/water-2026-11-17): CO-OPS's
 * latest at Sewells Point, the USGS gauge at the Midtown Tunnel, and MUR
 * through ERDDAP for the two half-degree cells round Virginia Beach; NDBC
 * 44099 from 16 Nov (tests/data/surf-2026-11-16).
 */
const DIR = 'tests/data/water-2026-11-17'
const json = (f: string) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as unknown
const NOW = new Date('2026-11-17T13:10:00Z')

const SPOTS = {
  vb: { lat: 36.85, lon: -75.97 },
  croatan: { lat: 36.82, lon: -75.97 },
  sandbridge: { lat: 36.72, lon: -75.93 },
  lynnhaven: { lat: 36.91, lon: -76.09 },
  backBay: { lat: 36.65, lon: -75.98 },
}
/*
 * Ocean within 2 km, from OpenFreeMap's z12 tiles (class ocean), read on
 * 17 Nov with src/lib/coast.ts seaReach: 0 m at VB, 300 m at Croatan, 0 m at
 * Sandbridge and Lynnhaven, none at Back Bay (a bay the tiles do not count
 * as the ocean).
 */
const OCEAN: Record<keyof typeof SPOTS, boolean> = { vb: true, croatan: true, sandbridge: true, lynnhaven: true, backBay: false }

const site = (kind: WaterSite['kind'], km: number, id = 'x'): WaterSite => ({ kind, id, name: id, at: { lat: 0, lon: 0 }, km })
const reading = (kind: WaterSite['kind'], km: number, agoMin: number, c = 14): WaterReading => ({ site: site(kind, km), at: new Date(NOW.getTime() - agoMin * 60_000), c })

const sstFile = (cell: { lat: number; lon: number }) => `mur-${cell.lat.toFixed(1)}_${cell.lon.toFixed(1)}.json`
const gridFor = (at: { lat: number; lon: number }) => gridOf(json(sstFile(sstCell(at)))) as SstGrid

describe('reading each source', () => {
  it('CO-OPS: Sewells Point 13.8 °C at 13:00 UTC', () => {
    const r = parseCoopsWater(json('coops-8638610.json'), site('coops', 21.5, '8638610'))
    expect(r?.c).toBe(13.8)
    expect(r?.at.toISOString()).toBe('2026-11-17T13:00:00.000Z')
    expect(parseCoopsWater({ error: { message: 'No data was found.' } }, site('coops', 1))).toBeNull()
    expect(parseCoopsWater({ data: [{ t: '2026-11-17 13:00', v: '' }] }, site('coops', 1))).toBeNull()
  })

  it('NDBC: 44099 WTMP 15.7 °C, the newest line, through the buoy function', () => {
    const w = parseRealtimeWater(readFileSync('tests/data/surf-2026-11-16/44099.txt', 'utf8'))
    expect(w).toEqual({ at: '2026-11-16T15:56:00Z', c: 15.7 })
    const r = parseBuoyWater({ status: 'ok', water: w }, site('ndbc', 23, '44099'))
    expect(r?.c).toBe(15.7)
    expect(parseBuoyWater({ status: 'ok', water: null }, site('ndbc', 1))).toBeNull()
    expect(parseRealtimeWater('#YY  MM DD hh mm WTMP\n2026 11 16 15 56 MM\n')).toBeNull()
  })

  it('USGS: the Midtown Tunnel gauge 14.3 °C at 7:54 AM EST', () => {
    const s: WaterSite = { kind: 'usgs', id: '0204288831', name: 'Elizabeth Riv at Midtown Tunnel', at: { lat: 36.862, lon: -76.3095 }, km: 2 }
    const [r] = parseUsgsWater(json('usgs-0204288831.json'), [s])
    expect(r.c).toBe(14.3)
    expect(r.at.toISOString()).toBe('2026-11-17T12:54:00.000Z')
    expect(parseUsgsWater(json('usgs-0204288831.json'), [])).toEqual([])
  })

  it('the gauge is said by its water, not the county: "Elizabeth Riv at Midtown Tunnel"', () => {
    expect(gaugeName('ELIZABETH RIV AT MIDTOWN TUNNEL AT NORFOLK, VA')).toBe('Elizabeth Riv at Midtown Tunnel')
    expect(gaugeName('BLACKWATER RIVER AT ROUTE 620 NEAR ZUNI, VA')).toBe('Blackwater River at Route 620')
    expect(gaugeName('PISCATAWAY CREEK NEAR TAPPAHANNOCK, VA')).toBe('Piscataway Creek')
  })
})

describe('the satellite, round one coarse cell', () => {
  it('sends a half-degree cell, never the spot, and the function refuses anything finer', () => {
    expect(sstCell(SPOTS.vb)).toEqual({ lat: 37, lon: -76 })
    expect(sstCell(SPOTS.sandbridge)).toEqual({ lat: 36.5, lon: -76 })
    expect(cellOf({ lat: 37, lon: -76 })).toEqual({ lat: 37, lon: -76 })
    expect(cellOf({ lat: 36.85, lon: -75.97 })).toBeNull()
    expect(cellOf({ lat: 36.9, lon: -76 })).toBeNull()
    expect(cellOf({ lat: '37', lon: -76 })).toBeNull()
    expect(decodeURIComponent(murUrl({ lat: 37, lon: -76 }))).toBe('https://coastwatch.pfeg.noaa.gov/erddap/griddap/jplMURSST41.json?analysed_sst[(last)][(36.70):2:(37.30)][(-76.30):2:(-75.70)]')
  })

  it('reads ERDDAP into a grid: 16 Nov, 31 by 31 cells 0.02° apart, land null', () => {
    const g = gridFor(SPOTS.vb)
    expect(g.day).toBe('2026-11-16')
    expect(g.rows.length).toBe(31)
    expect(g.rows[0].length).toBe(31)
    expect(g.step).toBeCloseTo(0.02, 6)
    expect(g.lat0).toBeCloseTo(36.7, 6)
    expect(g.rows.flat().some((c) => c === null)).toBe(true)
  })

  it('the function answers POST with a cell in its body (the upstream stubbed)', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(json(sstFile({ lat: 37, lon: -76 }))), { status: 200 }))
    try {
      const r = await sstPost(new Request('http://127.0.0.1/api/sst', { method: 'POST', body: JSON.stringify({ lat: 37, lon: -76 }) }))
      const body = (await r.json()) as { status: string; day: string; rows: unknown[] }
      expect(body.status).toBe('ok')
      expect(body.day).toBe('2026-11-16')
      const bad = await sstPost(new Request('http://127.0.0.1/api/sst', { method: 'POST', body: JSON.stringify({ lat: 36.85, lon: -75.97 }) }))
      expect(bad.status).toBe(400)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('the nearest cell with water within 3 km: Croatan, on the sand, reads the sea beside it', () => {
    const vb = nearestSst(gridFor(SPOTS.vb), SPOTS.vb)
    const cro = nearestSst(gridFor(SPOTS.croatan), SPOTS.croatan)
    expect(vb?.c).toBeGreaterThan(14)
    expect(vb?.c).toBeLessThan(15.5)
    expect(cro).not.toBeNull()
    expect(cro?.site.km).toBeLessThan(3)
    expect(cro?.at.toISOString()).toBe('2026-11-16T09:00:00.000Z')
    /* Inland Norfolk: no water within 3 km in the cell. */
    expect(nearestSst(gridFor({ lat: 36.85, lon: -76.2 }), { lat: 36.85, lon: -76.2 })).toBeNull()
  })
})

describe('which reading is said', () => {
  it('a station within 15 km on the sea, nearest, before the satellite', () => {
    const r = pickWater({ ocean: true, stations: [reading('ndbc', 12, 30, 15), reading('coops', 9, 20, 14)], satellite: reading('satellite', 1, 24 * 60), rivers: [] }, NOW)
    expect(r?.site.kind).toBe('coops')
  })

  it('a station farther than 15 km, or older than 6 h, gives way to the satellite', () => {
    expect(pickWater({ ocean: true, stations: [reading('ndbc', 16, 30)], satellite: reading('satellite', 1, 24 * 60), rivers: [] }, NOW)?.site.kind).toBe('satellite')
    expect(pickWater({ ocean: true, stations: [reading('coops', 5, 7 * 60)], satellite: reading('satellite', 1, 24 * 60), rivers: [] }, NOW)?.site.kind).toBe('satellite')
  })

  it('no satellite off the sea, nor when the sea is not known; a gauge within 5 km; else nothing', () => {
    expect(pickWater({ ocean: false, stations: [], satellite: reading('satellite', 1, 60), rivers: [] }, NOW)).toBeNull()
    expect(pickWater({ ocean: null, stations: [], satellite: reading('satellite', 1, 60), rivers: [] }, NOW)).toBeNull()
    expect(pickWater({ ocean: false, stations: [reading('coops', 8, 10)], satellite: null, rivers: [reading('usgs', 3, 15)] }, NOW)?.site.kind).toBe('usgs')
    expect(pickWater({ ocean: false, stations: [], satellite: null, rivers: [reading('usgs', 6, 15)] }, NOW)).toBeNull()
  })

  it('never a value out of the water’s range, and never a satellite day older than 3 days', () => {
    expect(pickWater({ ocean: true, stations: [reading('coops', 2, 10, 99)], satellite: null, rivers: [] }, NOW)).toBeNull()
    expect(pickWater({ ocean: true, stations: [], satellite: reading('satellite', 1, 5 * 24 * 60), rivers: [] }, NOW)).toBeNull()
  })
})

describe('the words', () => {
  it('"Water 58° · 4/3" from the measured temperature; a dash never stands in for a zero', () => {
    expect(waterHead(14.4, 'F')).toBe('Water 58° · 4/3')
    expect(waterHead(14.4, 'C')).toBe('Water 14° · 4/3')
    expect(waterHead(10, 'F')).toBe('Water 50° · 5/4 + hood')
    expect(waterHead(null, 'F')).toBe('No water temp here')
  })

  it('where from, how far, how old', () => {
    const s: WaterSite = { kind: 'coops', id: '8638610', name: 'Sewells Point', at: { lat: 0, lon: 0 }, km: 9.2 }
    expect(waterSource({ site: s, at: new Date(NOW.getTime() - 20 * 60_000), c: 14 }, NOW, false, '2026-11-17')).toBe('Sewells Point · 9 km · 20 min ago')
    expect(waterSource({ site: s, at: new Date(NOW.getTime() - 20 * 60_000), c: 14 }, NOW, true, '2026-11-17')).toBe('Sewells Point · 6 mi · 20 min ago')
    expect(waterSource({ site: site('satellite', 1), at: new Date('2026-11-16T09:00:00Z'), c: 14 }, NOW, true, '2026-11-17')).toBe('satellite · yesterday')
    expect(satelliteDay('2026-11-14', '2026-11-17')).toBe('3 days ago')
    expect(readingAge(new Date(NOW.getTime() - 150 * 60_000), NOW)).toBe('3 h ago')
  })
})

describe('the five spots, from the baked station lists (17 Nov)', () => {
  beforeEach(() => forgetWater())

  it('lists the stations the app asks: none within 15 km of any of the five', () => {
    expect(COOPS_WATER_TEMP.find((s) => s[0] === '8638610')?.[1]).toBe('Sewells Point')
    expect(USGS_WATER_TEMP.some((s) => s[0] === '0204288831')).toBe(true)
    /* Storm drains are not water anyone is on: the Lindsley Drive drain, 4.6 km from the oceanfront, is not in the list. */
    expect(USGS_WATER_TEMP.some((s) => s[0] === '0204295063')).toBe(false)
    for (const [name, at] of Object.entries(SPOTS)) {
      const near = sitesNear(at, COOPS_WATER_TEMP, NDBC_BUOYS, USGS_WATER_TEMP, OCEAN[name as keyof typeof SPOTS] ? STATION_KM : 5)
      expect(near, name).toEqual({ stations: [], rivers: [] })
    }
  })

  /* The phone's asking, end to end, with every answer recorded: the source each spot says. */
  const deps = (ocean: boolean, asked: string[]): WaterDeps => ({
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const href = String(input)
      asked.push(href)
      if (href === '/api/sst') return new Response(JSON.stringify({ status: 'ok', ...gridOf(json(sstFile(JSON.parse(String(init?.body)) as { lat: number; lon: number }))) }))
      throw new TypeError(`not recorded: ${href}`)
    }) as typeof fetch,
    buoy: async () => {
      throw new TypeError('no buoy asked')
    },
    ocean: async () => ocean,
    lists: async () => ({ coops: COOPS_WATER_TEMP, buoys: NDBC_BUOYS, usgs: async () => USGS_WATER_TEMP }),
  })

  for (const [name, want, head] of [
    ['vb', 'satellite', 'Water 58° · 4/3'],
    ['croatan', 'satellite', 'Water 58° · 4/3'],
    ['sandbridge', 'satellite', 'Water 59° · 4/3'],
    ['lynnhaven', 'satellite', 'Water 58° · 4/3'],
    ['backBay', null, 'No water temp here'],
  ] as const) {
    it(`${name}: ${want ?? 'No water temp here'}`, async () => {
      const asked: string[] = []
      const got = await askWater(SPOTS[name], NOW, deps(OCEAN[name], asked))
      expect(got.reading?.site.kind ?? null).toBe(want)
      /* Back Bay asks nobody: no station within 5 km, no gauge, and not the sea. */
      if (want === null) expect(asked).toEqual([])
      else expect(asked).toEqual(['/api/sst'])
      expect(waterHead(got.reading?.c ?? null, 'F')).toBe(head)
    })
  }

  it('one satellite ask per half-degree cell: VB, Croatan and Lynnhaven share one', async () => {
    const asked: string[] = []
    for (const at of [SPOTS.vb, SPOTS.croatan, SPOTS.lynnhaven]) expect((await askWater(at, NOW, deps(true, asked))).reading?.site.kind).toBe('satellite')
    expect(asked).toEqual(['/api/sst'])
  })
})

describe('kept on the phone', () => {
  beforeEach(() => {
    forgetWater()
    const map = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, String(v)), removeItem: (k: string) => void map.delete(k) })
  })

  it('says the last reading, with its age, when nothing answers; not one over 48 h old', async () => {
    const key = waterKeyOf(SPOTS.vb)
    const r: WaterReading = { site: { kind: 'satellite', id: 'MUR', name: 'satellite', at: SPOTS.vb, km: 0.5 }, at: new Date('2026-11-16T09:00:00Z'), c: 14.4 }
    keepWater(key, r, NOW)
    expect(keptWater(key, NOW)?.c).toBe(14.4)
    expect(keptWater(key, new Date('2026-11-19T10:00:00Z'))).toBeNull()
    const offline: WaterDeps = {
      fetchImpl: (async () => {
        throw new TypeError('offline')
      }) as typeof fetch,
      buoy: async () => {
        throw new TypeError('offline')
      },
      ocean: async () => true,
      lists: async () => ({ coops: COOPS_WATER_TEMP, buoys: NDBC_BUOYS, usgs: async () => USGS_WATER_TEMP }),
    }
    const s = await waterAt(SPOTS.vb, NOW, offline)
    expect(s).toMatchObject({ status: 'ok', kept: true })
  })
})
