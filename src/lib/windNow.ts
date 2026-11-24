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
import { CALM_KT, CALM_MPS, calmDirection, halfHour, isCalm } from '../core/markerWind.ts'
import { nowcastAt, nowcastWeight, obsFresh, type StationObs } from '../core/nowcast.ts'
import { hourlyAt } from './tideSheetData.ts'
import { saneAzimuth, saneGust, saneWind } from '../core/sanity.ts'
import { saneAloft } from '../core/windProfile.ts'
import { compass } from './tideWords.ts'
import { windIn, windUnitLabel, type WindUnit } from './units.ts'

export interface WindNow {
  mps: number
  fromDeg: number | null
  gustMps: number | null
}

/* Calm has no direction (Batch QA, Section 0B); the rule and the half hour live in src/core/markerWind.ts, the one place a wind at the marker is computed (Batch 3D, Section 4.1). */
export { CALM_KT, CALM_MPS, calmDirection, isCalm, halfHour }

/** The model's wind at the hour, raw. */
export function modelWindAt(wx: Hourly | null, t: Date): WindNow | null {
  if (wx === null) return null
  const at = halfHour(t)
  /* Sanity (Batch QA, Section 4, src/core/sanity.ts): no negative wind, no gust under it, a bearing 0-360. */
  const mps = saneWind(hourlyAt(wx, 'wind_speed_10m', at))
  if (mps === null) return null
  return { mps, fromDeg: calmDirection(mps, saneAzimuth(hourlyAt(wx, 'wind_direction_10m', at))), gustMps: saneGust(hourlyAt(wx, 'wind_gusts_10m', at), mps) }
}

/*
 * Batch MAP2, Section 2: the wind at `t`, leaned toward a station's report
 * under an hour old (src/core/nowcast.ts), fading back to the model over
 * three hours. Every screen passes the same report (src/lib/useStationObs.ts).
 */
export function windAt(wx: Hourly | null, t: Date, obs: StationObs | null = null, now: Date = new Date()): WindNow | null {
  const lean = obsFresh(obs, now) ? obs : null
  const w = nowcastAt((tt) => modelWindAt(wx, tt), lean, halfHour(t)) as WindNow | null
  return w === null ? null : { ...w, fromDeg: calmDirection(w.mps, w.fromDeg) }
}

/*
 * THE ONE WIND AT 400 FT (Batch SIMPLE-3, Section 1c). The home's Drone tile
 * read the briefing's day hours, 5:30 AM to 8:30 PM, so at 11:14 PM it said
 * 8:30 PM's 120 m; the Drone page read the 120 m at the hour; neither knew
 * the station the 10 m wind leans on. Now both read this: the same series
 * as windAt (the brief's), the same half hour, and the surface wind windAt
 * gives (station-leaned), with 400 ft never under ALOFT_MIN_RATIO of it
 * unless `measuredMps` (a measured profile) says otherwise
 * (src/core/windProfile.ts saneAloft). `surface` is that same windAt, for
 * the screen that shows both.
 */
export interface AloftNow {
  mps: number
  /** Held up to 0.9 of the surface wind: the model's 120 m was under it. */
  floored: boolean
  measured: boolean
  /** The model's own 120 m at that half hour, m/s. */
  modelMps: number | null
  /** windAt at the same time, the wind the home shows. */
  surface: WindNow | null
}
export function droneWindAt(wx: Hourly | null, t: Date, obs: StationObs | null = null, now: Date = new Date(), measuredMps: number | null = null): AloftNow | null {
  const surface = windAt(wx, t, obs, now)
  const modelMps = wx === null ? null : saneWind(hourlyAt(wx, 'wind_speed_120m', halfHour(t)))
  const got = saneAloft(surface?.mps ?? null, modelMps, measuredMps)
  return got === null ? null : { ...got, modelMps, surface }
}

/** "9 kt WNW": the speed in the user's unit, and where it is from. */
export function windWords(w: WindNow | null, unit: WindUnit): string | null {
  if (w === null) return null
  const v = windIn(w.mps, unit)
  if (v === null) return null
  if (isCalm(w.mps)) return 'Calm'
  return `${Math.round(v)} ${windUnitLabel(unit)}${w.fromDeg === null ? '' : ` ${compass(w.fromDeg)}`}`
}

/** "gusts 16 kt", or null. */
export function gustWords(w: WindNow | null, unit: WindUnit): string | null {
  const v = w === null ? null : windIn(w.gustMps, unit)
  return v === null ? null : `gusts ${Math.round(v)} ${windUnitLabel(unit)}`
}

/*
 * THE WEEK'S WIND WITH "NOW" LEANED (Batch FIX, Section 1): the hours the
 * station's report still weighs on carry windAt's wind, the rest the
 * model's untouched. Each hour's stamp holds the wind at its half past, the
 * hour windAt reads, so a reader of the hour that holds now (the surf call,
 * src/lib/surfPageData.ts) reads exactly the home's and the Wind page's.
 */
export function leanHourly(wx: Hourly | null, obs: StationObs | null, now: Date = new Date()): Hourly | null {
  if (wx === null || obs === null || !obsFresh(obs, now)) return wx
  const speed = wx.values.wind_speed_10m
  if (speed === undefined) return wx
  const dir = wx.values.wind_direction_10m ?? speed.map(() => null)
  const gust = wx.values.wind_gusts_10m ?? speed.map(() => null)
  const s2 = [...speed]
  const d2 = [...dir]
  const g2 = [...gust]
  let moved = false
  wx.times.forEach((t, i) => {
    const at = halfHour(new Date(t))
    if (nowcastWeight(obs.at, at) === 0) return
    const w = windAt(wx, at, obs, now)
    if (w === null) return
    s2[i] = w.mps
    d2[i] = w.fromDeg
    g2[i] = w.gustMps
    moved = true
  })
  return moved ? { times: wx.times, values: { ...wx.values, wind_speed_10m: s2, wind_direction_10m: d2, wind_gusts_10m: g2 } } : wx
}
