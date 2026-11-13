import { planChartLabels, type Box, type BubbleSide } from '../core/chartLabels.ts'

/*
 * THE HOME CHART'S WORDS, SIZED UP AND PLACED (Batch NOW, Section 3.2): the
 * drawn boxes of one chart's gridline labels, time ticks, its other words
 * and its peak's bubble, handed to src/core/chartLabels.ts; the answer put
 * back as the bubble's side and the labels' visibility. Run after every draw
 * of the chart (the home's fit changes its size).
 */
const rel = (r: DOMRect, o: DOMRect): Box => ({ x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height })

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
  const plan = planChartLabels({ area: rel(chart, o), grid: shown.map((g) => rel(g.getBoundingClientRect(), o)), ticks, fixed: [], bubble, dots })
  shown.forEach((g, i) => {
    if (!plan.grid[i]) g.style.visibility = 'hidden'
  })
  ordered.forEach((t, i) => {
    if (!plan.ticks[i]) t.style.visibility = 'hidden'
  })
  if (peak !== null && bubble !== null && plan.bubble !== bubble.usual) peak.classList.add(plan.bubble === 'below' ? 'hcard__peak--below' : plan.bubble === 'above' ? 'hcard__peak--above' : 'hcard__peak--flip')
}

export type { BubbleSide }
