import { describe, expect, it } from 'vitest'
import { HOUR_MS, KT_PER_MPS, windPlot } from './layerTimeline.ts'
import { chartSpan, CHART_HOURS, GRID_FT, GRID_HOURS, modelHours, stripHours, windGrid, windTrend } from './windCharts.ts'

/* Batch SIMPLE-2, Section 5 (board Wind_Charts): the Charts tab's numbers. */
const TZ = 'America/New_York'
const NOW = new Date('2026-11-19T02:20:00Z') /* Wed 9:20 PM at Chic's Beach */
const kt = (k: number) => k / KT_PER_MPS

describe('the bars: the next 24 hours from this hour', () => {
  it('starts at the top of the hour that holds now, 24 long', () => {
    const s = chartSpan(NOW)
    expect(s.from.toISOString()).toBe('2026-11-19T02:00:00.000Z')
    expect(s.hours).toBe(CHART_HOURS)
  })
  it('the map layer’s strip at the spot lands hour for hour (the same numbers the map’s bar draws)', () => {
    const from = Date.parse('2026-11-18T05:00:00Z')
    const strip = { from, mps: Array.from({ length: 72 }, (_, i) => i), gust: Array.from({ length: 72 }, (_, i) => i + 1), fromDeg: Array.from({ length: 72 }, () => 22.5) }
    const h = stripHours(strip, chartSpan(NOW))
    expect(h).toHaveLength(24)
    /* 02:00 Z on the 19th is 21 hours after the strip's start. */
    expect(h[0]).toEqual({ mps: 21, gustMps: 22, fromDeg: 22.5 })
    expect(h[23].mps).toBe(44)
  })
  it('an hour the strip did not reach is null, never a zero', () => {
    const strip = { from: Date.parse('2026-11-19T02:00:00Z'), mps: [5, 6], gust: [7, 8], fromDeg: [10, 20] }
    const h = stripHours(strip, chartSpan(NOW))
    expect(h[2]).toEqual({ mps: null, gustMps: null, fromDeg: null })
    expect(windPlot(h, chartSpan(NOW), TZ, null).bars).toHaveLength(2)
  })
  it('the models’ hours land by their time, gaps stay null', () => {
    const times = [0, 1, 3].map((k) => new Date(Date.parse('2026-11-19T02:00:00Z') + k * HOUR_MS))
    const rows = [{ median: 4, from: 30, gust: 6 }, { median: 5, from: 40, gust: null }, { median: 7, from: 50, gust: 9 }]
    const h = modelHours(times, rows, chartSpan(NOW))
    expect(h.slice(0, 4)).toEqual([
      { mps: 4, gustMps: 6, fromDeg: 30 },
      { mps: 5, gustMps: null, fromDeg: 40 },
      { mps: null, gustMps: null, fromDeg: null },
      { mps: 7, gustMps: 9, fromDeg: 50 },
    ])
  })
})

describe('the hero’s line: where the next 12 hours take it', () => {
  const span = chartSpan(NOW)
  const at = (k: number) => new Date(span.from.getTime() + k * HOUR_MS)
  const series = (f: (i: number) => number | null) => Array.from({ length: 24 }, (_, i) => ({ mps: f(i), gustMps: null, fromDeg: 20 }))
  it('building to the strongest hour ahead, the first of equals (the board: building to 13 kt by 3 AM)', () => {
    const h = series((i) => kt(i === 6 || i === 8 ? 13 : 8))
    expect(windTrend(kt(8), h, span, NOW)).toEqual({ kind: 'building', mps: kt(13), at: at(6) })
  })
  it('easing to the lightest hour ahead', () => {
    const h = series((i) => kt(i === 4 ? 3 : 8))
    expect(windTrend(kt(8), h, span, NOW)).toEqual({ kind: 'easing', mps: kt(3), at: at(4) })
  })
  it('steady inside a knot or two', () => {
    expect(windTrend(kt(8), series(() => kt(9)), span, NOW)?.kind).toBe('steady')
  })
  it('only the next 12 hours count, not this one and not the 13th', () => {
    expect(windTrend(kt(8), series((i) => kt(i === 0 || i === 13 ? 20 : 8)), span, NOW)?.kind).toBe('steady')
    expect(windTrend(kt(8), series((i) => kt(i === 12 ? 20 : 8)), span, NOW)?.kind).toBe('building')
  })
  it('nothing said: no line, never a guess', () => {
    expect(windTrend(null, series(() => kt(8)), span, NOW)).toBeNull()
    expect(windTrend(kt(8), series(() => null), span, NOW)).toBeNull()
  })
})

describe('the wind by height, the next 12 hours', () => {
  const times = Array.from({ length: 30 }, (_, k) => new Date(Date.parse('2026-11-19T00:00:00Z') + k * HOUR_MS))
  const ground = times.map((_, k) => ({ median: k === 5 ? null : kt(6), from: 20, gust: null }))
  const at120 = times.map(() => ({ median: kt(20), from: 20, gust: null }))
  const g = windGrid(times, ground, at120, NOW)
  it('four rows, 400 ft first, 12 hours from the hour holding now', () => {
    expect(g.rows.map((r) => r.ft)).toEqual([...GRID_FT])
    expect(g.hours).toHaveLength(GRID_HOURS)
    expect(g.hours[0].toISOString()).toBe('2026-11-19T02:00:00.000Z')
  })
  it('gnd is the 10 m median, 400 ft the 120 m, between on a log of the height (the Drone grid’s rule)', () => {
    const at = (ft: number) => g.rows.find((r) => r.ft === ft)?.cells[0].mps ?? null
    expect(at(0)).toBeCloseTo(kt(6), 9)
    expect(at(400)).toBeCloseTo(kt(20), 9)
    expect(at(100) as number).toBeGreaterThan(kt(6))
    expect(at(200) as number).toBeGreaterThan(at(100) as number)
    expect(at(400) as number).toBeGreaterThan(at(200) as number)
  })
  it('coloured by the bars’ bands: 6 kt calm (0), 20 kt the 17-25 band (3)', () => {
    expect(g.rows[g.rows.length - 1].cells[0].band).toBe(0)
    expect(g.rows[0].cells[0].band).toBe(3)
  })
  it('an hour with no ground wind has no gnd cell (null, no band); 400 ft still says its own', () => {
    const k = g.hours.findIndex((t) => t.getTime() === times[5].getTime())
    expect(g.rows[3].cells[k]).toEqual({ mps: null, band: null })
    expect(g.rows[0].cells[k].mps).toBeCloseTo(kt(20), 9)
  })
  it('no hours: an empty grid, not zeros', () => {
    expect(windGrid([], [], [], NOW)).toEqual({ hours: [], rows: GRID_FT.map((ft) => ({ ft, cells: [] })) })
  })
})
