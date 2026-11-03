/*
 * THE BLENDED FORECAST, FETCHED AND SCORED (Batch K, Section 1). The
 * arithmetic is src/core/modelSkill.ts; this asks, reads and keeps.
 *
 * WHAT LEAVES THE PHONE.
 *   Open-Meteo               the venue to 2 decimals and six model names
 *   Open-Meteo previous runs the two nearest stations' own coordinates (not
 *                            the venue) and how many days back
 *   Iowa State (IEM)         two station ids and a date range: their hourly
 *                            reports
 * The scores stay on this phone (localStorage, in the backup file). Asked
 * when the Weather tab is open, and the scoring at most once a day.
 */
import { useEffect, useState } from 'react'
import { ASOS_STATIONS } from '../data/asosStations.ts'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import {
  addDay,
  BLEND_MODELS,
  blendDays,
  blendRun,
  coverFromLayers,
  localDate,
  scoreDay,
  SKILL_DAYS,
  wetFromCodes,
  type BlendedDay,
  type BlendedHour,
  type ModelId,
  type ModelRun,
  type ModelSeries,
  type SkillHistory,
  type SkillVar,
  type StationObs,
} from '../core/modelSkill.ts'
import { zonedTimeToUtc } from '../core/timezone.ts'
import { OPEN_METEO_URL, TIMEOUT_MS } from './forecast.ts'
import { FORECAST_MAX_AGE_MS, weatherJson } from './weatherStore.ts'

export const PREVIOUS_RUNS_URL = 'https://previous-runs-api.open-meteo.com/v1/forecast'
export const IEM_ASOS_URL = 'https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py'
export const BLEND_DAYS = 7
/** Stations within this of the venue are the ones scored against. */
export const SKILL_STATION_KM = 60
const KEY = 'scoutngo.modelSkill.v1'
/** At most this many places' histories are kept. */
const PLACES = 3

const API_VAR: Record<SkillVar | 'dir', string> = { temp: 'temperature_2m', wind: 'wind_speed_10m', gust: 'wind_gusts_10m', cloud: 'cloud_cover', rain: 'precipitation', dir: 'wind_direction_10m' }

/* ------------------------------------------------------------ forecast */

export function blendUrl(at: LatLon): string {
  const p = new URLSearchParams({
    latitude: at.lat.toFixed(2),
    longitude: at.lon.toFixed(2),
    hourly: (['temp', 'wind', 'gust', 'cloud', 'rain', 'dir'] as const).map((v) => API_VAR[v]).join(','),
    models: BLEND_MODELS.join(','),
    wind_speed_unit: 'ms',
    forecast_days: String(BLEND_DAYS + 1),
    timezone: 'GMT',
  })
  return `${OPEN_METEO_URL}?${p.toString()}`
}

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)

export function parseBlend(payload: unknown): ModelRun | null {
  const h = (payload as { hourly?: Record<string, unknown> } | null)?.hourly
  if (h === undefined || !Array.isArray(h.time)) return null
  const series: ModelRun['series'] = {}
  for (const m of BLEND_MODELS) {
    const row: Partial<Record<SkillVar | 'dir', (number | null)[]>> = {}
    for (const v of ['temp', 'wind', 'gust', 'cloud', 'rain', 'dir'] as const) {
      const list = h[`${API_VAR[v]}_${m}`]
      if (Array.isArray(list) && list.some((x) => num(x) !== null)) row[v] = list.map(num)
    }
    if (row.temp !== undefined) series[m] = row
  }
  return Object.keys(series).length === 0 ? null : { times: h.time as string[], series }
}

/* ------------------------------------------------------------ stations */

export interface Station {
  id: string
  name: string
  at: LatLon
  km: number
}

/** The two nearest reporting stations within SKILL_STATION_KM: KNTU and KORF at Virginia Beach. */
export function skillStations(venue: LatLon, n = 2): Station[] {
  return ASOS_STATIONS.map(([id, name, lat, lon]) => ({ id, name, at: { lat, lon }, km: distanceMeters(venue, { lat, lon }) / 1000 }))
    .filter((s) => s.km <= SKILL_STATION_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, n)
}

/** IEM names US stations without their K. */
const iemId = (id: string) => (/^K[A-Z0-9]{3}$/.test(id) ? id.slice(1) : id)

export function asosUrl(ids: readonly string[], from: Date, to: Date): string {
  const p = new URLSearchParams()
  for (const id of ids) p.append('station', iemId(id))
  for (const d of ['tmpf', 'sknt', 'gust', 'skyc1', 'skyc2', 'skyc3', 'skyc4', 'p01i', 'wxcodes']) p.append('data', d)
  p.set('sts', from.toISOString().slice(0, 16) + 'Z')
  p.set('ets', to.toISOString().slice(0, 16) + 'Z')
  p.set('tz', 'Etc/UTC')
  p.set('format', 'onlycomma')
  p.set('latlon', 'no')
  p.set('missing', 'null')
  p.set('trace', '0.0001')
  p.set('report_type', '3')
  return `${IEM_ASOS_URL}?${p.toString()}`
}

const KT = 0.514444

/** IEM's CSV, one row per routine report, in SI units. */
export function parseAsos(csv: string, ids: readonly string[]): StationObs[] {
  const lines = csv.trim().split('\n')
  const head = lines[0]?.split(',') ?? []
  const col = (name: string) => head.indexOf(name)
  if (col('station') < 0 || col('valid') < 0) return []
  const back = new Map(ids.map((id) => [iemId(id), id]))
  const out: StationObs[] = []
  for (const line of lines.slice(1)) {
    const c = line.split(',')
    const v = (name: string) => {
      const x = c[col(name)]
      return x === undefined || x === 'null' || x === 'M' || x === '' ? null : x
    }
    const n = (name: string) => {
      const x = v(name)
      const f = x === null ? NaN : Number(x)
      return Number.isFinite(f) ? f : null
    }
    const id = back.get(v('station') ?? '')
    const valid = v('valid')
    if (id === undefined || valid === null) continue
    const tf = n('tmpf')
    const kt = n('sknt')
    const g = n('gust')
    const p = n('p01i')
    const codes = v('wxcodes')
    out.push({
      station: id,
      at: new Date(`${valid.replace(' ', 'T')}:00Z`),
      tempC: tf === null ? null : ((tf - 32) * 5) / 9,
      windMps: kt === null ? null : kt * KT,
      gustMps: g === null ? null : g * KT,
      cloudPct: coverFromLayers(['skyc1', 'skyc2', 'skyc3', 'skyc4'].map(v)),
      wet: p === null && codes === null ? null : (p ?? 0) > 0 || wetFromCodes(codes),
    })
  }
  return out
}

export function previousRunsUrl(points: readonly LatLon[], pastDays: number): string {
  const p = new URLSearchParams({
    latitude: points.map((x) => x.lat.toFixed(2)).join(','),
    longitude: points.map((x) => x.lon.toFixed(2)).join(','),
    hourly: (['temp', 'wind', 'gust', 'cloud', 'rain'] as const).map((v) => `${API_VAR[v]}_previous_day1`).join(','),
    models: BLEND_MODELS.join(','),
    wind_speed_unit: 'ms',
    past_days: String(pastDays),
    forecast_days: '1',
    timezone: 'GMT',
  })
  return `${PREVIOUS_RUNS_URL}?${p.toString()}`
}

/** Per point, per model, the day-old forecast by UTC hour. */
export function parsePrevious(payload: unknown, n: number): Partial<Record<ModelId, ModelSeries>>[] | null {
  const locs = Array.isArray(payload) ? payload : [payload]
  if (locs.length !== n) return null
  return locs.map((l) => {
    const h = (l as { hourly?: Record<string, unknown> }).hourly
    const out: Partial<Record<ModelId, ModelSeries>> = {}
    if (h === undefined || !Array.isArray(h.time)) return out
    const times = h.time as string[]
    for (const m of BLEND_MODELS) {
      const s: ModelSeries = {}
      for (const v of ['temp', 'wind', 'gust', 'cloud', 'rain'] as const) {
        const list = h[`${API_VAR[v]}_previous_day1_${m}`]
        if (Array.isArray(list)) s[v] = new Map(times.map((t, i) => [t, num(list[i])]))
      }
      out[m] = s
    }
    return out
  })
}

/* ------------------------------------------------------------- history */

type Kept = Record<string, SkillHistory>

export function readSkill(stations: string): SkillHistory | null {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Kept
    const h = all[stations]
    return h !== undefined && Array.isArray(h.days) ? h : null
  } catch {
    return null
  }
}

function writeSkill(h: SkillHistory): void {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Kept
    all[h.stations] = h
    const keep = Object.values(all)
      .sort((a, b) => (b.days.at(-1)?.date ?? '').localeCompare(a.days.at(-1)?.date ?? ''))
      .slice(0, PLACES)
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keep.map((x) => [x.stations, x]))))
  } catch {
    /* storage full or off: scored again next time */
  }
}

const addDays = (date: string, n: number): string => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** The local dates still to score, oldest first: from the day after the newest kept (or 30 days back) to yesterday. */
export function missingDays(h: SkillHistory | null, today: string): string[] {
  const newest = h?.days.at(-1)?.date
  const first = newest === undefined || newest < addDays(today, -SKILL_DAYS) ? addDays(today, -SKILL_DAYS) : addDays(newest, 1)
  const out: string[] = []
  for (let d = first; d < today; d = addDays(d, 1)) out.push(d)
  return out
}

/** A local day's 24 hours as instants. */
export function dayHours(date: string, timeZone: string): (Date | null)[] {
  return Array.from({ length: 24 }, (_, i) => zonedTimeToUtc(date, `${String(i).padStart(2, '0')}:00`, timeZone))
}

/** Scores the days not yet scored and keeps them. Returns the history, scored or not. */
export async function updateSkill(venue: LatLon, timeZone: string, now: Date, fetchImpl: typeof fetch = fetch): Promise<SkillHistory | null> {
  const stations = skillStations(venue)
  if (stations.length === 0) return null
  const key = stations.map((s) => s.id).join(',')
  let h = readSkill(key) ?? { stations: key, days: [] }
  const today = localDate(now, timeZone)
  const todo = missingDays(h, today)
  if (todo.length === 0) return h
  const from = dayHours(todo[0], timeZone)[0]
  if (from === null) return h
  const pastDays = Math.min(92, Math.ceil((now.getTime() - from.getTime()) / 86_400_000) + 1)
  try {
    const [prev, csv] = await Promise.all([
      weatherJson(previousRunsUrl(stations.map((s) => s.at), pastDays), { maxAgeMs: 12 * 60 * 60_000, fetchImpl, timeoutMs: TIMEOUT_MS * 2 }),
      fetchImpl(asosUrl(stations.map((s) => s.id), new Date(from.getTime() - 3_600_000), now), { signal: AbortSignal.timeout(TIMEOUT_MS * 2) }).then((r) => (r.ok ? r.text() : null)),
    ])
    if (!prev.ok || csv === null) return h.days.length === 0 ? null : h
    const per = parsePrevious(prev.payload, stations.length)
    const obs = parseAsos(csv, stations.map((s) => s.id))
    if (per === null || obs.length === 0) return h.days.length === 0 ? null : h
    const forecasts = Object.fromEntries(stations.map((s, i) => [s.id, per[i]]))
    for (const date of todo) {
      const day = scoreDay(date, dayHours(date, timeZone), stations.map((s) => s.id), obs, forecasts)
      if (Object.keys(day.err).length > 0) h = addDay(h, day)
    }
    writeSkill(h)
    return h
  } catch {
    return h.days.length === 0 ? null : h
  }
}

/* ---------------------------------------------------------------- hook */

export interface BlendState {
  hours: BlendedHour[]
  days: BlendedDay[]
  history: SkillHistory | null
  stations: Station[]
  /** When the forecast arrived, ms; stale when served old. */
  fetchedAt: number
  stale: boolean
  /** Which of the six models answered. */
  models: ModelId[]
}

export function useBlend(venue: LatLon | null, timeZone: string | null, on: boolean): { state: BlendState | null; reason: string | null } {
  const [state, setState] = useState<BlendState | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const lat = venue?.lat
  const lon = venue?.lon
  useEffect(() => {
    if (!on || lat === undefined || lon === undefined || timeZone === null) return
    let live = true
    const at = { lat, lon }
    void (async () => {
      /* The forecast first, blended with the scores already kept; the day's scoring after, then blended again. */
      const stations = skillStations(at)
      const kept = stations.length === 0 ? null : readSkill(stations.map((s) => s.id).join(','))
      const got = await weatherJson(blendUrl(at), { maxAgeMs: FORECAST_MAX_AGE_MS, timeoutMs: TIMEOUT_MS * 2 })
      if (!live) return
      if (!got.ok) {
        setReason(got.reason)
        return
      }
      const run = parseBlend(got.payload)
      if (run === null) {
        setReason('the models sent nothing for here')
        return
      }
      const show = (history: SkillHistory | null) => {
        const hours = blendRun(run, history, timeZone)
        setState({ hours, days: blendDays(hours, timeZone, BLEND_DAYS), history, stations, fetchedAt: got.fetchedAt, stale: got.stale, models: BLEND_MODELS.filter((m) => run.series[m] !== undefined) })
        setReason(null)
      }
      show(kept)
      const scored = await updateSkill(at, timeZone, new Date())
      if (live && scored !== null && scored.days.length !== (kept?.days.length ?? 0)) show(scored)
    })()
    return () => {
      live = false
    }
  }, [on, lat, lon, timeZone])
  return { state, reason }
}
