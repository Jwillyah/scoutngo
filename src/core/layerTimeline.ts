/*
 * THE MAP'S ONE TIMELINE BAR, AS ARITHMETIC (Batch DRONE, Section 3; boards
 * docs/mockups/Wind_Bar_7.png, Map_Timeline_Wind.png, Map_Timeline_Tide.png).
 *
 * One docked bar for every layer: a day strip (Mon…Fri) with hour ticks, a
 * thumb, and the layer's own picture under it.
 *
 *   wind    a direction arrow every 6 h (where it blows), bars coloured by
 *           knots on the 0 / 7 / 12 / 17 / 25+ scale, a white cap at the
 *           gust, a dashed line at the chosen drone's rated wind, and each
 *           day's peak labelled
 *   tide    the water level as a filled curve, night shaded, the day's high
 *           and low under it
 *   clouds  the same bar with a % band
 *
 * Everything here is fractions of the bar (0 at its left edge, 1 at its
 * right) so the component only draws. Times are written by the component
 * through src/core/timezone.ts; nothing here formats a clock.
 */
import { getPosition } from 'suncalc'
import { wallClock, zoneOffsetMs } from './timezone.ts'
import type { TideExtreme, TideSample } from './tide.ts'

export const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
/** Mon…Fri: the bar shows five days from the start of today at the spot. */
export const BAR_DAYS = 5
/** A direction arrow on every sixth hour (00, 06, 12, 18 at the spot). */
export const ARROW_EVERY_H = 6
/** The bar's wind colour scale, knots: each band starts at its number (Wind_Bar_7). */
export const WIND_BANDS_KT = [0, 7, 12, 17, 25] as const
export type WindBand = 0 | 1 | 2 | 3 | 4
/** The token each band paints with (src/styles/tokens.css). */
export const WIND_BAND_TOKENS = ['--wind-0', '--wind-7', '--wind-12', '--wind-17', '--wind-25'] as const
export const KT_PER_MPS = 1.9438444924406
/** Hours either side of the thumb whose frames are held before a drag (src/lib, the wind grid and the cloud grid). */
export const PREFETCH_H = 24

/** The band a speed in knots falls in: 0-7, 7-12, 12-17, 17-25, 25+. */
export function windBand(kt: number): WindBand {
  let b = 0
  for (let i = 1; i < WIND_BANDS_KT.length; i += 1) if (kt >= WIND_BANDS_KT[i]) b = i
  return b as WindBand
}

export interface BarSpan {
  /** The bar's left edge: midnight at the spot, today. */
  from: Date
  hours: number
}

/** Midnight at the spot on the day `at` falls on, as an instant. */
export function localMidnight(at: Date, timeZone: string): Date {
  const wall = at.getTime() + zoneOffsetMs(at, timeZone)
  const mid = Math.floor(wall / DAY_MS) * DAY_MS
  /* The offset at midnight itself, which differs from `at`'s on a clock-change day. */
  const guess = new Date(mid - zoneOffsetMs(at, timeZone))
  return new Date(mid - zoneOffsetMs(guess, timeZone))
}

/** The bar: BAR_DAYS days from midnight today at the spot, by the hour. */
export function barSpan(now: Date, timeZone: string, days: number = BAR_DAYS): BarSpan {
  const from = localMidnight(now, timeZone)
  const end = localMidnight(new Date(from.getTime() + days * DAY_MS + 12 * HOUR_MS), timeZone)
  return { from, hours: Math.round((end.getTime() - from.getTime()) / HOUR_MS) }
}

/** Where an instant sits along the bar, 0 to 1, held to the bar. */
export function fractionOf(at: Date, span: BarSpan): number {
  const f = (at.getTime() - span.from.getTime()) / (span.hours * HOUR_MS)
  return Math.max(0, Math.min(1, f))
}

/** The instant under a point of the bar, snapped to the hour it falls in, held to the bar. */
export function atFraction(span: BarSpan, f: number): Date {
  const h = Math.max(0, Math.min(span.hours - 1, Math.floor(Math.max(0, Math.min(1, f)) * span.hours)))
  return new Date(span.from.getTime() + h * HOUR_MS)
}

export interface DayTick {
  /** The day's left edge along the bar. */
  x: number
  /** The day's centre, where its name goes. */
  mid: number
  /** The instant the day starts, for the component to name ("Mon"). */
  at: Date
}

/** The days along the bar and a tick every ARROW_EVERY_H hours between them. */
export function barTicks(span: BarSpan, timeZone: string): { days: DayTick[]; hours: number[] } {
  const days: DayTick[] = []
  const hours: number[] = []
  for (let i = 0; i <= span.hours; i += 1) {
    const t = new Date(span.from.getTime() + i * HOUR_MS)
    const h = wallClock(t, timeZone)?.hour ?? null
    if (h === null) continue
    if (h === 0 && i < span.hours) days.push({ x: i / span.hours, mid: 0, at: t })
    else if (h % ARROW_EVERY_H === 0) hours.push(i / span.hours)
  }
  for (let k = 0; k < days.length; k += 1) days[k].mid = (days[k].x + (days[k + 1]?.x ?? 1)) / 2
  return { days, hours }
}

/** The wind at the grid point nearest the marker, by the hour from `from` (epoch ms), as the map's layer has it. */
export interface WindStrip {
  from: number
  mps: readonly (number | null)[]
  gust: readonly (number | null)[]
  fromDeg: readonly (number | null)[]
}

/** One hour of wind at the marker: speed and gust in m/s, the bearing it comes from. */
export interface WindHour {
  mps: number | null
  gustMps: number | null
  fromDeg: number | null
}

export interface WindArrow {
  /** The hour's centre along the bar. */
  x: number
  /** Where it blows TO, degrees: the arrow points downwind. */
  toDeg: number
}

/** An arrow on each sixth hour at the spot, pointing where the wind blows. `hours[i]` is span.from + i h. */
export function windArrows(hours: readonly WindHour[], span: BarSpan, timeZone: string): WindArrow[] {
  const out: WindArrow[] = []
  for (let i = 0; i < Math.min(hours.length, span.hours); i += 1) {
    const from = hours[i].fromDeg
    if (from === null) continue
    const h = wallClock(new Date(span.from.getTime() + i * HOUR_MS), timeZone)?.hour
    if (h === undefined || h % ARROW_EVERY_H !== 0) continue
    out.push({ x: (i + 0.5) / span.hours, toDeg: (((from + 180) % 360) + 360) % 360 })
  }
  return out
}

export interface WindBar {
  /** The hour's left edge and width along the bar. */
  x: number
  w: number
  /** The bar's height and the gust cap's, 0 to 1 of the plot. */
  h: number
  gustH: number | null
  band: WindBand
  kt: number
}

export interface WindPlot {
  bars: WindBar[]
  /** The top of the plot, knots: the strongest gust, the drone's limit or 25 kt, whichever is most, with room. */
  topKt: number
  /** The drone's limit as a height, 0 to 1, or null when no drone with a rating is chosen. */
  limitH: number | null
  /** Each day's strongest hour: where its label goes and the knots it says. */
  peaks: { x: number; kt: number }[]
}

/** The wind's bars, caps, limit and each day's peak. Knots throughout; the component converts the labels to the user's unit. */
export function windPlot(hours: readonly WindHour[], span: BarSpan, timeZone: string, limitMps: number | null): WindPlot {
  const n = Math.min(hours.length, span.hours)
  const kt = (v: number | null) => (v === null || !Number.isFinite(v) ? null : v * KT_PER_MPS)
  const limitKt = kt(limitMps)
  let most: number = WIND_BANDS_KT[WIND_BANDS_KT.length - 1]
  for (let i = 0; i < n; i += 1) most = Math.max(most, kt(hours[i].mps) ?? 0, kt(hours[i].gustMps) ?? 0)
  if (limitKt !== null) most = Math.max(most, limitKt)
  const topKt = most * 1.15
  const bars: WindBar[] = []
  for (let i = 0; i < n; i += 1) {
    const s = kt(hours[i].mps)
    if (s === null) continue
    const g = kt(hours[i].gustMps)
    bars.push({ x: i / span.hours, w: 1 / span.hours, h: s / topKt, gustH: g === null || g < s ? null : g / topKt, band: windBand(s), kt: s })
  }
  return { bars, topKt, limitH: limitKt === null ? null : limitKt / topKt, peaks: dailyPeaks(hours.slice(0, n).map((h) => kt(h.mps)), span, timeZone) }
}

/** Each day's strongest hour along the bar (the first of equals), from values by the hour. Days with no value have none. */
export function dailyPeaks(values: readonly (number | null)[], span: BarSpan, timeZone: string): { x: number; kt: number }[] {
  const { days } = barTicks(span, timeZone)
  const edges = [...days.map((d) => Math.round(d.x * span.hours)), span.hours]
  /* The part of today before the first midnight on the bar is its own day too. */
  if (edges[0] !== 0) edges.unshift(0)
  const out: { x: number; kt: number }[] = []
  for (let d = 0; d + 1 < edges.length; d += 1) {
    let best = -1
    for (let i = edges[d]; i < Math.min(edges[d + 1], values.length); i += 1) {
      const v = values[i]
      if (v !== null && (best < 0 || v > (values[best] as number))) best = i
    }
    if (best >= 0) out.push({ x: (best + 0.5) / span.hours, kt: values[best] as number })
  }
  return out
}

/*
 * THE WIND BAR'S WORDS, KEPT APART (Batch FIX, Section 2.4; 17 Nov: "drone
 * limit 23" sat on the "11" over Tuesday's peak). The drone's limit is said at
 * the bar's LEFT end, on its line; each day's peak sits over its own bar; a
 * peak whose box would touch the limit's, or an earlier peak's, is not drawn
 * (the bar under it still says the speed). Boxes are estimated from the
 * characters at the bar's 12 px type, a little wide, so a dropped label is
 * the error and an overlap is not; scripts/audit-map-layers.mjs measures the
 * real boxes in a browser.
 */
/** Width of one character of the bar's 12 px bold labels, px: a little over the widest digit, so a box errs wide. */
export const LABEL_CHAR_PX = 7.5
/** The labels' line height, px (line-height 1 at 12 px, and the shadow). */
export const LABEL_LINE_PX = 13

export interface WindLabel {
  /** Where along the bar (its centre for a peak), 0 to 1. */
  x: number
  /** Its foot above the plot's floor, per cent of the plot's height. */
  bottomPct: number
  text: string
}

/** A peak's foot: just over the taller of its bar and its gust cap, held under the plot's top. */
export const peakBottomPct = (barTop: number): number => Math.min(80, barTop * 100 + 4)
/** The limit's foot: just over its dashed line. */
export const limitBottomPct = (limitH: number): number => Math.min(88, limitH * 100 + 2)

export function windLabels(
  plot: WindPlot,
  plotW: number,
  plotH: number,
  peakText: (kt: number) => string,
  limitText: string | null,
): { peaks: WindLabel[]; limit: WindLabel | null } {
  const box = (left: number, bottomPct: number, text: string) => {
    const w = text.length * LABEL_CHAR_PX
    const bottom = plotH * (1 - bottomPct / 100)
    return { l: left, r: left + w, t: bottom - LABEL_LINE_PX, b: bottom }
  }
  const touch = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.l < b.r + 2 && b.l < a.r + 2 && a.t < b.b + 1 && b.t < a.b + 1
  const limit = plot.limitH === null || limitText === null ? null : { x: 0, bottomPct: limitBottomPct(plot.limitH), text: limitText }
  const taken = limit === null ? [] : [box(0, limit.bottomPct, limit.text)]
  const peaks: WindLabel[] = []
  for (const p of plot.peaks) {
    const bar = plot.bars.find((b) => Math.abs(b.x + b.w / 2 - p.x) < 1e-9)
    const bottomPct = peakBottomPct(Math.max(bar?.gustH ?? 0, bar?.h ?? 0))
    const text = peakText(p.kt)
    const w = text.length * LABEL_CHAR_PX
    const mine = box(p.x * plotW - w / 2, bottomPct, text)
    if (taken.some((t) => touch(t, mine))) continue
    taken.push(mine)
    peaks.push({ x: p.x, bottomPct, text })
  }
  return { peaks, limit }
}

/** Sun below the horizon (the apparent sunrise and sunset height, -0.833°). */
const NIGHT_BELOW_RAD = (-0.833 * Math.PI) / 180
const NIGHT_STEP_MS = 10 * 60_000

/** The nights along the bar, as [start, end] fractions, from the sun's height at the spot every 10 minutes. */
export function nightSpans(span: BarSpan, lat: number, lon: number): { x0: number; x1: number }[] {
  const total = span.hours * HOUR_MS
  const out: { x0: number; x1: number }[] = []
  let start: number | null = null
  for (let t = 0; t <= total; t += NIGHT_STEP_MS) {
    const dark = getPosition(new Date(span.from.getTime() + t), lat, lon).altitude < NIGHT_BELOW_RAD
    if (dark && start === null) start = t
    if (!dark && start !== null) {
      out.push({ x0: start / total, x1: t / total })
      start = null
    }
  }
  if (start !== null) out.push({ x0: start / total, x1: 1 })
  return out
}

export interface TidePlot {
  /** The curve, every half hour, x along the bar and y 0 (lowest) to 1 (highest) of the plot. */
  points: { x: number; y: number }[]
  lo: number
  hi: number
}

/** The tide curve across the bar, from the station's samples; empty where the samples do not reach. */
export function tidePlot(curve: readonly TideSample[], span: BarSpan): TidePlot {
  const end = span.from.getTime() + span.hours * HOUR_MS
  const inside = curve.filter((s) => s.at.getTime() >= span.from.getTime() - HOUR_MS && s.at.getTime() <= end + HOUR_MS).sort((a, b) => a.at.getTime() - b.at.getTime())
  if (inside.length < 2) return { points: [], lo: 0, hi: 0 }
  let lo = Infinity
  let hi = -Infinity
  for (const s of inside) {
    lo = Math.min(lo, s.feet)
    hi = Math.max(hi, s.feet)
  }
  const range = Math.max(0.1, hi - lo)
  const points: { x: number; y: number }[] = []
  let k = 0
  for (let t = span.from.getTime(); t <= end; t += HOUR_MS / 2) {
    while (k + 1 < inside.length && inside[k + 1].at.getTime() <= t) k += 1
    const a = inside[k]
    const b = inside[k + 1]
    if (b === undefined || a.at.getTime() > t) continue
    const f = (t - a.at.getTime()) / Math.max(1, b.at.getTime() - a.at.getTime())
    const feet = a.feet + (b.feet - a.feet) * f
    points.push({ x: (t - span.from.getTime()) / (span.hours * HOUR_MS), y: (feet - lo) / range })
  }
  return { points, lo, hi }
}

/** The highest high and the lowest low on the day `at` falls on at the spot: "High 3.0 ft 8:12a · Low 0.5 ft 2:24p". */
export function dayExtremes(extremes: readonly TideExtreme[], at: Date, timeZone: string): { high: TideExtreme | null; low: TideExtreme | null } {
  const from = localMidnight(at, timeZone).getTime()
  const to = localMidnight(new Date(from + DAY_MS + 12 * HOUR_MS), timeZone).getTime()
  let high: TideExtreme | null = null
  let low: TideExtreme | null = null
  for (const e of extremes) {
    const t = e.at.getTime()
    if (t < from || t >= to) continue
    if (e.kind === 'high' && (high === null || e.feet > high.feet)) high = e
    if (e.kind === 'low' && (low === null || e.feet < low.feet)) low = e
  }
  return { high, low }
}

/** A % band (cloud cover, chance of rain) by the hour: each hour's height 0 to 1; null where the forecast said nothing. */
export function percentBand(values: readonly (number | null)[], span: BarSpan): { x: number; w: number; h: number }[] {
  const out: { x: number; w: number; h: number }[] = []
  for (let i = 0; i < Math.min(values.length, span.hours); i += 1) {
    const v = values[i]
    if (v === null || !Number.isFinite(v)) continue
    out.push({ x: i / span.hours, w: 1 / span.hours, h: Math.max(0, Math.min(100, v)) / 100 })
  }
  return out
}

/**
 * THE FRAMES HELD FOR A DRAG (Section 3: no layer refetch while dragging).
 * Before a drag the layer asks for every frame from PREFETCH_H before the
 * thumb to PREFETCH_H after it; during the drag the time those frames were
 * asked for is held, so a new hour under the thumb is a frame already in
 * hand, never a new request. Returns the window to hold.
 */
export function prefetchWindow(at: Date, hours: number = PREFETCH_H): { from: Date; to: Date } {
  return { from: new Date(at.getTime() - hours * HOUR_MS), to: new Date(at.getTime() + hours * HOUR_MS) }
}

/** The days a forecast must be asked for (from today, UTC, as Open-Meteo counts) to reach `to`: at least `min`, at most `max`. */
export function daysToReach(to: Date, now: Date, min = 3, max = 7): number {
  const today = Math.floor(now.getTime() / DAY_MS) * DAY_MS
  return Math.max(min, Math.min(max, Math.floor((to.getTime() - today) / DAY_MS) + 1))
}

/*
 * RADAR'S STRIP (Batch FIX, Section 2.5): the chance of rain at the marker by
 * the hour, the past RAIN_PAST_H and the next RAIN_AHEAD_H, under the radar's
 * own frames. From the briefing's hourly answer (precipitation_probability),
 * which the app already asks at the spot: no new request, no new host.
 */
export const RAIN_PAST_H = 2
export const RAIN_AHEAD_H = 24

/** The strip's hours: from RAIN_PAST_H whole hours before now's hour to RAIN_AHEAD_H after it; `now` along it. */
export function rainSpan(now: Date): { span: BarSpan; nowX: number } {
  const hour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS
  const span = { from: new Date(hour - RAIN_PAST_H * HOUR_MS), hours: RAIN_PAST_H + RAIN_AHEAD_H }
  return { span, nowX: (now.getTime() - span.from.getTime()) / (span.hours * HOUR_MS) }
}

/*
 * THE DAYS ASKED FOR ONCE PER SPOT (Batch FIX, Section 2.6; measured on
 * 17 Nov, measurements/2026-11-17-scrub-fps-tide-1x.md: a 3 s drag on the
 * bar sent 9 requests to Open-Meteo, the wind by height and the five models'
 * low cloud at the spot, each asked again for every new day the thumb
 * crossed). Both are asked for this whole range at once: 48 h behind today
 * and the bar's five days ahead, so the thumb anywhere on the bar, or two
 * days back, is an answer in hand. Days are the forecast's calendar dates,
 * "YYYY-MM-DD" (the venue's for the wind, GMT for the models).
 */
export const SCRUB_PAST_DAYS = 2

const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)

/**
 * From SCRUB_PAST_DAYS before `today` to the bar's last day. `margin` more
 * days each side when the days are counted in another zone than the bar's:
 * the bar's last evening at Virginia Beach is the next day in GMT.
 */
export function scrubDays(today: string, margin = 0): { start: string; end: string } {
  return { start: addDays(today, -SCRUB_PAST_DAYS - margin), end: addDays(today, BAR_DAYS - 1 + margin) }
}

/** Whether a calendar day is inside the range (ISO dates compare as text). */
export const inScrubDays = (day: string, r: { start: string; end: string }): boolean => day >= r.start && day <= r.end

/** The hours of a series from `seriesFrom` (epoch ms, on the hour) laid on the bar: index i is span.from + i h. */
export function onBar<T>(series: readonly T[], seriesFrom: number, span: BarSpan): (T | null)[] {
  const shift = Math.round((span.from.getTime() - seriesFrom) / HOUR_MS)
  return Array.from({ length: span.hours }, (_, i) => series[i + shift] ?? null)
}
