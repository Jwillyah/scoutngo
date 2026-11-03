/*
 * SHARED MODEL CORRECTIONS (Batch L, Section 1). The same arithmetic as the
 * phone's own scoring (modelSkill.ts), done once a night for a whole region
 * by a GitHub Action and published as one static file. The phone downloads
 * the whole region's file, the same bytes for everyone, so the request says
 * nothing about where the phone is; the nearest station is picked here, on
 * the phone. Schema: docs/model-skill.md.
 *
 * WHAT IS SCORED, per station x model x variable x lead x local hour:
 *
 *   temp, dew, wind, gust, cloud   forecast minus measured (°C, °C, m/s, m/s, %)
 *   dir                            forecast minus measured, wrapped to ±180°,
 *                                  only when the measured wind is DIR_MIN_MPS
 *                                  or more (a calm vane points anywhere)
 *   rain                           1 when the forecast's yes/no (RAIN_MM) matched
 *                                  the station's, 0 when not
 *
 * Lead buckets are Open-Meteo's previous runs: d0 is the newest run before
 * the hour (0-24 h ahead), d1 the run a day before (24-48 h), d2 two days
 * (48-72 h). HRRR runs 48 h and has no d2.
 *
 * Per cell: b mean error (the bias), m mean absolute error, s the error's
 * spread around its mean (what is left once the bias is taken out: the
 * blend's weight), h hit rate (rain: called right; the rest: within TOL),
 * n the number of hours.
 */
import { BLEND_MODELS, MIN_DAYS, RAIN_MM, type ModelId, type SharedScores, type Skill, type SkillVar } from './modelSkill.ts'
import { distanceMeters, type LatLon } from './geo.ts'

export const SHARED_SCHEMA = 'scoutngo.model-skill/1'
export const SHARED_VARS = ['temp', 'dew', 'wind', 'gust', 'dir', 'cloud', 'rain'] as const
export type SharedVar = (typeof SHARED_VARS)[number]
export const LEADS = ['d0', 'd1', 'd2'] as const
export type Lead = (typeof LEADS)[number]
/** Within this is a hit, per numeric variable: °C, °C, m/s, m/s, degrees, %. */
export const TOL: Record<Exclude<SharedVar, 'rain'>, number> = { temp: 2, dew: 2, wind: 2, gust: 3, dir: 30, cloud: 25 }
export const DIR_MIN_MPS = 2
/** The shared file is used for this long after it was made; older, the phone's own scores. */
export const SHARED_MAX_AGE_DAYS = 3
/** The nearest station within this of the venue. */
export const SHARED_STATION_KM = 60

type Arr24 = (number | null)[]
export interface Cell {
  b: Arr24
  m: Arr24
  s: Arr24
  h: Arr24
  n: number[]
}

export interface SharedStation {
  id: string
  kind: 'asos' | 'ndbc'
  name: string
  lat: number
  lon: number
  /** Hourly reports used. */
  obs: number
}

export interface SharedFile {
  schema: typeof SHARED_SCHEMA
  region: string
  name: string
  /** The zone the hours of the day are in. */
  timeZone: string
  /** When the Action made it, ISO. */
  generated: string
  /** The local date it was made for: the window ends the day before. */
  date: string
  window: { from: string; to: string; days: number }
  models: ModelId[]
  vars: SharedVar[]
  leads: Lead[]
  stations: SharedStation[]
  /** cells[station][model][var][lead] */
  cells: Record<string, Partial<Record<ModelId, Partial<Record<SharedVar, Partial<Record<Lead, Cell>>>>>>>
  /** The held-out check: temp at d0, the last CHECK_DAYS corrected with the bias of the days before. */
  check: Record<string, Partial<Record<ModelId, { rawBias: number; corrBias: number; rawMae: number; corrMae: number; n: number }>>>
}

export const CHECK_DAYS = 7

/* --------------------------------------------------------------- build */

/** One hourly report at a station or buoy, SI units; null where it did not say. */
export interface Obs {
  at: Date
  temp: number | null
  dew: number | null
  wind: number | null
  gust: number | null
  dir: number | null
  cloud: number | null
  wet: boolean | null
}

/** forecasts[model][lead][var] by UTC hour "2026-11-02T14:00". */
export type LeadSeries = Partial<Record<ModelId, Partial<Record<Lead, Partial<Record<SharedVar, ReadonlyMap<string, number | null>>>>>>>

/** The report nearest a top of the hour, within 30 minutes. */
export function obsNear(obs: readonly Obs[], at: Date): Obs | null {
  let best: Obs | null = null
  let gap = Infinity
  for (const o of obs) {
    const g = Math.abs(o.at.getTime() - at.getTime())
    if (g <= 30 * 60_000 && g < gap) {
      best = o
      gap = g
    }
  }
  return best
}

/** NDBC's realtime2 standard met file: 45 days, newest first, MM for missing; rows with no weather in them dropped. */
export function parseNdbcMet(txt: string): Obs[] {
  const out: Obs[] = []
  const lines = txt.split('\n')
  const head = (lines[0] ?? '').replace(/^#/, '').trim().split(/\s+/)
  const col = (k: string) => head.indexOf(k)
  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue
    const c = line.trim().split(/\s+/)
    const v = (k: string) => {
      const i = col(k)
      const x = i < 0 ? 'MM' : c[i]
      const f = x === undefined || x === 'MM' ? NaN : Number(x)
      return Number.isFinite(f) ? f : null
    }
    const at = new Date(Date.UTC(Number(c[0]), Number(c[1]) - 1, Number(c[2]), Number(c[3]), Number(c[4])))
    if (Number.isNaN(at.getTime())) continue
    const o: Obs = { at, temp: v('ATMP'), dew: v('DEWP'), wind: v('WSPD'), gust: v('GST'), dir: v('WDIR'), cloud: null, wet: null }
    /* Most 10-minute rows carry only the waves: one of those must not stand in for the hour's weather. */
    if (o.temp === null && o.dew === null && o.wind === null) continue
    out.push(o)
  }
  return out
}

/** One error, or null when the pair cannot be scored. */
export function errorOf(v: SharedVar, fc: number, o: Obs): number | null {
  switch (v) {
    case 'rain':
      return o.wet === null ? null : fc >= RAIN_MM === o.wet ? 1 : 0
    case 'gust': {
      /* No gust group means the peak was about the wind itself (modelSkill.ts). */
      const seen = o.gust ?? o.wind
      return seen === null ? null : fc - seen
    }
    case 'dir':
      if (o.dir === null || o.wind === null || o.wind < DIR_MIN_MPS) return null
      return ((((fc - o.dir + 540) % 360) + 360) % 360) - 180
    default: {
      const seen = o[v]
      return seen === null ? null : fc - seen
    }
  }
}

const r2 = (x: number) => Math.round(x * 100) / 100
const r1 = (x: number) => Math.round(x * 10) / 10

/** Aggregates one cell's errors, already grouped by local hour. */
export function cellOf(v: SharedVar, byHour: readonly (readonly number[])[]): Cell | null {
  const c: Cell = { b: [], m: [], s: [], h: [], n: [] }
  let any = false
  for (let hr = 0; hr < 24; hr += 1) {
    const xs = byHour[hr] ?? []
    const n = xs.length
    c.n.push(n)
    if (n === 0) {
      c.b.push(null)
      c.m.push(null)
      c.s.push(null)
      c.h.push(null)
      continue
    }
    any = true
    const mean = xs.reduce((a, x) => a + x, 0) / n
    if (v === 'rain') {
      c.b.push(null)
      c.m.push(null)
      c.s.push(null)
      c.h.push(r2(mean))
      continue
    }
    c.b.push(r1(mean))
    c.m.push(r1(xs.reduce((a, x) => a + Math.abs(x), 0) / n))
    c.s.push(n < 2 ? null : r1(Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / n)))
    c.h.push(r2(xs.filter((x) => Math.abs(x) <= TOL[v]).length / n))
  }
  return any ? c : null
}

export interface BuildInput {
  region: string
  name: string
  timeZone: string
  generated: Date
  /** The local date made for; the window is the WINDOW days before it. */
  date: string
  days: number
  stations: readonly Omit<SharedStation, 'obs'>[]
  obs: Readonly<Record<string, readonly Obs[]>>
  forecasts: Readonly<Record<string, LeadSeries>>
  /** "2026-11-02T14:00" (UTC) -> local hour and local date, in timeZone. */
  local: (utcKey: string) => { hour: number; date: string }
}

const addDays = (date: string, n: number): string => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

export function buildShared(inp: BuildInput): SharedFile {
  const from = addDays(inp.date, -inp.days)
  const to = addDays(inp.date, -1)
  const checkFrom = addDays(inp.date, -CHECK_DAYS)
  const cells: SharedFile['cells'] = {}
  const check: SharedFile['check'] = {}
  const stations: SharedStation[] = []
  for (const st of inp.stations) {
    const obs = inp.obs[st.id] ?? []
    const fc = inp.forecasts[st.id] ?? {}
    const per: SharedFile['cells'][string] = {}
    const usedHours = new Set<string>()
    for (const m of BLEND_MODELS) {
      for (const lead of LEADS) {
        for (const v of SHARED_VARS) {
          const series = fc[m]?.[lead]?.[v]
          if (series === undefined) continue
          const byHour: number[][] = Array.from({ length: 24 }, () => [])
          for (const [key, f] of series) {
            if (typeof f !== 'number' || !Number.isFinite(f)) continue
            const loc = inp.local(key)
            if (loc.date < from || loc.date > to) continue
            const o = obsNear(obs, new Date(`${key}:00Z`))
            if (o === null) continue
            const e = errorOf(v, f, o)
            if (e === null) continue
            byHour[loc.hour].push(e)
            usedHours.add(key)
          }
          const cell = cellOf(v, byHour)
          if (cell === null) continue
          const row = (per[m] ??= {})
          ;(row[v] ??= {})[lead] = cell
        }
      }
      /* The held-out check: is the bias of the earlier days still there in the last week? */
      const t = fc[m]?.d0?.temp
      if (t !== undefined) {
        const early: number[] = []
        const late: number[] = []
        for (const [key, f] of t) {
          if (typeof f !== 'number') continue
          const loc = inp.local(key)
          if (loc.date < from || loc.date > to) continue
          const o = obsNear(obs, new Date(`${key}:00Z`))
          const e = o === null ? null : errorOf('temp', f, o)
          if (e === null) continue
          ;(loc.date < checkFrom ? early : late).push(e)
        }
        if (early.length >= 24 && late.length >= 24) {
          const bias = early.reduce((a, x) => a + x, 0) / early.length
          const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length
          ;(check[st.id] ??= {})[m] = {
            rawBias: r2(mean(late)),
            corrBias: r2(mean(late.map((x) => x - bias))),
            rawMae: r2(mean(late.map(Math.abs))),
            corrMae: r2(mean(late.map((x) => Math.abs(x - bias)))),
            n: late.length,
          }
        }
      }
    }
    cells[st.id] = per
    stations.push({ ...st, obs: usedHours.size })
  }
  return {
    schema: SHARED_SCHEMA,
    region: inp.region,
    name: inp.name,
    timeZone: inp.timeZone,
    generated: inp.generated.toISOString(),
    date: inp.date,
    window: { from, to, days: inp.days },
    models: [...BLEND_MODELS],
    vars: [...SHARED_VARS],
    leads: [...LEADS],
    stations,
    cells,
    check,
  }
}

/** How many cells carry at least one hour: the "rows" of the file. */
export function rowCount(f: SharedFile): number {
  let n = 0
  for (const st of Object.values(f.cells)) for (const mm of Object.values(st)) for (const vv of Object.values(mm ?? {})) for (const c of Object.values(vv ?? {})) n += (c?.n ?? []).filter((x) => x > 0).length
  return n
}

/* ------------------------------------------------------------ validate */

const isArr24 = (a: unknown, nums: boolean): boolean => Array.isArray(a) && a.length === 24 && a.every((x) => (nums ? typeof x === 'number' && x >= 0 : x === null || (typeof x === 'number' && Number.isFinite(x))))

/** Checks a downloaded file against the schema; the reason when it fails. Nothing partly valid is used. */
export function validateShared(x: unknown): { ok: true; file: SharedFile } | { ok: false; reason: string } {
  const f = x as Partial<SharedFile> | null
  if (f === null || typeof f !== 'object') return { ok: false, reason: 'not an object' }
  if (f.schema !== SHARED_SCHEMA) return { ok: false, reason: `schema ${String(f.schema)}` }
  if (typeof f.region !== 'string' || typeof f.timeZone !== 'string' || typeof f.date !== 'string' || typeof f.generated !== 'string' || Number.isNaN(Date.parse(f.generated))) return { ok: false, reason: 'header' }
  if (!Array.isArray(f.stations) || f.stations.length === 0) return { ok: false, reason: 'no stations' }
  if (f.cells === undefined || typeof f.cells !== 'object') return { ok: false, reason: 'no cells' }
  for (const st of f.stations) {
    if (typeof st.id !== 'string' || typeof st.lat !== 'number' || typeof st.lon !== 'number') return { ok: false, reason: 'station' }
    const per = f.cells[st.id]
    if (per === undefined) return { ok: false, reason: `no cells for ${st.id}` }
    for (const [m, vars] of Object.entries(per)) {
      if (!(BLEND_MODELS as readonly string[]).includes(m)) return { ok: false, reason: `model ${m}` }
      for (const [v, leads] of Object.entries(vars ?? {})) {
        if (!(SHARED_VARS as readonly string[]).includes(v)) return { ok: false, reason: `var ${v}` }
        for (const [l, c] of Object.entries(leads ?? {})) {
          if (!(LEADS as readonly string[]).includes(l)) return { ok: false, reason: `lead ${l}` }
          if (c === undefined || !isArr24(c.b, false) || !isArr24(c.m, false) || !isArr24(c.s, false) || !isArr24(c.h, false) || !isArr24(c.n, true)) return { ok: false, reason: `cell ${st.id}/${m}/${v}/${l}` }
        }
      }
    }
  }
  return { ok: true, file: f as SharedFile }
}

/* ----------------------------------------------------------------- use */

export function ageDays(f: SharedFile, now: Date): number {
  return (now.getTime() - Date.parse(f.generated)) / 86_400_000
}

/** The nearest station with scores within SHARED_STATION_KM, or null. */
export function nearestShared(f: SharedFile, venue: LatLon): (SharedStation & { km: number }) | null {
  let best: (SharedStation & { km: number }) | null = null
  for (const st of f.stations) {
    if (st.obs === 0) continue
    const km = distanceMeters(venue, { lat: st.lat, lon: st.lon }) / 1000
    if (km <= SHARED_STATION_KM && (best === null || km < best.km)) best = { ...st, km }
  }
  return best
}

export function leadOf(leadH: number): Lead {
  return leadH < 24 ? 'd0' : leadH < 48 ? 'd1' : 'd2'
}

/** The station's scores as the blend reads them. A lead with no cell falls back to the nearest lead that has one. */
export function sharedScores(f: SharedFile, stationId: string): SharedScores {
  const per = f.cells[stationId] ?? {}
  const cellFor = (m: ModelId, v: SkillVar, leadH: number): Cell | null => {
    const want = leadOf(leadH)
    const order: Lead[] = want === 'd0' ? ['d0', 'd1', 'd2'] : want === 'd1' ? ['d1', 'd0', 'd2'] : ['d2', 'd1', 'd0']
    for (const l of order) {
      const c = per[m]?.[v]?.[l]
      if (c !== undefined) return c
    }
    return null
  }
  const at = (m: ModelId, v: SkillVar, hour: number, leadH: number): Skill => {
    const c = cellFor(m, v, leadH)
    const n = c?.n[hour] ?? 0
    if (c === null || n === 0) return { n: 0, bias: null, rmse: null, mae: null, hit: null }
    if (v === 'rain') return { n, bias: null, rmse: null, mae: null, hit: c.h[hour] }
    if (n < MIN_DAYS) return { n, bias: null, rmse: null, mae: c.m[hour], hit: null }
    return { n, bias: c.b[hour], rmse: c.s[hour], mae: c.m[hour], hit: null }
  }
  const overall = (m: ModelId, v: SkillVar) => {
    const c = per[m]?.[v]?.d0 ?? per[m]?.[v]?.d1 ?? null
    if (c === null) return { n: 0, mae: null, bias: null, hit: null, days: 0 }
    let n = 0
    let b = 0
    let mae = 0
    let hit = 0
    for (let hr = 0; hr < 24; hr += 1) {
      const k = c.n[hr]
      if (k === 0) continue
      n += k
      if (v === 'rain') hit += (c.h[hr] ?? 0) * k
      else {
        b += (c.b[hr] ?? 0) * k
        mae += (c.m[hr] ?? 0) * k
      }
    }
    if (n === 0) return { n: 0, mae: null, bias: null, hit: null, days: 0 }
    return v === 'rain' ? { n, mae: null, bias: null, hit: hit / n, days: f.window.days } : { n, mae: mae / n, bias: b / n, hit: null, days: f.window.days }
  }
  return { kind: 'shared', station: stationId, date: f.date, at, overall }
}

/**
 * WHICH SCORES THE BLEND USES: the shared file's nearest station when the
 * file is fresh (SHARED_MAX_AGE_DAYS) and has a station near; otherwise the
 * phone's own scoring (Batch K). Never a mix of the two.
 */
export function pickScores<P>(shared: SharedFile | null, venue: LatLon, now: Date, phone: P): { scores: SharedScores; station: SharedStation & { km: number } } | { scores: P; station: null } {
  if (shared === null || ageDays(shared, now) > SHARED_MAX_AGE_DAYS || ageDays(shared, now) < -1) return { scores: phone, station: null }
  const st = nearestShared(shared, venue)
  if (st === null) return { scores: phone, station: null }
  return { scores: sharedScores(shared, st.id), station: st }
}
