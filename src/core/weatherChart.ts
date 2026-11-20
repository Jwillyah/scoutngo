/*
 * THE WEATHER PAGE'S CHART, AS GEOMETRY (Batch SIMPLE-2, Section 4; board
 * Page_Weather): the next 18 hours' temperature as one line, the chance of
 * rain as small bars along the bottom. Pure: it draws the numbers it is given.
 *
 * A temperature the forecast did not give breaks the line (a gap), never a
 * zero; a rain chance it did not give draws no bar. Rain under RAIN_MIN is
 * not drawn: a bar for 3% is noise, and the row beneath says the number.
 */
export const CHART_HOURS = 18
/** Rain bars start here (a chance, 0 to 1). */
export const RAIN_MIN = 0.1

export interface ChartHour {
  at: Date
  /** Degrees C. null: the forecast did not say. */
  tempC: number | null
  /** 0 to 1. null: not said. */
  rain: number | null
}

export interface WeatherChartModel {
  /** SVG path segments; one per unbroken run of temperatures. */
  lines: string[]
  /** The first point (now), for the dot; null with no temperature there. */
  nowDot: { x: number; y: number } | null
  bars: { x: number; y: number; w: number; h: number; at: Date; chance: number }[]
  /** Axis words' positions: now, +6, +12, +18 h. */
  ticks: { x: number; at: Date; isNow: boolean }[]
  lo: number | null
  hi: number | null
}

export function weatherChartModel(hours: readonly ChartHour[], o: { width: number; height: number; padTop: number; padBottom: number; padX: number; barRoom: number }): WeatherChartModel {
  const n = hours.length
  const temps = hours.map((h) => h.tempC).filter((v): v is number => v !== null)
  const lo = temps.length === 0 ? null : Math.min(...temps)
  const hi = temps.length === 0 ? null : Math.max(...temps)
  const span = n <= 1 ? 1 : n - 1
  const x = (i: number) => o.padX + (i / span) * (o.width - 2 * o.padX)
  /* The line lives above the bars' room, so rain never hides it. */
  const top = o.padTop
  const bottom = o.height - o.padBottom - o.barRoom
  const y = (c: number) => (lo === null || hi === null || hi === lo ? (top + bottom) / 2 : bottom - ((c - lo) / (hi - lo)) * (bottom - top))
  const lines: string[] = []
  let run: string[] = []
  const flush = () => {
    if (run.length > 1) lines.push(run.join(' '))
    run = []
  }
  hours.forEach((h, i) => {
    if (h.tempC === null) flush()
    else run.push(`${run.length === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(h.tempC).toFixed(1)}`)
  })
  flush()
  const first = hours[0]
  const nowDot = first === undefined || first.tempC === null ? null : { x: x(0), y: y(first.tempC) }
  const barW = Math.max(6, (o.width - 2 * o.padX) / Math.max(1, n) - 8)
  const floor = o.height - o.padBottom
  const bars = hours.flatMap((h, i) => (h.rain === null || h.rain < RAIN_MIN ? [] : [{ x: x(i) - barW / 2, y: floor - Math.max(2, h.rain * o.barRoom), w: barW, h: Math.max(2, h.rain * o.barRoom), at: h.at, chance: h.rain }]))
  const ticks = [0, 6, 12, 18].filter((k) => k < n).map((k) => ({ x: x(k), at: hours[k].at, isNow: k === 0 }))
  return { lines, nowDot, bars, ticks, lo, hi }
}
