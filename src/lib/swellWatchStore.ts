/*
 * WHERE THE BIGGER-SWELL LOG IS KEPT (Batch FIX, Section 3.4): this phone's
 * localStorage, nothing else, keyed by the spot rounded to two decimals
 * (src/core/spotSkill.ts spotKey), as the week's calls are
 * (src/lib/weekBiasStore.ts). The coordinate never leaves the phone. The
 * arithmetic is src/core/swellWatch.ts.
 *
 * Under "scoutngo.", so the backup carries it and Privacy › Clear this phone
 * removes it. Not in backup.ts's WORTH_KEEPING: the app writes it by itself.
 */
import { logWatch, type WatchLogRow } from '../core/swellWatch.ts'

export const SWELL_WATCH_KEY = 'scoutngo.swellWatch.v1'
/* The spots you surf, as the week's log keeps (weekBiasStore MAX_WEEK_SPOTS). */
export const MAX_WATCH_SPOTS = 12

type Store = Pick<Storage, 'getItem' | 'setItem'>
const local = (): Store | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

type Raw = Record<string, { t: number; r: WatchLogRow[] }>

function readRaw(store: Store | null): Raw {
  if (store === null) return {}
  try {
    const raw = JSON.parse(store.getItem(SWELL_WATCH_KEY) ?? '{}') as unknown
    return raw !== null && typeof raw === 'object' ? (raw as Raw) : {}
  } catch {
    return {}
  }
}

const iso = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const ft = (x: unknown): x is number | null => x === null || (typeof x === 'number' && Number.isFinite(x))

/** This spot's log. */
export function readWatchLog(spot: string, store: Store | null = local()): WatchLogRow[] {
  const e = readRaw(store)[spot]
  if (e === undefined || !Array.isArray(e.r)) return []
  return e.r.filter((r) => r !== null && typeof r === 'object' && iso(r.made) && iso(r.date) && ft(r.callLowFt) && ft(r.callHighFt) && ft(r.topFt))
}

/** Add today's week for this spot. Quietly nothing when storage is not there. */
export function keepWatch(spot: string, made: string, rows: readonly Omit<WatchLogRow, 'made'>[], now: number, store: Store | null = local()): void {
  if (store === null) return
  try {
    const raw = readRaw(store)
    raw[spot] = { t: now, r: logWatch(readWatchLog(spot, store), made, rows) }
    const keep = Object.entries(raw)
      .sort((a, b) => (b[1]?.t ?? 0) - (a[1]?.t ?? 0))
      .slice(0, MAX_WATCH_SPOTS)
    store.setItem(SWELL_WATCH_KEY, JSON.stringify(Object.fromEntries(keep)))
  } catch {
    /* A full or locked store: the log waits for the next open. */
  }
}
