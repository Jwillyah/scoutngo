/*
 * BETTER BASE FORECAST (Batch K, Section 1): six models, corrected for their
 * local habits, blended by how well each did here.
 *
 * Everyone starts from the same models. What a phone can add is what the
 * stations near this spot actually measured, and how each model has been
 * wrong against them. All of it is arithmetic on numbers kept on this phone.
 *
 * SCORING ("MOS-lite"). Each day, for each of the last day's local hours,
 * each model's forecast made the day before (Open-Meteo's previous-runs
 * archive, "previous_day1") is compared with the nearest stations' hourly
 * report: temperature, wind, gust and cloud as forecast minus measured, rain
 * as hit or miss. A day's error for one hour is the mean over the stations.
 * Kept for SKILL_DAYS days, per model, per variable, per hour of the day.
 *
 *   gust   a report with no gust group is scored against its steady wind:
 *          no gust reported means the peak was about the wind itself
 *   cloud  scored only when the station reports a layer: CLR means nothing
 *          below 12,000 ft, and the station cannot see above that
 *   rain   forecast yes at RAIN_MM or more in the hour; measured yes when
 *          the hour's precipitation is over zero or the report carries rain,
 *          drizzle, snow or thunder
 *
 * CORRECTING. A model's bias for a variable at an hour is the mean of its
 * kept errors there, used once MIN_DAYS days have one; the corrected value
 * is the forecast minus it. Rain is yes or no and is not shifted.
 *
 * BLENDING. Each model's weight is 1 / (its corrected error)², its root mean
 * square error after the bias is taken out, floored at FLOOR so one lucky
 * fortnight does not take the whole blend. A model with no history gets the
 * mean weight of those that have one, and with no history at all every
 * model weighs the same. Rain's weight is the model's hit rate. The spread
 * is the lowest and highest corrected model.
 */

export const BLEND_MODELS = ['ncep_nbm_conus', 'gfs_hrrr', 'ecmwf_ifs025', 'ecmwf_aifs025_single', 'gfs_global', 'icon_seamless'] as const
export type ModelId = (typeof BLEND_MODELS)[number]
export const MODEL_LABEL: Record<ModelId, string> = {
  ncep_nbm_conus: 'NBM',
  gfs_hrrr: 'HRRR',
  ecmwf_ifs025: 'ECMWF',
  ecmwf_aifs025_single: 'AIFS',
  gfs_global: 'GFS',
  icon_seamless: 'ICON',
}

export const SKILL_VARS = ['temp', 'wind', 'gust', 'cloud', 'rain'] as const
export type SkillVar = (typeof SKILL_VARS)[number]
/** The four that are numbers; rain is yes or no. */
export type NumVar = Exclude<SkillVar, 'rain'>

export const SKILL_DAYS = 30
export const MIN_DAYS = 3
export const RAIN_MM = 0.1
/** The least error a weight may assume, per variable: °C, m/s, m/s, %. */
export const FLOOR: Record<NumVar, number> = { temp: 0.5, wind: 0.5, gust: 0.8, cloud: 10 }

/** One day's errors at one place: [model][variable][local hour 0-23]; rain is 1 hit, 0 miss. */
export interface SkillDay {
  date: string
  err: Partial<Record<ModelId, Partial<Record<SkillVar, (number | null)[]>>>>
}

export interface SkillHistory {
  /** The stations scored against, nearest first: "KNTU,KORF". */
  stations: string
  days: SkillDay[]
}

/** The day added, a day of the same date replaced, only the last SKILL_DAYS kept. */
export function addDay(h: SkillHistory, day: SkillDay): SkillHistory {
  const days = [...h.days.filter((d) => d.date !== day.date), day].sort((a, b) => a.date.localeCompare(b.date)).slice(-SKILL_DAYS)
  return { ...h, days }
}

export interface Skill {
  /** Days with a value at this hour. */
  n: number
  /** Mean forecast minus measured; null under MIN_DAYS. */
  bias: number | null
  /** Root mean square error after the bias is taken out. */
  rmse: number | null
  /** Mean absolute error as forecast, before any correction: what the table shows. */
  mae: number | null
  /** Rain only: share of hours called right. */
  hit: number | null
}

const NONE: Skill = { n: 0, bias: null, rmse: null, mae: null, hit: null }

export interface Overall {
  n: number
  mae: number | null
  bias: number | null
  hit: number | null
  days: number
}

/**
 * The shared file's scores at one station (Batch L, src/core/sharedSkill.ts):
 * the same questions, answered from the region's nightly file instead of
 * this phone's own history, and by lead time as well as hour.
 */
export interface SharedScores {
  kind: 'shared'
  station: string
  /** The local date the file was made for. */
  date: string
  at: (model: ModelId, v: SkillVar, hour: number, leadH: number) => Skill
  overall: (model: ModelId, v: SkillVar) => Overall
}

/** What the blend is corrected with: this phone's history, the shared file's station, or nothing yet. */
export type Scores = SkillHistory | SharedScores | null

const isShared = (h: Scores): h is SharedScores => h !== null && 'kind' in h

/** `leadH`, hours ahead of the run, is read by the shared scores only: the phone scores the day-old run. */
export function skillAt(h: Scores, model: ModelId, v: SkillVar, hour: number, leadH = 0): Skill {
  if (h === null) return NONE
  if (isShared(h)) return h.at(model, v, hour, leadH)
  const xs = h.days.map((d) => d.err[model]?.[v]?.[hour]).filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  const n = xs.length
  if (n === 0) return NONE
  const mean = xs.reduce((a, b) => a + b, 0) / n
  if (v === 'rain') return { n, bias: null, rmse: null, mae: null, hit: mean }
  const mae = xs.reduce((a, b) => a + Math.abs(b), 0) / n
  if (n < MIN_DAYS) return { n, bias: null, rmse: null, mae, hit: null }
  const rmse = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n)
  return { n, bias: mean, rmse, mae, hit: null }
}

/** Over every hour: the table's row for one model and variable. */
export function skillOverall(h: Scores, model: ModelId, v: SkillVar): Overall {
  if (h === null) return { n: 0, mae: null, bias: null, hit: null, days: 0 }
  if (isShared(h)) return h.overall(model, v)
  const xs: number[] = []
  let days = 0
  for (const d of h.days) {
    const row = (d.err[model]?.[v] ?? []).filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
    if (row.length > 0) days += 1
    xs.push(...row)
  }
  if (xs.length === 0) return { n: 0, mae: null, bias: null, hit: null, days }
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  if (v === 'rain') return { n: xs.length, mae: null, bias: null, hit: mean, days }
  return { n: xs.length, mae: xs.reduce((a, b) => a + Math.abs(b), 0) / xs.length, bias: mean, hit: null, days }
}

const clampVar = (v: NumVar, x: number): number => (v === 'cloud' ? Math.min(100, Math.max(0, x)) : v === 'temp' ? x : Math.max(0, x))

/** One model's forecast for one hour, with its local bias taken out. */
export function corrected(h: Scores, model: ModelId, v: NumVar, hour: number, value: number, leadH = 0): number {
  const s = skillAt(h, model, v, hour, leadH)
  return s.bias === null ? value : clampVar(v, value - s.bias)
}

export interface Blended {
  value: number | null
  /** Lowest and highest corrected model. */
  lo: number | null
  hi: number | null
  /** Each model's corrected value and its share of the blend, 0-1. */
  models: { model: ModelId; raw: number; value: number; weight: number }[]
}

/** The weights for one variable at one hour, normalised; models with no history get the mean of the others. */
export function weights(h: Scores, models: readonly ModelId[], v: SkillVar, hour: number, leadH = 0): Map<ModelId, number> {
  const raw = new Map<ModelId, number | null>()
  for (const m of models) {
    const s = skillAt(h, m, v, hour, leadH)
    if (v === 'rain') raw.set(m, s.hit === null || s.n < MIN_DAYS ? null : Math.max(0.05, s.hit))
    else raw.set(m, s.rmse === null ? null : 1 / Math.max(FLOOR[v], s.rmse) ** 2)
  }
  const known = [...raw.values()].filter((x): x is number => x !== null)
  const fill = known.length === 0 ? 1 : known.reduce((a, b) => a + b, 0) / known.length
  const total = models.reduce((a, m) => a + (raw.get(m) ?? fill), 0)
  return new Map(models.map((m) => [m, (raw.get(m) ?? fill) / total]))
}

/** One variable at one hour: every model that has a value, corrected and weighed. */
export function blendHour(h: Scores, v: NumVar, hour: number, values: Partial<Record<ModelId, number | null>>, leadH = 0): Blended {
  const have = BLEND_MODELS.filter((m) => typeof values[m] === 'number' && Number.isFinite(values[m]))
  if (have.length === 0) return { value: null, lo: null, hi: null, models: [] }
  const w = weights(h, have, v, hour, leadH)
  const models = have.map((m) => {
    const raw = values[m] as number
    return { model: m, raw, value: corrected(h, m, v, hour, raw, leadH), weight: w.get(m) ?? 0 }
  })
  const value = models.reduce((a, x) => a + x.value * x.weight, 0)
  return { value, lo: Math.min(...models.map((x) => x.value)), hi: Math.max(...models.map((x) => x.value)), models }
}

/** Rain at one hour: the weighted share of models with RAIN_MM or more, 0-1. */
export function rainChance(h: Scores, hour: number, mm: Partial<Record<ModelId, number | null>>, leadH = 0): { chance: number | null; wet: number; of: number; models: { model: ModelId; mm: number }[] } {
  const have = BLEND_MODELS.filter((m) => typeof mm[m] === 'number' && Number.isFinite(mm[m]))
  if (have.length === 0) return { chance: null, wet: 0, of: 0, models: [] }
  const w = weights(h, have, 'rain', hour, leadH)
  const wet = have.filter((m) => (mm[m] as number) >= RAIN_MM)
  return { chance: wet.reduce((a, m) => a + (w.get(m) ?? 0), 0), wet: wet.length, of: have.length, models: have.map((m) => ({ model: m, mm: mm[m] as number })) }
}

/* ------------------------------------------------------------- scoring */

/** One station's hourly report, already in SI units. */
export interface StationObs {
  station: string
  at: Date
  tempC: number | null
  /** Dew point and where the wind is from: read for the shared file (Batch L); the phone's scoring does not use them. */
  dewC?: number | null
  dirDeg?: number | null
  windMps: number | null
  gustMps: number | null
  /** Cover from the reported layers, %; null when the station reports none (CLR: it sees only below 12,000 ft). */
  cloudPct: number | null
  /** Rain in the hour, or rain in the report; null when unknown. */
  wet: boolean | null
}

/** One model's forecast at one station, by UTC hour ("2026-11-02T14:00"). */
export type ModelSeries = Partial<Record<SkillVar, ReadonlyMap<string, number | null>>>

/** The station's report for a top of the hour: the routine one within 30 minutes before it, or after. */
export function obsAtHour(obs: readonly StationObs[], station: string, hourStart: Date): StationObs | null {
  let best: StationObs | null = null
  let bestGap = Infinity
  for (const o of obs) {
    if (o.station !== station) continue
    const gap = Math.abs(o.at.getTime() - hourStart.getTime())
    if (gap <= 30 * 60_000 && gap < bestGap) {
      best = o
      bestGap = gap
    }
  }
  return best
}

const r1 = (x: number) => Math.round(x * 10) / 10

/**
 * One local day's errors. `hours` are that day's 24 local hours as instants
 * (a day of 23 or 25 hours keeps 24 slots, the missing one null);
 * `forecasts[station][model]` the model's forecast at each station.
 */
export function scoreDay(
  date: string,
  hours: readonly (Date | null)[],
  stations: readonly string[],
  obs: readonly StationObs[],
  forecasts: Readonly<Record<string, Partial<Record<ModelId, ModelSeries>>>>,
): SkillDay {
  const err: SkillDay['err'] = {}
  for (const m of BLEND_MODELS) {
    const row: Partial<Record<SkillVar, (number | null)[]>> = {}
    let any = false
    for (const v of SKILL_VARS) {
      const out = hours.map((at) => {
        if (at === null) return null
        const key = at.toISOString().slice(0, 16)
        const per: number[] = []
        for (const s of stations) {
          const fc = forecasts[s]?.[m]?.[v]?.get(key)
          const o = obsAtHour(obs, s, at)
          if (typeof fc !== 'number' || o === null) continue
          if (v === 'rain') {
            if (o.wet !== null) per.push(fc >= RAIN_MM === o.wet ? 1 : 0)
            continue
          }
          const seen = v === 'temp' ? o.tempC : v === 'wind' ? o.windMps : v === 'gust' ? (o.gustMps ?? o.windMps) : o.cloudPct
          if (seen !== null) per.push(fc - seen)
        }
        return per.length === 0 ? null : r1(per.reduce((a, b) => a + b, 0) / per.length)
      })
      if (out.some((x) => x !== null)) {
        row[v] = out
        any = true
      }
    }
    if (any) err[m] = row
  }
  return { date, err }
}

/* --------------------------------------------------- reports as numbers */

const COVER: Record<string, number> = { FEW: 19, SCT: 44, BKN: 75, OVC: 100, VV: 100 }

/** The most a station's layers cover, %; null for CLR or none. */
export function coverFromLayers(layers: readonly (string | null)[]): number | null {
  const pcts = layers.map((l) => (l === null ? undefined : COVER[l.trim()])).filter((x): x is number => x !== undefined)
  return pcts.length === 0 ? null : Math.max(...pcts)
}

/** Rain, drizzle, snow, hail or thunder at the station ("VCSH", in the vicinity, is not at it). */
export function wetFromCodes(codes: string | null): boolean {
  if (codes === null) return false
  return codes.split(/\s+/).some((t) => !t.startsWith('VC') && /RA|DZ|SN|TS|GR|GS|PL|UP/.test(t))
}

/* -------------------------------------------------- the whole forecast */

/** Every model's hourly forecast at the venue: series[model][var][i] for times[i] (UTC "2026-11-03T14:00"). */
export interface ModelRun {
  times: readonly string[]
  series: Partial<Record<ModelId, Partial<Record<SkillVar | 'dir', readonly (number | null)[]>>>>
}

export interface BlendedHour {
  at: Date
  temp: Blended
  wind: Blended
  gust: Blended
  cloud: Blended
  rain: { chance: number | null; wet: number; of: number; models: { model: ModelId; mm: number }[] }
  /** Where the wind comes from, the weighted circular mean of the models, degrees; null with none. */
  fromDeg: number | null
}

/** The local hour 0-23 of an instant in a zone. */
export function localHour(at: Date, timeZone: string): number {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(at)) // clock-audit: data, an hour index for the scores, never shown
  return Number.isFinite(h) ? h % 24 : at.getUTCHours()
}

/** The local date "2026-11-03" of an instant in a zone. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

/**
 * `issued` is when the run was fetched: the shared scores are by how far
 * ahead an hour is (0-24 h, 24-48 h, 48 h on). Defaults to the run's first hour.
 */
export function blendRun(run: ModelRun, h: Scores, timeZone: string, issued?: Date): BlendedHour[] {
  const t0 = issued?.getTime() ?? (run.times.length === 0 ? 0 : Date.parse(`${run.times[0]}:00Z`))
  return run.times.map((t, i) => {
    const at = new Date(`${t}:00Z`)
    const hour = localHour(at, timeZone)
    const leadH = Math.max(0, (at.getTime() - t0) / 3_600_000)
    const pick = (v: SkillVar | 'dir') => Object.fromEntries(BLEND_MODELS.map((m) => [m, run.series[m]?.[v]?.[i] ?? null])) as Partial<Record<ModelId, number | null>>
    const wind = blendHour(h, 'wind', hour, pick('wind'), leadH)
    const dirs = pick('dir')
    let x = 0
    let y = 0
    for (const m of wind.models) {
      const d = dirs[m.model]
      if (typeof d !== 'number') continue
      x += m.weight * Math.cos((d * Math.PI) / 180)
      y += m.weight * Math.sin((d * Math.PI) / 180)
    }
    const fromDeg = x === 0 && y === 0 ? null : ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
    /* A gust is never less than the wind it gusts over: corrected separately, the two can cross. */
    const g = blendHour(h, 'gust', hour, pick('gust'), leadH)
    const gust = g.value !== null && wind.value !== null && g.value < wind.value ? { ...g, value: wind.value } : g
    return { at, temp: blendHour(h, 'temp', hour, pick('temp'), leadH), wind, gust, cloud: blendHour(h, 'cloud', hour, pick('cloud'), leadH), rain: rainChance(h, hour, pick('rain'), leadH), fromDeg }
  })
}

export interface BlendedDay {
  date: string
  hi: number | null
  lo: number | null
  /** The day's high as each model has it (corrected), lowest and highest: the spread. */
  hiLo: number | null
  hiHi: number | null
  windMax: number | null
  gustMax: number | null
  /** The day's highest hourly rain chance, and the local hours it is highest in. */
  rainChance: number | null
  rainFrom: Date | null
  rainTo: Date | null
  /** Mean blended cloud over the daylight-ish hours 8-18. */
  cloud: number | null
}

export function blendDays(hours: readonly BlendedHour[], timeZone: string, days = 7): BlendedDay[] {
  const by = new Map<string, BlendedHour[]>()
  for (const h of hours) {
    const d = localDate(h.at, timeZone)
    by.set(d, [...(by.get(d) ?? []), h])
  }
  const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null)
  const out: BlendedDay[] = []
  for (const [date, hs] of by) {
    if (hs.length < 12) continue
    const temps = nums(hs.map((h) => h.temp.value))
    const perModelHi = BLEND_MODELS.map((m) => nums(hs.map((h) => h.temp.models.find((x) => x.model === m)?.value ?? null))).filter((xs) => xs.length >= 12).map((xs) => Math.max(...xs))
    const chances = hs.map((h) => h.rain.chance ?? 0)
    const top = Math.max(...chances)
    const wetHours = top > 0 ? hs.filter((h) => (h.rain.chance ?? 0) >= top - 0.1) : []
    const dayCloud = nums(hs.filter((h) => { const l = localHour(h.at, timeZone); return l >= 8 && l <= 18 }).map((h) => h.cloud.value))
    out.push({
      date,
      hi: temps.length === 0 ? null : Math.max(...temps),
      lo: temps.length === 0 ? null : Math.min(...temps),
      hiLo: perModelHi.length === 0 ? null : Math.min(...perModelHi),
      hiHi: perModelHi.length === 0 ? null : Math.max(...perModelHi),
      windMax: nums(hs.map((h) => h.wind.value)).reduce<number | null>((a, b) => (a === null ? b : Math.max(a, b)), null),
      gustMax: nums(hs.map((h) => h.gust.value)).reduce<number | null>((a, b) => (a === null ? b : Math.max(a, b)), null),
      rainChance: hs.every((h) => h.rain.chance === null) ? null : top,
      rainFrom: wetHours[0]?.at ?? null,
      rainTo: wetHours.length === 0 ? null : new Date(wetHours[wetHours.length - 1].at.getTime() + 3_600_000),
      cloud: dayCloud.length === 0 ? null : dayCloud.reduce((a, b) => a + b, 0) / dayCloud.length,
    })
  }
  return out.slice(0, days)
}

/** The hour nearest an instant. */
export function hourAt(hours: readonly BlendedHour[], at: Date): BlendedHour | null {
  let best: BlendedHour | null = null
  for (const h of hours) if (best === null || Math.abs(h.at.getTime() - at.getTime()) < Math.abs(best.at.getTime() - at.getTime())) best = h
  return best !== null && Math.abs(best.at.getTime() - at.getTime()) <= 90 * 60_000 ? best : null
}

/** Cloud as an amount, never "clear". */
export function cloudWords(pct: number | null): string {
  if (pct === null) return 'cloud not said'
  if (pct < 20) return 'little cloud'
  if (pct < 50) return 'partly cloudy'
  if (pct < 85) return 'mostly cloudy'
  return 'overcast'
}

