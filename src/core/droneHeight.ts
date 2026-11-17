/*
 * THE DRONE PAGE'S BY HEIGHT TAB (Batch DRONE, Section 2.2; board Drone_P2).
 *
 * A grid of the wind at the ground, 100, 200, 300 and 400 ft by the hour,
 * each cell coloured by its share of the drone's limit (src/core/droneNow.ts
 * limitRole: the home's "Light wind" line, then up to the limit, then at or
 * past it). Between 10 m and 120 m the height is interpolated on a log of the
 * height (src/core/homeCards.ts windAtFeet); "gnd" is the forecast's 10 m.
 *
 * The LAANC ceiling (the facility map's grid here) is drawn as a line between
 * the rows it falls between; the hour holding sunset is marked. The headline
 * is the calm window, the home's own (src/core/droneWindow.ts).
 */
import { windAtFeet } from './homeCards.ts'
import { limitRole, type LimitRole } from './droneNow.ts'
import type { CalmRead } from './droneWindow.ts'

export const GRID_ROWS_FT = [400, 300, 200, 100, 0] as const

export interface GridHour {
  at: Date
  /** The forecast's 10 m wind, m/s. */
  mps10: number | null
  /** The forecast's 120 m wind (about 400 ft), m/s. */
  mps120: number | null
}

export interface GridCell {
  mps: number | null
  role: LimitRole
}

export interface HeightGrid {
  hours: Date[]
  /** One row per height in GRID_ROWS_FT, 400 ft first; one cell per hour. */
  rows: { ft: number; cells: GridCell[] }[]
  /**
   * Where the ceiling line sits, in rows from the top (0 = above the 400 ft
   * row, 1 = between 400 and 300, …), or null with no ceiling, or one at or
   * over 400 ft (Part 107's own top).
   */
  ceilingRow: number | null
  /** The index of the column holding sunset, or null when sunset is not in these hours. */
  sunsetCol: number | null
}

/** The wind at a row's height: the forecast's 10 m and 120 m as they are, between them on a log of the height. */
export function windAtRow(ft: number, mps10: number | null, mps120: number | null): number | null {
  if (ft === 0) return mps10
  if (ft === 400) return mps120
  return windAtFeet(mps10, mps120, ft)
}

/**
 * The grid for `hours` (each the start of an hour), the ceiling in feet above
 * the ground, and sunset.
 */
export function heightGrid(hours: readonly GridHour[], limitMps: number | null, ceilingFt: number | null, sunset: Date | null): HeightGrid {
  const sorted = [...hours].sort((a, b) => a.at.getTime() - b.at.getTime())
  const rows = GRID_ROWS_FT.map((ft) => ({
    ft,
    cells: sorted.map((h) => {
      const mps = windAtRow(ft, h.mps10, h.mps120)
      return { mps, role: limitRole(mps, limitMps) }
    }),
  }))
  /* The line goes under every row higher than the ceiling: 250 ft sits between the 300 and 200 rows. */
  const ceilingRow = ceilingFt === null || ceilingFt >= 400 ? null : GRID_ROWS_FT.filter((ft) => ft > ceilingFt).length
  const s = sunset?.getTime() ?? null
  const col = s === null ? -1 : sorted.findIndex((h) => s >= h.at.getTime() && s < h.at.getTime() + 3_600_000)
  return { hours: sorted.map((h) => h.at), rows, ceilingRow, sunsetCol: col === -1 ? null : col }
}

/** The legend's numbers: "under 12 · 12–22 · at your limit 23", in the pilot's unit, from the same line the cells use. */
export function gridLegend(limitMps: number | null, lightRatio: number, toUnit: (mps: number) => number): { calm: string; near: string; over: string } | null {
  if (limitMps === null || limitMps <= 0) return null
  const light = Math.round(toUnit(limitMps * lightRatio))
  const limit = Math.round(toUnit(limitMps))
  return { calm: `under ${light}`, near: `${light}–${limit - 1}`, over: `at your limit ${limit}` }
}

/**
 * THE HEADLINE, SHORT (Batch FIX, Section 6.3; board Drone_Slim_2): "Calm all
 * day", "Best 3–4:50 PM". The calm window is the home's (droneWindow.ts).
 * `wholeDay` is the caller's: the day's light has not yet begun, or it is
 * tomorrow's; otherwise a run to sunset is "Calm until sunset".
 */
export function heightHeadline(calm: CalmRead, firstHourAt: Date | null, sunset: Date | null, wholeDay: boolean, tomorrow: boolean, span: (from: Date, to: Date) => string, speed: (mps: number) => string): string {
  const day = tomorrow ? ' tomorrow' : ''
  if (calm.kind === 'calm') {
    const fromFirst = firstHourAt !== null && calm.span.from.getTime() <= firstHourAt.getTime()
    const toSunset = sunset !== null && calm.span.to.getTime() >= sunset.getTime()
    if (fromFirst && toSunset) return wholeDay || tomorrow ? `Calm all day${day}` : 'Calm until sunset'
    return `Best${day} ${span(calm.span.from, calm.span.to)}`
  }
  if (calm.kind === 'windy') return `Over ${speed(calm.overMps)} ${calm.allDay ? 'all day' : 'rest of day'}${day}`
  if (calm.kind === 'no-rating') return 'No wind limit set'
  if (calm.kind === 'dark') return 'Sun down'
  return 'Wind at 400 ft not forecast'
}

/** The one line under it: "6–9 kt from NNE at every height · limit 23", from the grid's own cells. */
export function heightSub(grid: HeightGrid | null, limitMps: number | null, dir: string | null, toUnit: (mps: number) => number, unit: string): string {
  const vals = grid === null ? [] : grid.rows.flatMap((r) => r.cells.map((c) => c.mps)).filter((v): v is number => v !== null)
  if (vals.length === 0) return 'The forecast did not give the wind by height.'
  const lo = Math.round(toUnit(Math.min(...vals)))
  const hi = Math.round(toUnit(Math.max(...vals)))
  const limit = limitMps === null || limitMps <= 0 ? '' : ` · limit ${Math.round(toUnit(limitMps))}`
  return `${lo === hi ? lo : `${lo}–${hi}`} ${unit}${dir === null ? '' : ` from ${dir}`} at every height${limit}`
}
