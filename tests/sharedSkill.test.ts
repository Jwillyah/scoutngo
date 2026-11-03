import { afterEach, describe, expect, it, vi } from 'vitest'
import { blendHour, blendRun, skillOverall, type ModelId, type SkillHistory } from '../src/core/modelSkill.ts'
import { buildShared, errorOf, parseNdbcMet, pickScores, rowCount, sharedScores, SHARED_SCHEMA, validateShared, type LeadSeries, type Obs, type SharedFile } from '../src/core/sharedSkill.ts'
import { downloadShared, fileUrl, manifestUrl, regionFor, sharedFor } from '../src/lib/sharedSkillData.ts'

/*
 * THE SHARED CORRECTIONS FILE (Batch L, Section 1): the schema, a biased
 * model taken out by the file's numbers, the fallback to the phone's own
 * scores when the file is stale or the phone offline, and no request that
 * carries a coordinate.
 */
const KNTU = { id: 'KNTU', kind: 'asos' as const, name: 'Oceana', lat: 36.821, lon: -76.033 }
const VENUE = { lat: 36.8529, lon: -75.978 }
const DATE = '2026-11-03'
const utc = (key: string) => ({ date: key.slice(0, 10), hour: Number(key.slice(11, 13)) })

/** 32 days of hourly truth at 15 °C, ECMWF right to ±0.3, GFS 2° warm (±0.3). */
function synthetic(): SharedFile {
  const obs: Obs[] = []
  const ec = new Map<string, number>()
  const gfs = new Map<string, number>()
  const start = Date.parse('2026-10-02T00:00:00Z')
  for (let t = start; t < Date.parse(`${DATE}T00:00:00Z`); t += 3_600_000) {
    const key = new Date(t).toISOString().slice(0, 16)
    const wobble = Math.floor(t / 86_400_000) % 2 === 0 ? 0.3 : -0.3
    obs.push({ at: new Date(t + 60_000 * 51 - 3_600_000), temp: 15, dew: 10, wind: 5, gust: null, dir: 200, cloud: null, wet: false })
    ec.set(key, 15 + wobble)
    gfs.set(key, 17 + wobble)
  }
  const forecasts: LeadSeries = { ecmwf_ifs025: { d0: { temp: ec }, d1: { temp: ec } }, gfs_global: { d0: { temp: gfs }, d1: { temp: gfs } } }
  return buildShared({ region: 'midatl', name: 'test', timeZone: 'UTC', generated: new Date(`${DATE}T08:30:00Z`), date: DATE, days: 30, stations: [KNTU], obs: { KNTU: obs }, forecasts: { KNTU: forecasts }, local: utc })
}

describe('the file (schema scoutngo.model-skill/1)', () => {
  it('builds a file that passes its own schema, with 24 hours per cell', () => {
    const f = synthetic()
    expect(f.schema).toBe(SHARED_SCHEMA)
    expect(f.window).toEqual({ from: '2026-10-04', to: '2026-11-02', days: 30 })
    expect(validateShared(JSON.parse(JSON.stringify(f))).ok).toBe(true)
    const c = f.cells.KNTU.gfs_global?.temp?.d0
    expect(c?.b).toHaveLength(24)
    expect(c?.n.every((n) => n === 30)).toBe(true)
    expect(c?.b[14]).toBeCloseTo(2, 5)
    /* 2 models x 2 leads x 24 hours. */
    expect(rowCount(f)).toBe(96)
    expect(f.stations[0].obs).toBe(30 * 24)
  })

  it('refuses a file that is not the schema, whole: nothing partly valid is used', () => {
    const f = JSON.parse(JSON.stringify(synthetic())) as SharedFile
    expect(validateShared({ ...f, schema: 'scoutngo.model-skill/2' }).ok).toBe(false)
    const short = JSON.parse(JSON.stringify(f)) as SharedFile
    short.cells.KNTU.gfs_global!.temp!.d0!.b = [1, 2, 3]
    expect(validateShared(short)).toEqual({ ok: false, reason: 'cell KNTU/gfs_global/temp/d0' })
    expect(validateShared({ ...f, stations: [] }).ok).toBe(false)
    expect(validateShared(null).ok).toBe(false)
  })

  it('scores direction round the circle, and only in a wind that turns a vane', () => {
    const o: Obs = { at: new Date(), temp: null, dew: null, wind: 5, gust: null, dir: 350, cloud: null, wet: null }
    expect(errorOf('dir', 10, o)).toBe(20)
    expect(errorOf('dir', 340, o)).toBe(-10)
    expect(errorOf('dir', 10, { ...o, wind: 1 })).toBeNull()
    /* No gust group: the peak was the wind. */
    expect(errorOf('gust', 7, o)).toBe(2)
  })

  it('reads an NDBC realtime2 file, MM as missing', () => {
    const txt = `#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY  TIDE
#yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa    ft
2026 11 03 18 40 200  6.0  8.0   0.7     8   5.3 105 1015.0  17.1  22.8  12.0   MM   MM    MM
2026 11 03 18 30  MM   MM   MM    MM    MM    MM  MM     MM    MM  22.9    MM   MM   MM    MM`
    const rows = parseNdbcMet(txt)
    /* The 18:30 row has only the water temperature: dropped, so it cannot stand in for the hour. */
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ temp: 17.1, dew: 12, wind: 6, gust: 8, dir: 200, cloud: null, wet: null })
    expect(rows[0].at.toISOString()).toBe('2026-11-03T18:40:00.000Z')
  })
})

describe('a synthetic biased model, removed by the shared file', () => {
  it('GFS 2° warm for 30 days: GFS 17 and ECMWF 15 blend to 15, and the spread closes', () => {
    const s = sharedScores(synthetic(), 'KNTU')
    const b = blendHour(s, 'temp', 14, { ecmwf_ifs025: 15, gfs_global: 17 }, 6)
    expect(b.value).toBeCloseTo(15, 5)
    expect(b.models.find((m) => m.model === 'gfs_global')?.value).toBeCloseTo(15, 5)
    expect((b.hi ?? 0) - (b.lo ?? 0)).toBeLessThan(0.01)
    expect(skillOverall(s, 'gfs_global', 'temp').bias).toBeCloseTo(2, 5)
    expect(skillOverall(s, 'gfs_global', 'temp').days).toBe(30)
  })

  it('reads the lead: 30 h ahead is the d1 cell, past 72 h the furthest it has', () => {
    const f = synthetic()
    f.cells.KNTU.gfs_global!.temp!.d1!.b = Array.from({ length: 24 }, () => 3)
    const s = sharedScores(f, 'KNTU')
    expect(s.at('gfs_global', 'temp', 14, 6).bias).toBeCloseTo(2, 5)
    expect(s.at('gfs_global', 'temp', 14, 30).bias).toBe(3)
    expect(s.at('gfs_global', 'temp', 14, 100).bias).toBe(3)
  })

  it('a whole run: every hour of GFS corrected by its lead', () => {
    const times = Array.from({ length: 48 }, (_, i) => new Date(Date.parse(`${DATE}T00:00:00Z`) + i * 3_600_000).toISOString().slice(0, 16))
    const run = { times, series: { gfs_global: { temp: times.map(() => 17) } } as Partial<Record<ModelId, { temp: number[] }>> }
    const hours = blendRun(run, sharedScores(synthetic(), 'KNTU'), 'UTC', new Date(`${DATE}T00:00:00Z`))
    for (const h of hours) expect(h.temp.value).toBeCloseTo(15, 5)
  })
})

describe('stale or offline: the phone’s own scores', () => {
  const phone: SkillHistory = { stations: 'KNTU,KORF', days: [] }
  it('uses the file within 3 days, and the phone after', () => {
    const f = synthetic()
    expect(pickScores(f, VENUE, new Date('2026-11-05T12:00:00Z'), phone).station?.id).toBe('KNTU')
    const old = pickScores(f, VENUE, new Date('2026-11-06T09:00:00Z'), phone)
    expect(old.station).toBeNull()
    expect(old.scores).toBe(phone)
    expect(pickScores(null, VENUE, new Date(), phone).scores).toBe(phone)
  })

  it('uses the phone when no station in the file is within 60 km', () => {
    expect(pickScores(synthetic(), { lat: 38.9, lon: -77.03 }, new Date('2026-11-03T12:00:00Z'), phone).station).toBeNull()
  })
})

describe('what leaves the phone', () => {
  const store = new Map<string, string>()
  afterEach(() => {
    vi.unstubAllGlobals()
    store.clear()
  })
  const stubStorage = () => vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) })

  it('asks two fixed URLs that carry no coordinate, no station and no query', async () => {
    stubStorage()
    const asked: string[] = []
    const { gzipSync } = await import('node:zlib')
    const body = gzipSync(Buffer.from(JSON.stringify(synthetic())))
    const fake = (async (input: RequestInfo | URL) => {
      const href = String(input)
      asked.push(href)
      if (href.endsWith('/latest.json')) return new Response(JSON.stringify({ file: `${DATE}.json.gz` }), { status: 200 })
      return new Response(body, { status: 200 })
    }) as typeof fetch
    const f = await sharedFor(VENUE, new Date('2026-11-03T12:00:00Z'), fake)
    expect(f?.stations.map((s) => s.id)).toEqual(['KNTU'])
    expect(asked).toEqual([manifestUrl('midatl'), fileUrl('midatl', `${DATE}.json.gz`)])
    for (const u of asked) {
      expect(u).not.toContain('?')
      expect(u).not.toMatch(/36\.8|75\.9|76\.0|KNTU/)
    }
    /* Kept: asked again only after 6 hours. */
    await sharedFor(VENUE, new Date('2026-11-03T15:00:00Z'), fake)
    expect(asked).toHaveLength(2)
  })

  it('asks nothing for a venue outside every region', async () => {
    stubStorage()
    const fake = vi.fn() as unknown as typeof fetch
    expect(regionFor({ lat: 45.5, lon: -122.7 })).toBeNull()
    expect(await sharedFor({ lat: 45.5, lon: -122.7 }, new Date(), fake)).toBeNull()
    expect(fake).not.toHaveBeenCalled()
  })

  it('offline: nothing kept means null (the phone’s scores); a failed check keeps the old file', async () => {
    stubStorage()
    const down = (async () => {
      throw new TypeError('offline')
    }) as typeof fetch
    expect(await sharedFor(VENUE, new Date('2026-11-03T12:00:00Z'), down)).toBeNull()
    const { gzipSync } = await import('node:zlib')
    const up = (async (input: RequestInfo | URL) => (String(input).endsWith('latest.json') ? new Response(JSON.stringify({ file: `${DATE}.json.gz` })) : new Response(gzipSync(Buffer.from(JSON.stringify(synthetic())))))) as typeof fetch
    await sharedFor(VENUE, new Date('2026-11-03T12:00:00Z'), up)
    const later = await sharedFor(VENUE, new Date('2026-11-04T12:00:00Z'), down)
    expect(later?.date).toBe(DATE)
    /* ...which pickScores then refuses once it is over 3 days old. */
    expect(pickScores(later, VENUE, new Date('2026-11-07T12:00:00Z'), null).station).toBeNull()
  })

  it('refuses a download that is not the schema', async () => {
    const bad = (async (input: RequestInfo | URL) => (String(input).endsWith('latest.json') ? new Response(JSON.stringify({ file: `${DATE}.json.gz` })) : new Response(JSON.stringify({ schema: 'nope' })))) as typeof fetch
    const got = await downloadShared('midatl', bad)
    expect(got.ok).toBe(false)
  })
})
