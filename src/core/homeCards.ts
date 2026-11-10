/*
 * THE HOME'S CARDS, LOOK D (Batch Flow, Section 3; boards D_Home6, D_Home2).
 * The arithmetic behind each card's live graphic, nothing drawn:
 *
 *   layout   1-3 activities picked: full-width cards with big charts
 *            (D_Home2); 4-6 (or nothing picked yet): surf full width, wind
 *            and tide a pair, sky / drone / moon a small row (D_Home6)
 *   surf     the next 24 hours of faces, the night shaded, and when it is
 *            first Fun or better ("Fun 7 AM", "Fun now")
 *   tide     the curve between the station's highs and lows (a cosine
 *            between turns, the shape NOAA's own curve takes), every turn
 *            labelled
 *   drone    the wind at the ground, 200 ft and 400 ft (between the
 *            forecast's 10 m and 120 m, on a log of the height)
 *   next     one line under the cards: "surf from 7 AM · drone calm from
 *            6:30 AM"
 */
import { cardList, type Activity, type CardKind } from './homeDay.ts'

export type HomeLayout = 'few' | 'many'

/** Few (1-3 picked) or many (4-6, or the default four when nothing is picked). */
export function homeLayout(picked: readonly Activity[] | null): HomeLayout {
  return picked !== null && picked.length > 0 && picked.length <= 3 ? 'few' : 'many'
}

/** Few: each picked activity's first card, then their others, three at most (surf alone: surf, wind, tide; surf, drone, shoot: surf, drone, sky). */
export function fewCards(order: readonly Activity[], drone: boolean): CardKind[] {
  const own: Record<Activity, CardKind[]> = { surf: ['surf', 'wind', 'tide'], shoot: ['sky', 'moon'], drone: ['drone', 'wind'], fish: ['wind', 'tide'], weather: ['wind', 'tide'] }
  const list: CardKind[] = []
  const add = (c: CardKind) => {
    if (!list.includes(c) && (c !== 'drone' || drone)) list.push(c)
  }
  for (const a of order) add(own[a][0])
  for (const a of order) for (const c of own[a].slice(1)) add(c)
  return list.slice(0, 3)
}

/** The cards the home shows, in its order: few (fewCards) or many (cardList). The menu lists the same (Batch Flow, Section 8). `order` is the activities in the home's order (src/lib/activities.ts homeOrder). */
export function homeCardsShown(layout: HomeLayout, order: readonly Activity[], droneInKit: boolean): CardKind[] {
  const drone = droneInKit || order.includes('drone')
  return layout === 'few' ? fewCards(order, drone) : cardList(order, drone)
}

/* ---------------------------------------------------------------- surf */

export interface SurfPoint {
  at: Date
  ft: number
  fun: boolean
}

/** When the surf is first Fun or better from `now` on: "now", a time, or null for none in the window. */
export function firstFun(points: readonly SurfPoint[], now: Date): Date | 'now' | null {
  const ahead = points.filter((p) => p.at.getTime() >= now.getTime() - 1_800_000)
  const first = ahead.find((p) => p.fun)
  if (first === undefined) return null
  return first.at.getTime() <= now.getTime() + 1_800_000 ? 'now' : first.at
}

export interface ChartBox {
  w: number
  h: number
}

/** An area chart's line and fill, the hours across, the feet up (a floor of 4 ft so a flat day reads flat). */
export function surfPath(points: readonly SurfPoint[], from: Date, hours: number, box: ChartBox): { line: string; fill: string } | null {
  const t0 = from.getTime()
  const span = hours * 3_600_000
  const inside = points.filter((p) => p.at.getTime() >= t0 - 3_600_000 && p.at.getTime() <= t0 + span + 3_600_000)
  if (inside.length < 2) return null
  const top = Math.max(4, ...inside.map((p) => p.ft)) * 1.15
  const xy = inside.map((p) => [Math.max(0, Math.min(box.w, ((p.at.getTime() - t0) / span) * box.w)), box.h - (p.ft / top) * box.h] as const)
  const line = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  return { line, fill: `${line} L${xy[xy.length - 1][0].toFixed(1)} ${box.h} L${xy[0][0].toFixed(1)} ${box.h} Z` }
}

/** The night inside the window, as shares of its width: from sunset (or the start) to sunrise (or the end). */
export function nightSpans(from: Date, hours: number, sunsets: readonly Date[], sunrises: readonly Date[]): { a: number; b: number }[] {
  const t0 = from.getTime()
  const t1 = t0 + hours * 3_600_000
  const share = (t: number) => Math.max(0, Math.min(1, (t - t0) / (t1 - t0)))
  const events = [...sunsets.map((t) => ({ t: t.getTime(), k: 'set' as const })), ...sunrises.map((t) => ({ t: t.getTime(), k: 'rise' as const }))].sort((a, b) => a.t - b.t)
  const out: { a: number; b: number }[] = []
  /* Dark at the start when the last event before it was a sunset. */
  const before = [...events].reverse().find((e) => e.t <= t0)
  let darkFrom: number | null = before?.k === 'set' ? t0 : null
  for (const e of events) {
    if (e.t <= t0 || e.t >= t1) continue
    if (e.k === 'set') darkFrom = e.t
    else if (darkFrom !== null) {
      out.push({ a: share(darkFrom), b: share(e.t) })
      darkFrom = null
    }
  }
  if (darkFrom !== null) out.push({ a: share(darkFrom), b: 1 })
  return out.filter((s) => s.b > s.a)
}

/* ---------------------------------------------------------------- tide */

export interface Turn {
  at: Date
  kind: 'high' | 'low'
  feet: number
}

/** The height between two turns: a half cosine from one to the next. Null outside the turns given. */
export function tideAt(turns: readonly Turn[], t: Date): number | null {
  const x = t.getTime()
  for (let i = 0; i < turns.length - 1; i += 1) {
    const a = turns[i]
    const b = turns[i + 1]
    if (x >= a.at.getTime() && x <= b.at.getTime()) {
      const s = (x - a.at.getTime()) / Math.max(1, b.at.getTime() - a.at.getTime())
      return a.feet + (b.feet - a.feet) * (1 - Math.cos(Math.PI * s)) / 2
    }
  }
  return null
}

/** The curve over a window, sampled every `stepMin` minutes, with the turns inside it placed. */
export function tideCurve(turns: readonly Turn[], from: Date, hours: number, box: ChartBox, stepMin = 20): { line: string; turns: { x: number; y: number; turn: Turn }[]; scale: (ft: number) => number } | null {
  const t0 = from.getTime()
  const span = hours * 3_600_000
  const near = turns.filter((t) => t.at.getTime() >= t0 - 12 * 3_600_000 && t.at.getTime() <= t0 + span + 12 * 3_600_000)
  if (near.length < 2) return null
  const lo = Math.min(...near.map((t) => t.feet))
  const hi = Math.max(...near.map((t) => t.feet))
  const pad = Math.max(0.3, (hi - lo) * 0.15)
  const y = (ft: number) => box.h - ((ft - (lo - pad)) / (hi - lo + 2 * pad)) * box.h
  const pts: string[] = []
  for (let m = 0; m <= hours * 60; m += stepMin) {
    const ft = tideAt(near, new Date(t0 + m * 60_000))
    if (ft !== null) pts.push(`${pts.length === 0 ? 'M' : 'L'}${((m / (hours * 60)) * box.w).toFixed(1)} ${y(ft).toFixed(1)}`)
  }
  if (pts.length < 2) return null
  return {
    line: pts.join(' '),
    turns: near.filter((t) => t.at.getTime() >= t0 && t.at.getTime() <= t0 + span).map((t) => ({ x: ((t.at.getTime() - t0) / span) * box.w, y: y(t.feet), turn: t })),
    scale: y,
  }
}

/* --------------------------------------------------------------- drone */

const LOG = (h: number) => Math.log(h / 10) / Math.log(120 / 10)

/** The wind at a height between the forecast's 10 m and 120 m, on a log of the height (null when either end is missing). */
export function windAtFeet(mps10: number | null, mps120: number | null, feet: number): number | null {
  if (mps10 === null || mps120 === null) return null
  const m = Math.max(10, feet * 0.3048)
  return mps10 + (mps120 - mps10) * Math.min(1.2, LOG(m))
}

/** The drone card's ladder: 400 ft, 200 ft, ground. */
export function droneLadder(mps10: number | null, mps120: number | null): { label: string; mps: number | null }[] {
  return [
    { label: '400', mps: mps120 },
    { label: '200', mps: windAtFeet(mps10, mps120, 200) },
    { label: 'gnd', mps: mps10 },
  ]
}

/* ---------------------------------------------------------------- next */

export interface NextItem {
  what: string
  from: Date
}

/** "Next: surf from 7 AM · drone calm from 6:30 AM": the windows still to come, soonest first, two at most. */
export function nextLine(items: readonly NextItem[], now: Date, clock: (d: Date) => string): string | null {
  const ahead = items.filter((i) => i.from.getTime() > now.getTime() - 60_000).sort((a, b) => a.from.getTime() - b.from.getTime()).slice(0, 2)
  if (ahead.length === 0) return null
  return ahead.map((i) => (i.from.getTime() <= now.getTime() ? `${i.what} now` : `${i.what} from ${clock(i.from)}`)).join(' · ')
}
