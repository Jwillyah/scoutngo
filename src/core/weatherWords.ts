/*
 * THE WEATHER TAB'S WORDS (Batch K addendum, A and C). Arithmetic on the
 * blended forecast (src/core/modelSkill.ts) and the radar (stormCells.ts);
 * nothing here fetches. Never "clear" or "safe" (ux-rules 12), never advice
 * (rule 28).
 */
import { BLEND_MODELS, MODEL_LABEL, RAIN_MM, skillOverall, type BlendedDay, type BlendedHour, type ModelId, type Scores } from './modelSkill.ts'
import { compassPoint } from './field.ts'

/** One colour per model, the same on every screen (dots, chart lines, card edges). */
export const MODEL_COLOR: Record<ModelId, string> = {
  ncep_nbm_conus: '#7dd3fc',
  gfs_hrrr: '#f472b6',
  ecmwf_ifs025: '#a78bfa',
  ecmwf_aifs025_single: '#fbbf24',
  gfs_global: '#34d399',
  icon_seamless: '#fb923c',
}

/** Rain this likely or more in an hour is "rain"; under RAIN_SOME is not said. */
export const RAIN_LIKELY = 0.5
export const RAIN_SOME = 0.2

/** "No rain expected in the next 6 hours." / "Rain likely from 4 PM (70%)." / "A chance of rain from 3 PM (30%)." */
export function rainLine6h(hours: readonly BlendedHour[], now: Date, clock: (d: Date) => string): string {
  const next = hours.filter((h) => h.at.getTime() > now.getTime() - 3_600_000 && h.at.getTime() <= now.getTime() + 6 * 3_600_000)
  if (next.length === 0 || next.every((h) => h.rain.chance === null)) return 'The models did not say about rain for the next 6 hours.'
  const first = next.find((h) => (h.rain.chance ?? 0) >= RAIN_SOME)
  if (first === undefined) return 'No rain expected in the next 6 hours.'
  const top = Math.max(...next.map((h) => h.rain.chance ?? 0))
  const pct = `${Math.round(top * 100)}%`
  const when = first.at.getTime() <= now.getTime() ? 'now' : `from ${clock(first.at)}`
  return top >= RAIN_LIKELY ? `Rain likely ${when} (${pct}).` : `A chance of rain ${when} (${pct}).`
}

export type StripCell = { kind: 'hour'; at: Date; temp: number | null; rain: number | null; cloud: number | null } | { kind: 'sun'; at: Date; word: 'sunrise' | 'sunset' }

/** The next six hours, hour by hour, with the sunrise or sunset in its place when it falls inside them. */
export function hourlyStrip(hours: readonly BlendedHour[], now: Date, sun: readonly { at: Date; word: 'sunrise' | 'sunset' }[], n = 6): StripCell[] {
  const start = Math.floor(now.getTime() / 3_600_000) * 3_600_000
  const out: StripCell[] = hours
    .filter((h) => h.at.getTime() >= start && h.at.getTime() < start + n * 3_600_000)
    .map((h) => ({ kind: 'hour' as const, at: h.at, temp: h.temp.value, rain: h.rain.chance, cloud: h.cloud.value }))
  const end = start + n * 3_600_000
  for (const s of sun) if (s.at.getTime() > now.getTime() && s.at.getTime() < end) out.push({ kind: 'sun', at: s.at, word: s.word })
  return out.sort((a, b) => a.at.getTime() - b.at.getTime())
}

/** A day's sky as one icon id: the icon set is drawn by the component. */
export type SkyIcon = 'sun' | 'part' | 'cloud' | 'rain' | 'storm'
export function dayIcon(d: BlendedDay, storms = false): SkyIcon {
  if (storms) return 'storm'
  if ((d.rainChance ?? 0) >= RAIN_LIKELY) return 'rain'
  const c = d.cloud ?? 50
  return c < 25 ? 'sun' : c < 70 ? 'part' : 'cloud'
}

/* --------------------------------------------------------- agreement */

export interface Agreement {
  agree: boolean
  /** "agree", "split: 3 of 6", "agree on rain, split on timing". */
  word: string
  /** One plain line why. */
  why: string
}

/**
 * Whether the models agree on a day: on rain (all wet or all dry, by RAIN_MM
 * in the day) and on the high (within AGREE_TEMP_C after correction). When
 * they agree on rain but the wet hours differ by more than 3 hours, "split on
 * timing".
 */
export const AGREE_TEMP_C = 2.5
export function dayAgreement(hours: readonly BlendedHour[]): Agreement {
  const models = BLEND_MODELS.filter((m) => hours.some((h) => h.temp.models.some((x) => x.model === m)))
  if (models.length === 0) return { agree: false, word: '\u2014', why: 'No models for this day.' }
  /* Each model's first wet hour of the day (RAIN_MM in the hour), or none. */
  const firstWet = models.map((m) => hours.find((h) => (h.rain.models.find((x) => x.model === m)?.mm ?? 0) >= RAIN_MM)?.at.getTime() ?? null)
  const wetN = firstWet.filter((x) => x !== null).length
  const highs = models.map((m) => Math.max(...hours.map((h) => h.temp.models.find((x) => x.model === m)?.value ?? -Infinity))).filter(Number.isFinite)
  const tempGap = highs.length < 2 ? 0 : Math.max(...highs) - Math.min(...highs)
  if (wetN > 0 && wetN < models.length) return { agree: false, word: `split: ${wetN} of ${models.length}`, why: `${wetN} of ${models.length} models have rain.` }
  if (wetN === models.length && models.length > 1) {
    const ts = firstWet as number[]
    const spreadH = (Math.max(...ts) - Math.min(...ts)) / 3_600_000
    if (spreadH > 3) return { agree: false, word: 'agree on rain, split on timing', why: `All have rain; when it starts differs by ${Math.round(spreadH)} hours.` }
  }
  if (tempGap > AGREE_TEMP_C) return { agree: false, word: 'split on the high', why: `Their highs differ by ${tempGap.toFixed(0)}°C.` }
  return { agree: true, word: 'agree', why: wetN === models.length ? 'All have rain.' : 'None has rain; highs within a couple of degrees.' }
}

/** Tonight's cloud at an instant: agree when every model is within CLOUD_AGREE points. */
export const CLOUD_AGREE = 30
export function cloudAgreement(h: BlendedHour | null): Agreement {
  if (h === null || h.cloud.models.length === 0) return { agree: false, word: '—', why: 'The models did not say.' }
  const v = h.cloud.models.map((m) => m.value)
  const lo = Math.min(...v)
  const hi = Math.max(...v)
  const n = h.cloud.models.length
  if (hi - lo <= CLOUD_AGREE) return { agree: true, word: 'They agree.', why: `All ${n} have ${Math.round(lo)}–${Math.round(hi)}% cloud at sunset.` }
  const over = v.filter((x) => x >= 50).length
  return { agree: false, word: 'They’re split.', why: `${over} of ${n} have half the sky or more cloudy at sunset; the rest less (${Math.round(lo)}–${Math.round(hi)}%).` }
}

/** The model with the smallest temperature error here, and how many models answered. */
export function leading(h: Scores, models: readonly ModelId[]): ModelId | null {
  let best: { m: ModelId; mae: number } | null = null
  for (const m of models) {
    const s = skillOverall(h, m, 'temp')
    if (s.mae === null || s.days < 3) continue
    if (best === null || s.mae < best.mae) best = { m, mae: s.mae }
  }
  return best?.m ?? null
}

/** One word for a model's habit here: "runs warm", "runs cool", "steady", "wet-biased"… */
export function habitWord(h: Scores, m: ModelId): string {
  const t = skillOverall(h, m, 'temp')
  const r = skillOverall(h, m, 'rain')
  if (t.days < 3) return 'new here'
  if (t.bias !== null && t.bias >= 0.6) return 'runs warm'
  if (t.bias !== null && t.bias <= -0.6) return 'runs cool'
  if (r.hit !== null && r.hit < 0.85) return 'misses rain'
  if (t.mae !== null && t.mae <= 1) return 'steady'
  return 'fair'
}

export const modelName = (m: ModelId) => MODEL_LABEL[m]

/* ------------------------------------------------------- the radar strip */

/** "rain 140 mi N · moving away" from the nearest echo and the cells' flow; null when no echo within reach. */
export function rainNearLine(near: { km: number; bearingDeg: number } | null, flowToDeg: number | null, dist: 'mi' | 'km'): string | null {
  if (near === null) return null
  const d = Math.max(1, Math.round(dist === 'mi' ? near.km / 1.609344 : near.km))
  const where = near.km < 3 ? 'rain over you' : `rain ${d} ${dist} ${compassPoint(near.bearingDeg)}`
  if (flowToDeg === null) return where
  /* Toward you is the flow pointing back along the bearing to the rain. */
  const back = (near.bearingDeg + 180) % 360
  const off = Math.abs((((flowToDeg - back) % 360) + 540) % 360 - 180)
  return `${where} · ${off < 60 ? 'moving toward you' : off > 120 ? 'moving away' : 'moving across'}`
}
