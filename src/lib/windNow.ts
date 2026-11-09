/*
 * ONE WIND NOW (Batch Map A2/A4). The home's wind card, its hero line and
 * the Wind page's headline each read the wind at this hour their own way
 * (the briefing's hours, the hero's hourly, the five models' median). Now
 * they read this: the briefing's wind (fetchBriefWind, through the forecast
 * cache, the path that works on cellular) at this hour's half past, said one
 * way. The Wind page's models draw the dial, the strip and the spread; when
 * they have not arrived the page still has this (A4: never a blank page).
 */
import type { Hourly } from './tideSheetData.ts'
import { nowcastAt, obsFresh, type StationObs } from '../core/nowcast.ts'
import { hourlyAt } from './tideSheetData.ts'
import { compass } from './tideWords.ts'
import { windIn, windUnitLabel, type WindUnit } from './units.ts'

export interface WindNow {
  mps: number
  fromDeg: number | null
  gustMps: number | null
}

/** The hour's half past: two screens a few seconds apart read the same hour. */
export const halfHour = (t: Date): Date => new Date(Math.floor(t.getTime() / 3_600_000) * 3_600_000 + 1_800_000)

/** The model's wind at the hour, raw. */
export function modelWindAt(wx: Hourly | null, t: Date): WindNow | null {
  if (wx === null) return null
  const at = halfHour(t)
  const mps = hourlyAt(wx, 'wind_speed_10m', at)
  if (mps === null) return null
  return { mps, fromDeg: hourlyAt(wx, 'wind_direction_10m', at), gustMps: hourlyAt(wx, 'wind_gusts_10m', at) }
}

/*
 * Batch MAP2, Section 2: the wind at `t`, leaned toward a station's report
 * under an hour old (src/core/nowcast.ts), fading back to the model over
 * three hours. Every screen passes the same report (src/lib/useStationObs.ts).
 */
export function windAt(wx: Hourly | null, t: Date, obs: StationObs | null = null): WindNow | null {
  const now = new Date()
  const lean = obsFresh(obs, now) ? obs : null
  return nowcastAt((tt) => modelWindAt(wx, tt), lean, halfHour(t)) as WindNow | null
}

/** "9 kt WNW": the speed in the user's unit, and where it is from. */
export function windWords(w: WindNow | null, unit: WindUnit): string | null {
  if (w === null) return null
  const v = windIn(w.mps, unit)
  if (v === null) return null
  return `${Math.round(v)} ${windUnitLabel(unit)}${w.fromDeg === null ? '' : ` ${compass(w.fromDeg)}`}`
}

/** "gusts 16 kt", or null. */
export function gustWords(w: WindNow | null, unit: WindUnit): string | null {
  const v = w === null ? null : windIn(w.gustMps, unit)
  return v === null ? null : `gusts ${Math.round(v)} ${windUnitLabel(unit)}`
}
