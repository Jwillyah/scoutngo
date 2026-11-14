import { planChartLabels, type Box, type BubbleSide } from '../core/chartLabels.ts'

/*
 * THE HOME CHART'S WORDS, SIZED UP AND PLACED (Batch NOW, Section 3.2): the
 * drawn boxes of one chart's gridline labels, time ticks, its other words
 * and its peak's bubble, handed to src/core/chartLabels.ts; the answer put
 * back as the bubble's side and the labels' visibility. Run after every draw
 * of the chart (the home's fit changes its size).
 */
const rel = (r: DOMRect, o: DOMRect): Box => ({ x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height })

/** The chart's drawn lines (the data line, the drone's rated wind; the now marker is a guide, as the gridlines, and a bubble may cross it) as points on screen, relative to the box (Batch LIVE, Section 4.2). */
export function linePoints(box: HTMLElement, o: DOMRect): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (const el of box.querySelectorAll<SVGGeometryElement>('svg .hcard__line, svg .hcard__rated')) {
    /* WebKit throws InvalidStateError from getTotalLength on a path not drawn (a chart hidden on a short screen): skipped, never a thrown render (14 Nov, the 390 x 664 home went blank). */
    try {
      const m = el.getScreenCTM()
      if (m === null || typeof el.getTotalLength !== 'function' || el.getClientRects().length === 0) continue
      const len = el.getTotalLength()
      const n = Math.max(2, Math.min(240, Math.round(len / 2)))
      for (let i = 0; i <= n; i += 1) {
        const p = el.getPointAtLength((len * i) / n)
        out.push({ x: m.a * p.x + m.c * p.y + m.e - o.left, y: m.b * p.x + m.d * p.y + m.f - o.top })
      }
    } catch {
      /* Not drawn: no points. */
    }
  }
  return out
}

export function fitChartLabels(box: HTMLElement): void {
  const grid = [...box.querySelectorAll<HTMLElement>('.hcard__gl')]
  for (const g of grid) g.style.visibility = ''
  const tickEls = [...box.querySelectorAll<HTMLElement>('.hcard__ticks > span')]
  for (const t of tickEls) t.style.visibility = ''
  const peak = box.querySelector<HTMLElement>('.hcard__peak')
  peak?.classList.remove('hcard__peak--below', 'hcard__peak--above', 'hcard__peak--flip')
  const o = box.getBoundingClientRect()
  if (o.width === 0) return
  const chart = box.querySelector('svg')?.getBoundingClientRect() ?? o
  const shown = grid.filter((g) => getComputedStyle(g).display !== 'none')
  /* "now" first, so it is the one kept. */
  const ordered = [...tickEls].sort((a, b) => Number(b.textContent?.trim() === 'now') - Number(a.textContent?.trim() === 'now'))
  const ticks = ordered.map((t) => rel(t.getBoundingClientRect(), o))
  const dot = peak?.querySelector('.hcard__peakdot')?.getBoundingClientRect() ?? null
  const label = peak?.querySelector('.hcard__peaklabel')?.getBoundingClientRect() ?? null
  let bubble: Parameters<typeof planChartLabels>[0]['bubble'] = null
  if (peak !== null && dot !== null && label !== null) {
    const cx = dot.left + dot.width / 2 - o.left
    const cy = dot.top + dot.height / 2 - o.top
    const w = label.width
    const h = label.height
    const usual = peak.classList.contains('hcard__peak--left') ? 'left' : 'right'
    bubble = { usual, boxes: { right: { x: cx + dot.width / 2 + 4, y: cy - h / 2, w, h }, left: { x: cx - dot.width / 2 - 4 - w, y: cy - h / 2, w, h }, above: { x: cx - w / 2, y: cy - dot.height / 2 - 2 - h, w, h }, below: { x: cx - w / 2, y: cy + dot.height / 2 + 2, w, h } } }
  }
  const dots = dot === null ? [] : [rel(dot, o)]
  const plan = planChartLabels({ area: rel(chart, o), grid: shown.map((g) => rel(g.getBoundingClientRect(), o)), ticks, fixed: [], bubble, dots, line: linePoints(box, o) })
  shown.forEach((g, i) => {
    if (!plan.grid[i]) g.style.visibility = 'hidden'
  })
  ordered.forEach((t, i) => {
    if (!plan.ticks[i]) t.style.visibility = 'hidden'
  })
  const lab = peak?.querySelector<HTMLElement>('.hcard__peaklabel') ?? null
  if (lab !== null) lab.style.visibility = bubble !== null && plan.bubble === null ? 'hidden' : ''
  if (peak !== null && bubble !== null && plan.bubble !== null && plan.bubble !== bubble.usual) peak.classList.add(plan.bubble === 'below' ? 'hcard__peak--below' : plan.bubble === 'above' ? 'hcard__peak--above' : 'hcard__peak--flip')
}

export type { BubbleSide }
