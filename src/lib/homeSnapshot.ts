import { useEffect, useState } from 'react'

/*
 * ONE RESOLVED SNAPSHOT PER SPOT (Batch SIMPLE-3, Section 0.1).
 *
 * WHY. 23 Nov 5:10 PM, the same minute, the home showed two states: the mini
 * pictures, Sky "Possible", Surf "1–2 ft", Tide "—", no card; then no
 * pictures, Sky "Likely", Surf "2–3 ft", Tide "High 8:58p", "Color on now".
 * Every part was drawn the moment any input arrived, and each input arrives
 * on its own: the satellite read the call leans on (held by one screen and
 * not another), the beach's facing and the buoy the size leans on, the tide
 * table last. A home mounted again (Back from a page, the spot search
 * closed) started from nothing and walked through the half states again.
 * measurements/2026-11-24-home-flicker.md has the printed evidence.
 *
 * WHAT. Each part of the home (the weather, the sky call, the surf, the tide,
 * the wind, the drone's wind, fish) is shown only once ITS inputs have all
 * answered (`settled`), and then kept, here and on this phone, per spot.
 * Until a part has settled the screen shows what was last shown for that
 * spot: this session's, else the phone's saved one with its age ("2 h ago"),
 * else a light skeleton, never "…", "■■■" or a dash for a value that is on
 * its way. A dash is for a value that has settled and is not there. A part
 * that has not settled after SETTLE_WAIT_MS is shown as it is: what is
 * still missing then is missing, and says so.
 *
 * Kept on this phone only (localStorage, scoutngo.homeSnapshot.v1): the
 * words and numbers the home showed, by spot. Nothing is sent.
 */
export type HomePart = 'weather' | 'sky' | 'surf' | 'tide' | 'wind' | 'fish' | 'drone'
export const HOME_PARTS: readonly HomePart[] = ['weather', 'sky', 'surf', 'tide', 'wind', 'fish', 'drone']

export const SNAPSHOT_KEY = 'scoutngo.homeSnapshot.v1'
/** A part not settled by then is shown as it is. */
export const SETTLE_WAIT_MS = 8_000
/** A saved part older than this is not shown: a skeleton until the new one. */
export const SAVED_MAX_MS = 6 * 3_600_000
/** A shown part older than this says its age. */
export const AGE_SAY_MS = 10 * 60_000
const KEEP_SPOTS = 6

export interface Held<T = unknown> {
  data: T
  /** When it was resolved, ms. */
  at: number
}
type Snap = Partial<Record<HomePart, Held>>

/** What the home shows for a part: the data and when it was resolved; null is the skeleton. */
export interface Shown<T> {
  data: T
  at: number
  /** Older than AGE_SAY_MS: its age is said. */
  aged: boolean
}

/**
 * THE RULE, pure (tests/homeSnapshot.test.ts). A settled live value is shown
 * (and becomes the held one); else the held one while it is young enough;
 * else, after the wait, the live value as it is; else nothing (the skeleton).
 * `valid` drops a held value its own clock has ended (a colour that is over,
 * a tide turn that has passed).
 */
export function choosePart<T>(live: T, settled: boolean, held: Held<T> | undefined, waited: boolean, now: number, valid: (data: T, now: number) => boolean = () => true): Shown<T> | null {
  if (settled) return { data: live, at: now, aged: false }
  if (held !== undefined && now - held.at <= SAVED_MAX_MS && valid(held.data, now)) return { data: held.data, at: held.at, aged: now - held.at > AGE_SAY_MS }
  if (waited) return { data: live, at: now, aged: false }
  return null
}

/** "12 min ago", "2 h ago". */
export function agoWords(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000))
  return min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`
}

/* ------------------------------------------------------------- the store */

const memory = new Map<string, Snap>()
let loaded: Record<string, Snap> | null = null

function readSaved(): Record<string, Snap> {
  if (loaded !== null) return loaded
  try {
    const v = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? '{}') as unknown
    loaded = typeof v === 'object' && v !== null ? (v as Record<string, Snap>) : {}
  } catch {
    loaded = {}
  }
  return loaded
}

/** What is held for a spot: this session's, else this phone's saved one. */
export function heldFor(spot: string): Snap {
  return memory.get(spot) ?? readSaved()[spot] ?? {}
}

/** Keep a settled part for a spot, in memory and on this phone; written only when it changed. */
export function holdPart(spot: string, part: HomePart, data: unknown, at: number): void {
  const snap = { ...heldFor(spot) }
  const before = snap[part]
  if (before !== undefined && JSON.stringify(before.data) === JSON.stringify(data)) {
    /* The same answer again: its time moves on (it is this fresh), the bytes on the phone need not. */
    snap[part] = { data: before.data, at }
    memory.set(spot, snap)
    return
  }
  snap[part] = { data, at }
  memory.set(spot, snap)
  const all = { ...readSaved(), [spot]: snap }
  const spots = Object.keys(all)
  for (const k of spots.slice(0, Math.max(0, spots.length - KEEP_SPOTS))) delete all[k]
  loaded = all
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(all))
  } catch {
    /* Full or private: this session still holds it. */
  }
}

/** For tests and Privacy › Clear this phone. */
export function clearHomeSnapshots(): void {
  memory.clear()
  loaded = null
  firstDrawn.clear()
  waitedSpots.clear()
}

/* ------------------------------------------------------------- the hook */

export interface PartIn<T> {
  live: T
  settled: boolean
  valid?: (data: T, now: number) => boolean
}

/**
 * The home's parts for a spot, each through choosePart. The wait is counted
 * from the first time this spot's home was drawn in this session, so a home
 * mounted again shows its held parts at once and never waits again.
 */
const firstDrawn = new Map<string, number>()
const waitedSpots = new Set<string>()
export function useHomeParts<M extends Record<HomePart, unknown>>(spot: string | null, parts: { [K in keyof M]: PartIn<M[K]> }, now: Date): { [K in keyof M]: Shown<M[K]> | null } {
  const t = now.getTime()
  const waited = spot !== null && waitedSpots.has(spot)
  /* One redraw when the wait ends, so a part that never settles is shown as it is. */
  const [, setTick] = useState(0)
  useEffect(() => {
    if (spot === null || waitedSpots.has(spot)) return
    const started = firstDrawn.get(spot) ?? Date.now()
    firstDrawn.set(spot, started)
    const timer = setTimeout(() => {
      waitedSpots.add(spot)
      setTick((n) => n + 1)
    }, Math.max(0, SETTLE_WAIT_MS - (Date.now() - started)))
    return () => clearTimeout(timer)
  }, [spot])
  const held = spot === null ? {} : heldFor(spot)
  const out = {} as Record<HomePart, Shown<unknown> | null>
  const all = parts as Record<HomePart, PartIn<unknown>>
  for (const k of HOME_PARTS) {
    const p = all[k]
    out[k] = choosePart(p.live, p.settled, held[k], waited, t, p.valid)
  }
  /* What settled is kept, after the draw. */
  const settledKey = HOME_PARTS.map((k) => (all[k].settled ? JSON.stringify(all[k].live) : '-')).join('|')
  useEffect(() => {
    if (spot === null) return
    for (const k of HOME_PARTS) if (all[k].settled) holdPart(spot, k, all[k].live, Date.now())
  }, [spot, settledKey]) // eslint-disable-line react-hooks/exhaustive-deps
  return out as { [K in keyof M]: Shown<M[K]> | null }
}
