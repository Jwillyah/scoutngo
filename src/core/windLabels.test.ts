import { describe, expect, it } from 'vitest'
import { barSpan, KT_PER_MPS, LABEL_CHAR_PX, LABEL_LINE_PX, limitBottomPct, peakBottomPct, windLabels, windPlot, type WindHour, type WindLabel, type WindPlot } from './layerTimeline.ts'

/*
 * Batch FIX, Section 2.4 (phone, 17 Nov): on the wind bar "drone limit 23"
 * sat on the "11" over a day's peak. The limit is said at the bar's left end
 * now, and a peak whose box touches it is not drawn.
 */
const TZ = 'America/New_York'
const NOW = new Date('2026-11-16T16:05:00Z')
const span = barSpan(NOW, TZ)
const kt = (k: number) => k / KT_PER_MPS
const PLOT_W = 350
const PLOT_H = 40

/** The box a label takes on the bar, px, as the component lays it out (peaks centred, the limit from the left edge). */
function box(l: WindLabel, peak: boolean) {
  const w = l.text.length * LABEL_CHAR_PX
  const left = peak ? l.x * PLOT_W - w / 2 : 0
  const bottom = PLOT_H * (1 - l.bottomPct / 100)
  return { l: left, r: left + w, t: bottom - LABEL_LINE_PX, b: bottom }
}
const overlap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b

describe('the wind bar keeps its words apart', () => {
  it("the field case: an 11 kt peak right under a 23 kt limit's words at the left end is dropped; the other days keep theirs", () => {
    /* A plot laid out by hand: the first day's peak in its second hour, its gust cap just under the limit's line. */
    const limitH = 23 / (25 * 1.15)
    const bars = Array.from({ length: 120 }, (_, i) => ({ x: i / 120, w: 1 / 120, h: 0.3, gustH: i === 1 ? limitH - 0.04 : 0.35, band: 1 as const, kt: 8 }))
    const plot: WindPlot = { bars, topKt: 25 * 1.15, limitH, peaks: [0, 1, 2, 3, 4].map((d) => ({ x: (d === 0 ? 1.5 : d * 24 + 14.5) / 120, kt: 11 })) }
    /* Without the rule the two boxes would meet: the limit from 0 to 105 px, the peak at 4 px. */
    const old = { x: 0, bottomPct: limitBottomPct(limitH), text: 'drone limit 23' }
    const first = { x: plot.peaks[0].x, bottomPct: peakBottomPct(limitH - 0.04), text: '11' }
    expect(overlap(box(old, false), box(first, true))).toBe(true)
    const got = windLabels(plot, PLOT_W, PLOT_H, (k) => String(Math.round(k)), 'drone limit 23')
    /* Since the 17 Nov walk the limit's words sit inside the plot (under the line when over it they would not fit), and nothing returned overlaps. */
    expect(got.limit).toEqual({ x: 0, bottomPct: limitBottomPct(limitH, PLOT_H), text: 'drone limit 23' })
    expect(PLOT_H * ((got.limit?.bottomPct ?? 0) / 100) + LABEL_LINE_PX).toBeLessThanOrEqual(PLOT_H + 0.001)
    const boxes = [box(got.limit!, false), ...got.peaks.map((p) => box(p, true))]
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) expect(overlap(boxes[i], boxes[j])).toBe(false)
    /* Under the line the words reach the second day's peak too: that one goes as well; the last three days keep theirs. */
    expect(got.peaks.map((p) => p.x)).toEqual(plot.peaks.slice(2).map((p) => p.x))
  })

  it('with no drone chosen there is no limit, and every day keeps its peak', () => {
    const hours: WindHour[] = Array.from({ length: span.hours }, (_, i) => ({ mps: kt(8 + (i % 24 === 14 ? 6 : 0)), gustMps: kt(13), fromDeg: 337.5 }))
    const got = windLabels(windPlot(hours, span, TZ, null), PLOT_W, PLOT_H, (k) => String(Math.round(k)), null)
    expect(got.limit).toBeNull()
    expect(got.peaks).toHaveLength(5)
  })

  it('no two labels it returns ever overlap, across many winds and limits', () => {
    let checked = 0
    for (let seed = 1; seed <= 60; seed += 1) {
      let r = seed
      const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647)
      const hours: WindHour[] = Array.from({ length: span.hours }, () => {
        const s = rnd() * 22
        return { mps: kt(s), gustMps: kt(s + rnd() * 8), fromDeg: rnd() * 360 }
      })
      for (const lim of [null, 15, 19, 23, 27]) {
        const text = lim === null ? null : `drone limit ${lim}`
        const got = windLabels(windPlot(hours, span, TZ, lim === null ? null : kt(lim)), PLOT_W, PLOT_H, (k) => String(Math.round(k)), text)
        const boxes = [...(got.limit === null ? [] : [box(got.limit, false)]), ...got.peaks.map((p) => box(p, true))]
        for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) expect(overlap(boxes[i], boxes[j]), `seed ${seed} limit ${lim}`).toBe(false)
        checked += boxes.length
      }
    }
    /* Something was looked at (failure-modes B). */
    expect(checked).toBeGreaterThan(600)
  })
})

describe('the limit label stays inside the plot (Batch FIX, Section 2.7 walk)', () => {
  it('near the top it sits under its line, never above the plot into the arrows', () => {
    const plotH = 46
    for (const limitH of [0.1, 0.5, 0.7, 0.8, 0.85, 0.9, 0.95, 1]) {
      const foot = limitBottomPct(limitH, plotH)
      const topPx = plotH * (foot / 100) + LABEL_LINE_PX
      expect(topPx, `limit at ${limitH}`).toBeLessThanOrEqual(plotH + 0.001)
      expect(foot).toBeGreaterThanOrEqual(0)
    }
  })
  it('with room, still just over its line', () => {
    expect(limitBottomPct(0.4, 46)).toBe(42)
  })
})
