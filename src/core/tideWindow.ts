/*
 * THE TIDE PAGE'S NUMBERS (Batch N, Section 2): the venue's day of water as
 * drawing geometry, the countdown to the next turn, and the day's range.
 *
 * Every number here is arithmetic over NOAA's published predictions
 * (src/core/tide.ts): the level is levelAt over the station's curve, the
 * turns are the station's own highs and lows. Nothing is extrapolated: past
 * the end of the published curve the line simply stops.
 *
 *   window     the venue's day, its midnight to the next (23 or 25 hours on
 *              a clock-change day), ticks at its 6 AM, noon and 6 PM.
 *   night      sun below the horizon (sunPath's calibrated BAND_THRESHOLDS
 *              .horizon, the same line the time bar uses for sunset and
 *              sunrise), shaded behind the curve.
 *   labels     a high's time and height above its dot, a low's below, each
 *              kept inside the drawing by LABEL_HALF_W. "now" sits above
 *              its dot, or below it when that would touch a turn's label.
 */
import { getMoonIllumination, getPosition } from 'suncalc'
import { localDate } from './moonTimes.ts'
import { BAND_THRESHOLDS } from './sunPath.ts'
import { feetToMetres, levelAt, tidalRangeFeet, type TideExtreme, type TideSample } from './tide.ts'
import { zonedTimeToUtc } from './timezone.ts'

/** One point of the line every this many minutes: 145 points across a phone. */
export const CURVE_STEP_MIN = 10
/** Room above and below the line for the two-line high and low labels, px. */
export const CURVE_PAD_PX = 28
/** Room at the foot for the hour ticks, px. */
export const TICK_ROOM_PX = 14
/** Half a label's width, px: a label's middle never sits closer than this to an edge. */
export const LABEL_HALF_W = 26
/** A turn's two-line label, px tall, from 10 px above its first baseline. */
export const LABEL_H = 24
export const NOW_LABEL = { w: 24, h: 12 }

export interface TideMark {
  kind: 'high' | 'low'
  at: Date
  feet: number
  x: number
  y: number
  /** Where the label's middle sits (clamped inside the drawing), and its first line's baseline. */
  labelX: number
  labelY: number
}

export interface TideWindowModel {
  from: number
  to: number
  path: string
  /** The line closed down to the foot, for a soft fill under it. */
  area: string
  marks: TideMark[]
  /** Sun below the horizon, as x spans. */
  nights: { x0: number; x1: number }[]
  /** The now dot and its label's baseline; null when the curve does not reach now. */
  now: { x: number; y: number; labelX: number; labelY: number } | null
  /** Midnight, 6 AM, noon, 6 PM and midnight, where the venue's clock reads them. */
  ticks: { x: number; at: Date }[]
  lowFeet: number
  highFeet: number
}

const DAY = 86_400_000
const nextDate = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) + DAY).toISOString().slice(0, 10)

export function tideDayWindow(input: { now: Date; date: string; timeZone: string; curve: TideSample[]; extremes: TideExtreme[]; lat: number; lon: number; width: number; height: number }): TideWindowModel | null {
  const start = zonedTimeToUtc(input.date, '00:00', input.timeZone)
  const end = zonedTimeToUtc(nextDate(input.date), '00:00', input.timeZone)
  if (start === null || end === null) return null
  const from = start.getTime()
  const to = end.getTime()
  const plotH = input.height - TICK_ROOM_PX
  const step = CURVE_STEP_MIN * 60_000
  const xOf = (t: number) => ((t - from) / (to - from)) * input.width
  const samples: { t: number; feet: number }[] = []
  for (let t = from; t <= to; t += step) {
    const f = levelAt(input.curve, new Date(t))
    if (f !== null) samples.push({ t, feet: f })
  }
  if (samples.length < 2) return null
  const feet = samples.map((s) => s.feet)
  const lowFeet = Math.floor(Math.min(...feet))
  const highFeet = Math.ceil(Math.max(...feet))
  const yOf = (f: number) => CURVE_PAD_PX + (1 - (f - lowFeet) / Math.max(1, highFeet - lowFeet)) * (plotH - 2 * CURVE_PAD_PX)
  const pts = samples.map((s) => `${xOf(s.t).toFixed(1)},${yOf(s.feet).toFixed(1)}`)
  const path = `M${pts.join(' L')}`
  const first = xOf(samples[0].t).toFixed(1)
  const last = xOf(samples[samples.length - 1].t).toFixed(1)
  const area = `${path} L${last},${plotH} L${first},${plotH} Z`
  const marks: TideMark[] = input.extremes
    .filter((e) => e.at.getTime() >= from && e.at.getTime() <= to)
    .map((e) => {
      const x = xOf(e.at.getTime())
      const y = yOf(e.feet)
      return { kind: e.kind, at: e.at, feet: e.feet, x, y, labelX: Math.min(input.width - LABEL_HALF_W, Math.max(LABEL_HALF_W, x)), labelY: e.kind === 'high' ? y - 18 : y + 14 }
    })
  const nights: { x0: number; x1: number }[] = []
  const nightStep = 5 * 60_000
  for (let t = from; t < to; t += nightStep) {
    /* This suncalc build answers in degrees (src/core/sunPath.ts). */
    const dark = getPosition(new Date(t + nightStep / 2), input.lat, input.lon).altitude <= BAND_THRESHOLDS.horizon
    if (!dark) continue
    const prev = nights[nights.length - 1]
    if (prev !== undefined && Math.abs(prev.x1 - xOf(t)) < 1e-6) prev.x1 = xOf(Math.min(to, t + nightStep))
    else nights.push({ x0: xOf(t), x1: xOf(Math.min(to, t + nightStep)) })
  }
  const nowFeet = input.now.getTime() < from || input.now.getTime() > to ? null : levelAt(input.curve, input.now)
  let now: TideWindowModel['now'] = null
  if (nowFeet !== null) {
    const x = xOf(input.now.getTime())
    const y = yOf(nowFeet)
    const labelX = Math.min(input.width - NOW_LABEL.w / 2, Math.max(NOW_LABEL.w / 2, x))
    const hits = (labelY: number) => marks.some((m) => Math.abs(m.labelX - labelX) * 2 < NOW_LABEL.w + LABEL_HALF_W * 2 && labelY > m.labelY - 10 - NOW_LABEL.h / 2 && labelY - NOW_LABEL.h < m.labelY - 10 + LABEL_H)
    const above = y - 10
    now = { x, y, labelX, labelY: hits(above) ? y + 20 : above }
  }
  const ticks = ['00:00', '06:00', '12:00', '18:00']
    .map((hm) => zonedTimeToUtc(input.date, hm, input.timeZone))
    .filter((d): d is Date => d !== null)
    .concat(end)
    .map((at) => ({ x: xOf(at.getTime()), at }))
  return { from, to, path, area, marks, nights, now, ticks, lowFeet, highFeet }
}

/** "3 h 12 min", "45 min", "2 h"; null for a moment already past. */
export function untilWords(from: Date, to: Date): string | null {
  const min = Math.round((to.getTime() - from.getTime()) / 60_000)
  if (min < 0) return null
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** The next high and the next low after `at`, from the station's turns. */
export function nextTurns(extremes: readonly TideExtreme[], at: Date): { high: TideExtreme | null; low: TideExtreme | null; next: TideExtreme | null } {
  const ahead = [...extremes].filter((e) => e.at.getTime() > at.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime())
  return { high: ahead.find((e) => e.kind === 'high') ?? null, low: ahead.find((e) => e.kind === 'low') ?? null, next: ahead[0] ?? null }
}

/** Highest high minus lowest low on the venue's day; null without at least one high and one low that day. */
export function dayRangeFeet(extremes: readonly TideExtreme[], date: string, timeZone: string): number | null {
  const today = extremes.filter((e) => localDate(e.at, timeZone) === date)
  if (!today.some((e) => e.kind === 'high') || !today.some((e) => e.kind === 'low')) return null
  return tidalRangeFeet(today)
}

/** How much of the moon is lit, whole percent (suncalc's illuminated fraction). */
export const moonLitPercent = (at: Date): number => Math.round(getMoonIllumination(at).fraction * 100)

/** A tide height in the Settings distance unit: feet above MLLW to a tenth, or metres to a hundredth; a dash for none. */
export function tideHeight(feet: number | null, unit: 'ft' | 'm'): string {
  if (feet === null || !Number.isFinite(feet)) return '—'
  return unit === 'ft' ? `${feet.toFixed(1)} ft` : `${feetToMetres(feet).toFixed(2)} m`
}
