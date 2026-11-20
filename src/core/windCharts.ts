/*
 * WIND = THE MAP, ITS CHARTS AS ARITHMETIC (Batch SIMPLE-2, Section 5;
 * boards docs/mockups/simple2/Wind_Map.png, Wind_Charts.png).
 *
 * The Wind tile opens the map on the wind layer; "Charts" beside "Map" is the
 * next 24 hours as bars with gust caps (the one wind bar, src/components/
 * WindBar.tsx), the wind by height for the next 12 hours, and the station and
 * the models. Everything here is numbers; the component only draws, and every
 * clock it writes goes through src/core/timezone.ts.
 *
 * An hour the forecast did not say stays null: no bar, no cell, never a zero.
 */
import { HOUR_MS, KT_PER_MPS, onBar, windBand, type BarSpan, type WindBand, type WindHour, type WindStrip } from './layerTimeline.ts'
import { windAtRow } from './droneHeight.ts'

/** Map | Charts, the pill pair at the top of both (the map's top bar and the Charts page). */
export const WIND_TABS = [
  { id: 'map', label: 'Map' },
  { id: 'charts', label: 'Charts' },
] as const

/** Charts' bars: the next 24 hours from the start of this hour. */
export const CHART_HOURS = 24
/** The by-height grid: the next 12 hours. */
export const GRID_HOURS = 12
/** The grid's rows, feet above the ground, the top first (the board's four). */
export const GRID_FT = [400, 200, 100, 0] as const
/** A change of at least this much over the next 12 hours is "building" or "easing", m/s (about 2 kt). */
export const TREND_MPS = 1

/** The bars' span: from the start of the hour that holds `now`, CHART_HOURS long. */
export function chartSpan(now: Date): BarSpan {
  return { from: new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS), hours: CHART_HOURS }
}

/** One model hour, as src/core/windModels.ts has it: the median, where it comes from, the highest gust. */
export interface ModelHour {
  median: number | null
  from: number | null
  gust: number | null
}

/** The map layer's strip at the spot onto the chart's span: the same numbers the map's bar draws. */
export function stripHours(strip: WindStrip, span: BarSpan): WindHour[] {
  const mps = onBar(strip.mps, strip.from, span)
  const gust = onBar(strip.gust, strip.from, span)
  const dir = onBar(strip.fromDeg, strip.from, span)
  return mps.map((v, i) => ({ mps: v, gustMps: gust[i], fromDeg: dir[i] }))
}

/** The models' ground hours onto the chart's span (when the map's strip is not at the spot). */
export function modelHours(times: readonly Date[], rows: readonly (ModelHour | undefined)[], span: BarSpan): WindHour[] {
  return Array.from({ length: span.hours }, (_, i) => {
    const t = span.from.getTime() + i * HOUR_MS
    const k = times.findIndex((d) => d.getTime() === t)
    const r = k < 0 ? undefined : rows[k]
    return r === undefined ? { mps: null, gustMps: null, fromDeg: null } : { mps: r.median, gustMps: r.gust, fromDeg: r.from }
  })
}

/** How many hours of the bar the forecast said something for. */
export const hoursSaid = (hours: readonly WindHour[]): number => hours.filter((h) => h.mps !== null).length

export interface Trend {
  kind: 'building' | 'easing' | 'steady'
  /** The strongest (building) or lightest (easing) hour's speed, m/s; for steady, the wind now. */
  mps: number
  /** That hour; null for steady. */
  at: Date | null
}

/**
 * The next 12 hours against the wind now: "building to 13 kt by 3 AM" when an
 * hour ahead is TREND_MPS or more stronger (the strongest, the first of
 * equals), "easing to 5 kt by 3 AM" when one is that much lighter and none
 * stronger, otherwise steady. Null when the wind now or the hours are unknown.
 */
export function windTrend(nowMps: number | null, hours: readonly WindHour[], span: BarSpan, now: Date): Trend | null {
  if (nowMps === null) return null
  const start = Math.max(0, Math.floor((now.getTime() - span.from.getTime()) / HOUR_MS) + 1)
  const ahead = hours.slice(start, start + GRID_HOURS).map((h, i) => ({ mps: h.mps, at: new Date(span.from.getTime() + (start + i) * HOUR_MS) }))
  const said = ahead.filter((h): h is { mps: number; at: Date } => h.mps !== null)
  if (said.length === 0) return null
  const most = said.reduce((a, b) => (b.mps > a.mps ? b : a))
  const least = said.reduce((a, b) => (b.mps < a.mps ? b : a))
  if (most.mps - nowMps >= TREND_MPS) return { kind: 'building', mps: most.mps, at: most.at }
  if (nowMps - least.mps >= TREND_MPS) return { kind: 'easing', mps: least.mps, at: least.at }
  return { kind: 'steady', mps: nowMps, at: null }
}

export interface GridCell {
  mps: number | null
  /** The map's wind band (the bars' colours), null when unknown. */
  band: WindBand | null
}

export interface WindGrid {
  hours: Date[]
  rows: { ft: number; cells: GridCell[] }[]
}

/**
 * The wind by height for the next GRID_HOURS hours from the hour holding
 * `now`: the models' 10 m ("gnd") and 120 m (400 ft) medians as they are, the
 * heights between on a log of the height (src/core/droneHeight.ts windAtRow,
 * the Drone page's grid). Coloured by the bars' bands, so a cell and a bar of
 * the same speed are the same colour.
 */
export function windGrid(times: readonly Date[], ground: readonly (ModelHour | undefined)[], at120: readonly (ModelHour | undefined)[], now: Date): WindGrid {
  const first = times.findIndex((t) => t.getTime() > now.getTime() - HOUR_MS / 2)
  const idx = first < 0 ? [] : Array.from({ length: Math.min(GRID_HOURS, times.length - first) }, (_, k) => first + k)
  const cell = (mps: number | null): GridCell => ({ mps, band: mps === null ? null : windBand(mps * KT_PER_MPS) })
  return {
    hours: idx.map((i) => times[i]),
    rows: GRID_FT.map((ft) => ({ ft, cells: idx.map((i) => cell(windAtRow(ft, ground[i]?.median ?? null, at120[i]?.median ?? null))) })),
  }
}
