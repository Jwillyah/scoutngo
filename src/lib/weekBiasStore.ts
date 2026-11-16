/*
 * WHERE THE WEEK'S CALLS ARE KEPT (Batch DRONE, Section 1.7): this phone's
 * localStorage, nothing else, keyed by the spot rounded to two decimals
 * (src/core/spotSkill.ts spotKey). The coordinate never leaves the phone.
 * The arithmetic is src/core/weekBias.ts.
 *
 * Under "scoutngo.", so the backup carries it and Privacy › Clear this phone
 * removes it, as the per-spot check (src/lib/spotSkillStore.ts). Not in
 * backup.ts's WORTH_KEEPING: the app writes it by itself.
 *
 * Stored compact, one tuple a call: [made day, days ahead, low ft].
 */
import { logWeek, type WeekCall } from '../core/weekBias.ts'

export const WEEK_BIAS_KEY = 'scoutngo.weekBias.v1'
/* The spots you surf, as the per-spot check keeps (spotSkillStore MAX_SPOTS). */
export const MAX_WEEK_SPOTS = 12

type Store = Pick<Storage, 'getItem' | 'setItem'>
const local = (): Store | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

const DAY_MS = 86_400_000
const dayNo = (iso: string) => Math.floor(Date.parse(`${iso}T12:00:00Z`) / DAY_MS)
const isoOf = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10)

type Tuple = [number, number, number]
type Raw = Record<string, { t: number; c: Tuple[] }>

function readRaw(store: Store | null): Raw {
  if (store === null) return {}
  try {
    const raw = JSON.parse(store.getItem(WEEK_BIAS_KEY) ?? '{}') as unknown
    return raw !== null && typeof raw === 'object' ? (raw as Raw) : {}
  } catch {
    return {}
  }
}

/** This spot's logged calls. */
export function readWeekLog(spot: string, store: Store | null = local()): WeekCall[] {
  const e = readRaw(store)[spot]
  if (e === undefined || !Array.isArray(e.c)) return []
  return e.c
    .filter((r) => Array.isArray(r) && r.every((x) => typeof x === 'number' && Number.isFinite(x)))
    .map(([m, ahead, low]) => ({ made: isoOf(m), date: isoOf(m + ahead), lowFt: low }))
}

/** Add today's week of calls for this spot. Quietly nothing when storage is not there. */
export function keepWeek(spot: string, made: string, calls: readonly { date: string; lowFt: number | null }[], now: number, store: Store | null = local()): void {
  if (store === null) return
  try {
    const raw = readRaw(store)
    const log = logWeek(readWeekLog(spot, store), made, calls)
    raw[spot] = { t: now, c: log.map((c) => [dayNo(c.made), dayNo(c.date) - dayNo(c.made), c.lowFt]) }
    const keep = Object.entries(raw)
      .sort((a, b) => (b[1]?.t ?? 0) - (a[1]?.t ?? 0))
      .slice(0, MAX_WEEK_SPOTS)
    store.setItem(WEEK_BIAS_KEY, JSON.stringify(Object.fromEntries(keep)))
  } catch {
    /* A full or locked store: the log waits for the next open. */
  }
}
