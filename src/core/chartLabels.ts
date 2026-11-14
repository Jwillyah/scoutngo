/*
 * THE HOME CHARTS' WORDS NEVER SIT ON EACH OTHER (Batch NOW, Section 3.2;
 * 13 Nov screenshots: the surf's 1.8 ft bubble on its 1.0 ft gridline label,
 * the drone's 20 kt on 19 kt, the tide's 3.8 ft on 2.1 ft and the "0" on the
 * time ticks). Boxes in the chart's own pixels, measured on the drawn page;
 * the decisions here:
 *
 *   axis labels  a gridline label that hits a time tick, a fixed word (the
 *                tide's turns, a dot) or another gridline label is dropped,
 *                the middle one first: the line stays, its number goes
 *   time ticks   on a narrow card two ticks can meet ("now" on "6p"): the
 *                later goes, "now" never; a tick under a dot goes
 *   the bubble   its usual side first, then the other side, then above and
 *                below its dot, inside the chart; the first that hits
 *                nothing wins. When none does, the usual side, and the axis
 *                labels and ticks it hits are dropped (the bubble is the
 *                reading; an axis number is the scale)
 */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Two boxes share more than `pad` px each way. */
export function overlaps(a: Box, b: Box, pad = 1): boolean {
  return a.x + a.w - pad > b.x && b.x + b.w - pad > a.x && a.y + a.h - pad > b.y && b.y + b.h - pad > a.y
}

const inside = (b: Box, area: Box) => b.x >= area.x - 1 && b.y >= area.y - 1 && b.x + b.w <= area.x + area.w + 1 && b.y + b.h <= area.y + area.h + 1

export type BubbleSide = 'right' | 'left' | 'above' | 'below'

export interface LabelPlan {
  bubble: BubbleSide | null
  /** One per gridline label, in order. */
  grid: boolean[]
  /** One per time tick, in order (the first is "now" when there is one, and always stays). */
  ticks: boolean[]
}

/** How far past the plot's edge a value bubble may stand. */
export const BUBBLE_EDGE_PX = 4

/** Line points inside a box, a pixel in from its edge. */
export function lineHits(b: Box, line: readonly { x: number; y: number }[]): number {
  return line.filter((pt) => pt.x > b.x + 1 && pt.x < b.x + b.w - 1 && pt.y > b.y + 1 && pt.y < b.y + b.h - 1).length
}

/*
 * Batch LIVE, Section 4.2 (14 Nov: the drone card's "22 kt" bubble on its
 * own line): `line` is the chart's drawn lines sampled as points (the data
 * line and the now line); the bubble takes a side no point of them is in,
 * else the side with the fewest.
 */
export function planChartLabels(p: { area: Box; grid: readonly Box[]; ticks: readonly Box[]; fixed: readonly Box[]; bubble: { usual: 'right' | 'left'; boxes: Record<BubbleSide, Box> } | null; dots?: readonly Box[]; line?: readonly { x: number; y: number }[] }): LabelPlan {
  const grid = p.grid.map(() => true)
  /* Ticks left to right: a later one on an earlier one goes; one under a dot goes. */
  const ticks = p.ticks.map(() => true)
  const order0 = p.ticks.map((_, i) => i).sort((a, b) => p.ticks[a].x - p.ticks[b].x)
  for (const i of order0) {
    if (i === 0) continue
    if (order0.some((j) => j !== i && ticks[j] && p.ticks[j].x <= p.ticks[i].x && overlaps(p.ticks[i], p.ticks[j]))) ticks[i] = false
    if ((p.dots ?? []).some((d) => overlaps(p.ticks[i], d))) ticks[i] = false
  }
  const shownTicks = () => p.ticks.filter((_, i) => ticks[i])
  const hitsFixed = (b: Box) => shownTicks().some((t) => overlaps(b, t)) || p.fixed.some((f) => overlaps(b, f))
  p.grid.forEach((g, i) => {
    if (hitsFixed(g)) grid[i] = false
  })
  /* Gridline labels on each other: the middle one goes first, then the later. */
  const order = p.grid.map((_, i) => i).sort((a, b) => (a === 1 ? -1 : b === 1 ? 1 : b - a))
  for (const i of order) {
    if (!grid[i]) continue
    if (p.grid.some((g, j) => j !== i && grid[j] && overlaps(p.grid[i], g))) grid[i] = false
  }
  if (p.bubble === null) return { bubble: null, grid, ticks }
  /* Batch LIVE, Section 4.2: a bubble may stand a few px past the plot's edge (on a 44 px chart, "above" missed by one). */
  const roomy = { x: p.area.x - BUBBLE_EDGE_PX, y: p.area.y - BUBBLE_EDGE_PX, w: p.area.w + 2 * BUBBLE_EDGE_PX, h: p.area.h + 2 * BUBBLE_EDGE_PX }
  const sides: BubbleSide[] = [p.bubble.usual, p.bubble.usual === 'right' ? 'left' : 'right', 'above', 'below']
  const clear = (s: BubbleSide) => {
    const b = p.bubble?.boxes[s] as Box
    return inside(b, roomy) && !hitsFixed(b) && !p.grid.some((g, i) => grid[i] && overlaps(b, g)) && lineHits(b, p.line ?? []) === 0
  }
  const pick = sides.find(clear)
  if (pick !== undefined) return { bubble: pick, grid, ticks }
  /* No side is clear of everything: off the line and the ticks first (inside the chart), the gridline numbers give way. */
  const offLine = sides.filter((s) => inside(p.bubble?.boxes[s] as Box, roomy) && lineHits(p.bubble?.boxes[s] as Box, p.line ?? []) === 0 && !hitsFixed(p.bubble?.boxes[s] as Box))[0]
  if (offLine !== undefined) {
    const b = p.bubble.boxes[offLine]
    return { bubble: offLine, grid: grid.map((on, i) => on && !overlaps(b, p.grid[i])), ticks }
  }
  /* Batch LIVE, Section 4.2: with a line known and no room anywhere (the largest text on a small chart), the value is left off; the dot stays. */
  if ((p.line ?? []).length > 0) return { bubble: null, grid, ticks }
  const usual = p.bubble.boxes[p.bubble.usual]
  return { bubble: p.bubble.usual, grid: grid.map((on, i) => on && !overlaps(usual, p.grid[i])), ticks: ticks.map((on, i) => on && (i === 0 || !overlaps(usual, p.ticks[i]))) }
}
