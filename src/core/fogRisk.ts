/*
 * FOG, PER SPOT, PER HOUR (Batch SIMPLE-3, Section 1). Code decides; no model
 * is asked whether there is fog.
 *
 * WHY. Three misses at Virginia Beach: 21 Nov at sunrise (fog and a good
 * sunrise), 23 Nov at 11 AM (haze), 23 Nov at 4:30 PM (sea fog on the beach
 * while inland the sky fired). The app said nothing of fog at any of them.
 *
 * THE RULES, as the batch writes them:
 *
 *   sea fog        a coastal spot (it has a facing), the dew point at or
 *                  above the water's temperature less SEA_DEW_MARGIN_F, and
 *                  the wind SEA_WIND_KT or under, onshore or cross-onshore
 *                  (src/core/coastFacing.ts windSide)
 *   radiation fog  the air within RAD_SPREAD_F of its dew point, the wind
 *                  RAD_WIND_KT or under, a clear-ish sky (no low or mid deck
 *                  over CLEARISH_PCT; a station's: nothing broken or
 *                  overcast under 12,000 ft), at night or early morning (the
 *                  sun under EARLY_SUN_DEG before noon, or down)
 *   confirm        any visibility CONFIRM_VIS_MI or under within NEAR_KM
 *                  (15 mi), a station's or the model's at the spot, or a
 *                  station reporting fog (FG, MIFG, BCFG, PRFG, FZFG, VCFG):
 *                  high, whatever the rules said. A low visibility in rain
 *                  (the station reports rain or snow and no fog or mist; the
 *                  model has precipitation that hour) is the rain, not fog.
 *   downgrade      every visibility known is CLEAR_VIS_MI (6 mi) or more,
 *                  and nobody reports fog: a step down (high to moderate).
 *
 * WHICH VISIBILITIES CAN DOWNGRADE SEA FOG (decision, SIMPLE-3 log). A sea
 * fog bank lies along the beach; an airport inland and the model's grid
 * visibility do not see it. 23 Nov at 4:30 PM KNTU, 3.5 mi inland, read
 * 10 miles and the model 9.3 while the beach was fogged in. So only a
 * station on the water (`onWater`) can downgrade sea fog; any source can
 * still confirm it, and radiation fog is downgraded by every source.
 *
 * THE AIR. A fresh station within NEAR_KM with a temperature and dew point
 * (the nearest) stands in for the model's: it measured, the model guessed
 * (21 Nov 6 AM: KNTU 5.0/4.4 °C, the model 8.3/4.2 at the beach). Its wind
 * stands in when it reported one.
 *
 * Levels: high, moderate (the rule held but every visibility is clear),
 * low (no rule held and nothing seen). Null where the rules lack a number
 * and nothing was seen: "could not say", never "no fog".
 *
 * Pure: the spot's hours, its water and the stations' reports in; nothing
 * fetched. Units in: °C, m/s, metres, km. The rules read °F, knots and
 * miles, as the batch writes them.
 */
import { getPosition, getTimes } from 'suncalc'
import { windSide } from './coastFacing.ts'
import { metarTime, parseMetarSky, parseMetarWind, type MetarSky } from './metar.ts'
import { metarVisMiles } from './skyWord.ts'
import type { SkyCall } from './skyCall.ts'
import type { Call } from './briefing.ts'
import { colorWords } from './homeDay.ts'
import { formatHour, formatSpan } from './timezone.ts'

export const SEA_DEW_MARGIN_F = 1
export const SEA_WIND_KT = 12
export const RAD_SPREAD_F = 2
export const RAD_WIND_KT = 4
export const CONFIRM_VIS_MI = 2
export const CLEAR_VIS_MI = 6
/** 15 miles. */
export const NEAR_KM = 24.14
/** A station's report counts this long after it was made (the app's 75 minutes, src/core/stationPick.ts). */
export const STATION_MAX_AGE_MS = 75 * 60_000
/** And this far ahead of the time asked: an hour is read at its own time, a report at :56 belongs to it. */
export const STATION_AHEAD_MS = 10 * 60_000
/** The model's hour this close to the time asked. */
export const MODEL_GAP_MS = 31 * 60_000
/** Clear-ish: the low and the mid layer each under this, per cent. */
export const CLEARISH_PCT = 50
/** Early morning: the sun under this before noon. Night: the sun down. */
export const EARLY_SUN_DEG = 10

const MI_M = 1609.344
const KT_MPS = 0.514444
const cToF = (c: number) => (c * 9) / 5 + 32
const r0 = (x: number) => Math.round(x)

export type FogLevel = 'low' | 'moderate' | 'high'
/** Sea and radiation: the rule that held. Reported: seen (a station, the model's visibility) with no rule to explain it. */
export type FogKind = 'sea' | 'radiation' | 'reported'

/** One forecast hour at the spot (Open-Meteo's, as the brief asks it). */
export interface FogModelHour {
  at: Date
  tempC: number | null
  dewC: number | null
  /** 10 m. */
  windMps: number | null
  windFromDeg: number | null
  /** Open-Meteo `visibility`, metres. */
  visibilityM: number | null
  lowCloudPct: number | null
  midCloudPct: number | null
  /** mm in the hour: a low visibility with rain is the rain. */
  precipMm?: number | null
}

/** One station's report near the spot. stationFog() builds it from a raw METAR. */
export interface FogStation {
  id: string
  /** From the spot. */
  km: number
  /** On the water (a CO-OPS pier, an NDBC buoy): it sees a sea fog bank. An airport is not. */
  onWater: boolean
  at: Date
  visMi: number | null
  /** Present weather, METAR tokens ("-RA BR", "MIFG"), or null when none reported. */
  wx: string | null
  tempC: number | null
  dewC: number | null
  windKt: number | null
  /** Null: variable or calm. */
  fromDeg: number | null
  sky: MetarSky | null
}

/** GOES fog or low stratus over the spot, when such a read exists (none is wired yet: the app reads band 13 only, which cannot see low cloud at night). */
export interface FogSat {
  at: Date
  fogOrLowStratus: boolean
}

export interface FogSpot {
  lat: number
  lon: number
  /** The beach's facing; null inland (src/lib/coast.ts coastFacing, the brief's `facing`). */
  facingDeg: number | null
  /** The spot's water now, °C (src/core/waterTemp.ts pickWater); null inland or unknown. */
  waterC: number | null
  hours: readonly FogModelHour[]
  stations: readonly FogStation[]
  sat?: FogSat | null
}

export interface FogHour {
  at: Date
  level: FogLevel | null
  kind: FogKind | null
  /** Why, in words, the numbers the rules read: "dew 61 °F ≥ water 59 °F − 1", "wind 4 kt onshore", "KNTU 1/4 mi FG". */
  reasons: string[]
  /** The lowest visibility known near the spot then, miles; null when none. */
  visMi: number | null
  coastal: boolean
}

/* ------------------------------------------------------------- stations */

const FOG_TOKEN = /^(MI|BC|PR|FZ|VC)?FG$/
const MIST_TOKEN = /^BR$/
const WET_TOKEN = /^[-+]?(VC)?(SH|TS)?(RA|DZ|SN|SG|PL|GR|GS|UP)+$/

/** Present-weather tokens of a METAR body (before RMK): "-RA BR", null when none. */
export function metarWeather(raw: string): string | null {
  const body = raw.split(' RMK')[0].trim().split(/\s+/)
  const got = body.filter((t) => FOG_TOKEN.test(t) || MIST_TOKEN.test(t) || WET_TOKEN.test(t) || /^[-+]?(VC)?(SH|TS)$/.test(t) || /^(HZ|FU|DU|SA)$/.test(t))
  return got.length === 0 ? null : got.join(' ')
}

/** The air of a METAR, °C: the remarks' tenths (T01500117) when there, else the body's whole degrees (15/12, M01/M02). */
export function metarAir(raw: string): { tempC: number | null; dewC: number | null } {
  const t = / T([01])(\d{3})([01])(\d{3})\b/.exec(raw)
  if (t !== null) {
    const v = (s: string, n: string) => (s === '1' ? -1 : 1) * (Number(n) / 10)
    return { tempC: v(t[1], t[2]), dewC: v(t[3], t[4]) }
  }
  const m = /(?:^|\s)(M?\d{2})\/(M?\d{2})?(?=\s)/.exec(raw.split(' RMK')[0] + ' ')
  if (m === null) return { tempC: null, dewC: null }
  const d = (s: string | undefined) => (s === undefined ? null : s.startsWith('M') ? -Number(s.slice(1)) : Number(s))
  return { tempC: d(m[1]), dewC: d(m[2]) }
}

/** A station's report for the fog rules, from its raw METAR. `now` dates the report (its DDHHMMZ group). Null without a time. */
export function stationFog(raw: string, station: { id: string; km: number; onWater: boolean }, now: Date): FogStation | null {
  const at = metarTime(raw, now)
  if (at === null) return null
  const w = parseMetarWind(raw)
  const air = metarAir(raw)
  return { ...station, at, visMi: metarVisMiles(raw), wx: metarWeather(raw), tempC: air.tempC, dewC: air.dewC, windKt: w?.kt ?? null, fromDeg: w?.fromDeg ?? null, sky: parseMetarSky(raw) }
}

const tokens = (wx: string | null) => (wx === null ? [] : wx.split(/\s+/))
const reportsFog = (s: FogStation) => tokens(s.wx).some((t) => FOG_TOKEN.test(t))
const reportsMist = (s: FogStation) => tokens(s.wx).some((t) => MIST_TOKEN.test(t))
const reportsWet = (s: FogStation) => tokens(s.wx).some((t) => WET_TOKEN.test(t))

/** Each station's newest report fresh at `t`, within NEAR_KM, nearest first. */
export function stationsAt(stations: readonly FogStation[], t: Date): FogStation[] {
  const best = new Map<string, FogStation>()
  for (const s of stations) {
    const age = t.getTime() - s.at.getTime()
    if (s.km > NEAR_KM || age > STATION_MAX_AGE_MS || age < -STATION_AHEAD_MS) continue
    const had = best.get(s.id)
    if (had === undefined || s.at.getTime() > had.at.getTime()) best.set(s.id, s)
  }
  return [...best.values()].sort((a, b) => a.km - b.km)
}

/* ------------------------------------------------------------ the rules */

function modelAt(hours: readonly FogModelHour[], t: Date): FogModelHour | null {
  let best: FogModelHour | null = null
  for (const h of hours) if (best === null || Math.abs(h.at.getTime() - t.getTime()) < Math.abs(best.at.getTime() - t.getTime())) best = h
  return best !== null && Math.abs(best.at.getTime() - t.getTime()) <= MODEL_GAP_MS ? best : null
}

/** Night, or the early morning: the sun down, or under EARLY_SUN_DEG before the day's solar noon. */
export function nightOrEarly(t: Date, lat: number, lon: number): boolean {
  /* suncalc 2 gives degrees (src/core/skyCall.ts reads its azimuth the same way). */
  const alt = getPosition(t, lat, lon).altitude
  if (alt < 0) return true
  const noon = getTimes(t, lat, lon).solarNoon
  return alt < EARLY_SUN_DEG && t.getTime() < noon.getTime()
}

const DECK = new Set(['BKN', 'OVC', 'VV'])
/** Clear-ish: a station's sky with nothing broken or overcast under 12,000 ft; else the model's low and mid layers under CLEARISH_PCT. Null when neither says. */
function clearish(st: FogStation | null, m: FogModelHour | null): boolean | null {
  if (st?.sky != null) return !st.sky.groups.some((g) => DECK.has(g.amount) && g.baseFt < 12_000)
  if (m === null || m.lowCloudPct === null || m.midCloudPct === null) return null
  return m.lowCloudPct < CLEARISH_PCT && m.midCloudPct < CLEARISH_PCT
}

const visWords = (mi: number) => (mi >= 1 ? `${r0(mi * 10) / 10} mi` : mi >= 0.25 ? `${r0(mi * 4) / 4} mi` : 'under 1/4 mi')

/** The fog at the spot at `t`: the rules on the air there (a fresh station's over the model's), then what the visibilities say. */
export function fogAt(spot: FogSpot, t: Date): FogHour {
  const coastal = spot.facingDeg !== null
  const m = modelAt(spot.hours, t)
  const near = stationsAt(spot.stations, t)
  const air = near.find((s) => s.tempC !== null && s.dewC !== null) ?? null
  const windSt = near.find((s) => s.windKt !== null) ?? null
  const reasons: string[] = []

  const tempF = air !== null ? cToF(air.tempC as number) : m?.tempC != null ? cToF(m.tempC) : null
  const dewF = air !== null ? cToF(air.dewC as number) : m?.dewC != null ? cToF(m.dewC) : null
  const windKt = windSt !== null ? windSt.windKt : m?.windMps != null ? m.windMps / KT_MPS : null
  const fromDeg = windSt !== null ? windSt.fromDeg : (m?.windFromDeg ?? null)
  const airBy = air !== null ? air.id : 'forecast'

  /* Sea fog: a coastal spot only. */
  let sea: boolean | null = coastal ? null : false
  if (coastal && dewF !== null && spot.waterC !== null && windKt !== null) {
    const waterF = cToF(spot.waterC)
    const side = fromDeg === null ? null : windSide(fromDeg, spot.facingDeg as number)
    const onshore = side === 'onshore' || side === 'cross-onshore'
    sea = side === null ? null : dewF >= waterF - SEA_DEW_MARGIN_F && windKt <= SEA_WIND_KT && onshore
    if (sea === true) reasons.push(`dew ${r0(dewF)} °F (${airBy}) at or above the water ${r0(waterF)} °F less ${SEA_DEW_MARGIN_F}`, `wind ${r0(windKt)} kt ${side}`)
  }

  /* Radiation fog. */
  let rad: boolean | null = null
  const clear = clearish(air ?? near[0] ?? null, m)
  if (tempF !== null && dewF !== null && windKt !== null && clear !== null) {
    rad = tempF - dewF <= RAD_SPREAD_F && windKt <= RAD_WIND_KT && clear && nightOrEarly(t, spot.lat, spot.lon)
    if (rad === true) reasons.push(`air within ${r0((tempF - dewF) * 10) / 10} °F of its dew point (${airBy})`, `wind ${r0(windKt)} kt`, 'clear-ish sky at night or early')
  }

  const kindByRule: FogKind | null = sea === true ? 'sea' : rad === true ? 'radiation' : null
  /* Low only when every rule that applies could be read and none held. */
  let level: FogLevel | null = kindByRule !== null ? 'high' : sea === false && rad === false ? 'low' : null

  /* What the visibilities say. */
  const modelWet = (m?.precipMm ?? 0) > 0
  const modelVis = m?.visibilityM != null ? m.visibilityM / MI_M : null
  const seen: string[] = []
  for (const s of near) {
    const fog = reportsFog(s)
    const lowVis = s.visMi !== null && s.visMi <= CONFIRM_VIS_MI && (!reportsWet(s) || reportsMist(s))
    if (fog || lowVis) seen.push(`${s.id} ${s.visMi === null ? '' : `${visWords(s.visMi)} `}${tokens(s.wx).filter((x) => FOG_TOKEN.test(x) || MIST_TOKEN.test(x)).join(' ') || 'low visibility'}`.trim())
  }
  if (modelVis !== null && modelVis <= CONFIRM_VIS_MI && !modelWet) seen.push(`forecast visibility ${visWords(modelVis)}`)
  if (spot.sat != null && spot.sat.fogOrLowStratus && Math.abs(spot.sat.at.getTime() - t.getTime()) <= STATION_MAX_AGE_MS) seen.push('satellite fog or low stratus')

  const known = [...near.filter((s) => s.visMi !== null), ...(modelVis === null ? [] : [{ onWater: false, visMi: modelVis }])]
  const visMi = known.length === 0 ? null : Math.min(...known.map((s) => s.visMi as number))
  let kind: FogKind | null = kindByRule
  if (seen.length > 0) {
    level = 'high'
    kind = kindByRule ?? 'reported'
    reasons.push(...seen)
  } else if (level === 'high') {
    /* Every visibility that could see this fog is clear: a step down. Sea fog only by a station on the water (see the head). */
    const judges = kind === 'sea' ? known.filter((s) => s.onWater) : known
    if (judges.length > 0 && judges.every((s) => (s.visMi as number) >= CLEAR_VIS_MI)) {
      level = 'moderate'
      reasons.push(`visibility ${visWords(Math.min(...judges.map((s) => s.visMi as number)))} or more`)
    }
  }
  return { at: t, level, kind: level === 'low' || level === null ? null : kind, reasons, visMi, coastal }
}

/** Every forecast hour of the spot (or the times asked). */
export function fogHours(spot: FogSpot, times: readonly Date[] = spot.hours.map((h) => h.at)): FogHour[] {
  return times.map((t) => fogAt(spot, t))
}

const RANK: Record<FogLevel, number> = { low: 0, moderate: 1, high: 2 }
export const atLeast = (l: FogLevel | null, min: FogLevel): boolean => l !== null && RANK[l] >= RANK[min]

export interface FogWindow {
  from: Date
  /** The end of the last hour in it. */
  to: Date
  level: FogLevel
  kind: FogKind
}

/** Runs of hours at `min` or above, in order: each from its first hour to the end of its last. Hours one hour apart. */
export function fogWindows(hours: readonly FogHour[], min: FogLevel = 'high'): FogWindow[] {
  const out: FogWindow[] = []
  let run: FogHour[] = []
  const close = () => {
    if (run.length === 0) return
    const kinds = run.map((h) => h.kind).filter((k): k is FogKind => k !== null)
    const kind = (['sea', 'radiation', 'reported'] as const).find((k) => kinds.includes(k)) ?? 'reported'
    const level = run.some((h) => h.level === 'high') ? 'high' : 'moderate'
    out.push({ from: run[0].at, to: new Date(run[run.length - 1].at.getTime() + 3_600_000), level: min === 'high' ? 'high' : level, kind })
    run = []
  }
  for (const h of hours) {
    const prev = run[run.length - 1]
    if (atLeast(h.level, min) && (prev === undefined || h.at.getTime() - prev.at.getTime() <= 3_600_000)) run.push(h)
    else {
      close()
      if (atLeast(h.level, min)) run.push(h)
    }
  }
  close()
  return out
}

/** How far ahead a window is said. */
export const PHRASE_AHEAD_MS = 24 * 3_600_000

/**
 * The one short line: "Fog on the beach" (sea fog now at a coastal spot),
 * "Fog now", "Fog possible now", then what is ahead: "Fog likely 5–9 AM" (a
 * high window), "Fog possible 5–9 AM" (a moderate one); null when there is
 * none to say.
 */
export function fogPhrase(now: FogHour | null, ahead: readonly FogHour[], timeZone: string): string | null {
  if (now !== null && now.level === 'high') return now.coastal && now.kind === 'sea' ? 'Fog on the beach' : 'Fog now'
  if (now !== null && now.level === 'moderate') return 'Fog possible now'
  const t = now?.at.getTime() ?? ahead[0]?.at.getTime() ?? 0
  const soon = ahead.filter((h) => h.at.getTime() > t && h.at.getTime() <= t + PHRASE_AHEAD_MS)
  const span = (w: FogWindow) => formatSpan(formatHour(w.from, timeZone), formatHour(w.to, timeZone))
  const likely = fogWindows(soon, 'high')[0]
  if (likely !== undefined) return `Fog likely ${span(likely)}`
  const possible = fogWindows(soon, 'moderate')[0]
  if (possible !== undefined) return `Fog possible ${span(possible)}`
  return null
}

/** fogPhrase for a spot at `now`: the fog now and the hours of the next day. */
export function fogLine(spot: FogSpot, now: Date, timeZone: string): { line: string | null; now: FogHour; windows: FogWindow[] } {
  const here = fogAt(spot, now)
  const ahead = fogHours(spot).filter((h) => h.at.getTime() > now.getTime() && h.at.getTime() <= now.getTime() + PHRASE_AHEAD_MS)
  return { line: fogPhrase(here, ahead, timeZone), now: here, windows: fogWindows(ahead, 'moderate') }
}

/* ------------------------------------------------------- the sky call */

export const ABOVE_FOG_LINE = 'Color above the fog inland'
const DOWN: Record<Call, Call> = { Go: 'Maybe', Maybe: 'Skip', Skip: 'Skip' }

export interface FogSkyCall {
  call: SkyCall
  /** The call was dropped a step for fog at the beach. */
  dropped: boolean
  fog: FogHour
  /** "Color above the fog inland" when dropped: Best spot near me should point inland or up. */
  line: string | null
}

/**
 * The sky call with the fog at its time (Batch SIMPLE-3, Section 1.3). At a
 * coastal spot with fog high at the event, sea fog or fog seen, the call
 * drops a step (Go to Maybe, Maybe to Skip) and says the colour is above
 * the fog, inland. Radiation fog alone does not drop it: it lies shallow
 * under the sky (21 Nov: KNTU shallow fog, MIFG, and a good sunrise).
 * Inland spots keep their call. The read's own call and why change with
 * it, so the call and its read never disagree.
 */
export function fogSkyCall(call: SkyCall, spot: FogSpot): FogSkyCall {
  return fogSkyCallAt(call, fogAt(spot, call.event))
}

/** fogSkyCall on the fog already read at the call's event (a screen's src/lib/useFogRain.ts fogAt): the same rule, one place. */
export function fogSkyCallAt(call: SkyCall, fog: FogHour): FogSkyCall {
  const drops = fog.coastal && fog.level === 'high' && fog.kind !== 'radiation' && (call.call === 'Go' || call.call === 'Maybe')
  if (!drops || call.call === null) return { call, dropped: false, fog, line: null }
  const next = DOWN[call.call]
  const why = `Fog on the beach at the ${call.kind}: ${fog.reasons.join(', ')}.`
  const read = call.read === null ? null : { ...call.read, call: next, why: `${why} ${call.read.why}` }
  return { call: { ...call, call: next, word: colorWords(next), read }, dropped: true, fog, line: ABOVE_FOG_LINE }
}
