/*
 * ONE STATION FOR THE WIND, AND IT STAYS (Batch FIX, Section 1). 17 Nov at
 * 7:06, two loads a minute apart at the 1st St jetty: "13 kt NE onshore"
 * leaning to Cape Henry (16 kt, 7 minutes old), then "7 kt NNE
 * cross-onshore" leaning to KNTU (3 kt, 1 h 10 min old); the map's readout
 * said KNTU at 1 h 10 min as well. Each load picked again from whatever had
 * answered, and a station that did not answer once was simply not there
 * (fixtures/truth/2026-11-17-vb-wind.json).
 *
 * One pick, for the home, the Wind page, the map's readout, the drone page
 * and the surf call:
 *
 *   fresh      a reading at most PICK_MAX_AGE_MS old (75 min), and not from
 *              more than PICK_AHEAD_MS in the future; when two or more are
 *              fresh, only those within PICK_TIGHT_AGE_MS (30 min) count,
 *              unless none is: never a 70-minute report beside a 7-minute one
 *   order      at a beach, every coastal station before any airport, then
 *              the nearest; inland, the newest, then the nearest
 *   hold       the last choice stays for PICK_HOLD_MS (30 min) while it is
 *              still among the fresh, even when another would now come first
 *   memory     the last choice's reading is kept with it, so a station that
 *              did not answer this time is read from what it said last time,
 *              while that is still fresh
 *
 * Pure: the readings, the time and the last choice in, the choice out. The
 * phone keeps the choice (src/lib/useStationObs.ts).
 */

export const PICK_MAX_AGE_MS = 75 * 60_000
export const PICK_TIGHT_AGE_MS = 30 * 60_000
export const PICK_HOLD_MS = 30 * 60_000
export const PICK_AHEAD_MS = 10 * 60_000

/** A station's latest reading, as the picker needs it. */
export interface PickReading {
  station: { id: string; kind: 'airport' | 'coastal'; km: number }
  at: Date
  kt: number
  gustKt: number | null
  fromDeg: number | null
}

/** What the phone keeps: which station, since when, and what it last said. */
export interface StationChoice {
  id: string
  /** When this station was chosen, epoch ms. */
  chosenAt: number
  /** Its reading when last seen: observed time (epoch ms), knots, from. */
  reading: { at: number; kt: number; gustKt: number | null; fromDeg: number | null }
}

export type PickWhy = 'held' | 'coastal' | 'nearest' | 'newest'

const age = (r: PickReading, now: Date) => now.getTime() - r.at.getTime()

/** Inside the 75 minutes and not from the future. */
export const isFresh = (r: PickReading, now: Date, maxMs = PICK_MAX_AGE_MS): boolean => age(r, now) <= maxMs && age(r, now) >= -PICK_AHEAD_MS

/** The readings that may be picked: the fresh, tightened to the half hour when there is a choice. */
export function freshPool<R extends PickReading>(readings: readonly (R | null)[], now: Date): R[] {
  const fresh = readings.filter((r): r is R => r !== null && isFresh(r, now))
  if (fresh.length < 2) return fresh
  const tight = fresh.filter((r) => isFresh(r, now, PICK_TIGHT_AGE_MS))
  return tight.length > 0 ? tight : fresh
}

/**
 * The readings with the last choice's own put back when its station did not
 * answer, or answered with something older than what it said before.
 * `make` builds the reading for the station by id (null when that station
 * is not one of those near the spot, and then nothing is put back). The
 * freshness rules apply to it as to any other: a kept reading past 75
 * minutes is never picked.
 */
export function withRemembered<R extends PickReading>(readings: readonly (R | null)[], prev: StationChoice | null, make: (id: string, reading: StationChoice['reading']) => R | null): (R | null)[] {
  if (prev === null) return [...readings]
  const i = readings.findIndex((r) => r !== null && r.station.id === prev.id)
  const kept = make(prev.id, prev.reading)
  if (kept === null) return [...readings]
  if (i < 0) return [...readings, kept]
  const got = readings[i] as R
  return got.at.getTime() >= prev.reading.at ? [...readings] : readings.map((r, k) => (k === i ? kept : r))
}

/** The order at a beach: coastal first, then nearest; inland: newest, then nearest. */
function order<R extends PickReading>(pool: readonly R[], atCoast: boolean): R[] {
  return [...pool].sort((a, b) =>
    atCoast
      ? Number(a.station.kind === 'airport') - Number(b.station.kind === 'airport') || a.station.km - b.station.km || b.at.getTime() - a.at.getTime()
      : b.at.getTime() - a.at.getTime() || a.station.km - b.station.km,
  )
}

export interface Pick<R extends PickReading> {
  reading: R
  choice: StationChoice
  why: PickWhy
}

/**
 * The station to read now. `readings` are this load's (null for one that did
 * not answer), already with the last choice's put back (withRemembered);
 * `prev` the last choice, or null on a phone that has none.
 */
export function pickStation<R extends PickReading>(readings: readonly (R | null)[], now: Date, prev: StationChoice | null, atCoast: boolean): Pick<R> | null {
  const pool = freshPool(readings, now)
  if (pool.length === 0) return null
  const keep = (r: R, chosenAt: number, why: PickWhy): Pick<R> => ({ reading: r, why, choice: { id: r.station.id, chosenAt, reading: { at: r.at.getTime(), kt: r.kt, gustKt: r.gustKt, fromDeg: r.fromDeg } } })
  if (prev !== null && now.getTime() - prev.chosenAt < PICK_HOLD_MS && now.getTime() >= prev.chosenAt) {
    const held = pool.find((r) => r.station.id === prev.id)
    if (held !== undefined) return keep(held, prev.chosenAt, 'held')
  }
  const best = order(pool, atCoast)[0]
  const why: PickWhy = atCoast ? (best.station.kind === 'coastal' ? 'coastal' : 'nearest') : 'newest'
  /* Chosen again (or for the first time): held from now. */
  return keep(best, now.getTime(), why)
}

/** A kept choice read back from storage, or null when it is not one. */
export function reviveChoice(raw: unknown): StationChoice | null {
  const c = raw as Partial<StationChoice> | null
  const r = c?.reading as Partial<StationChoice['reading']> | undefined
  if (c === null || typeof c !== 'object' || typeof c.id !== 'string' || typeof c.chosenAt !== 'number' || r === undefined || r === null) return null
  if (typeof r.at !== 'number' || typeof r.kt !== 'number' || !Number.isFinite(r.at) || !Number.isFinite(r.kt) || r.kt < 0) return null
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return { id: c.id, chosenAt: c.chosenAt, reading: { at: r.at, kt: r.kt, gustKt: num(r.gustKt), fromDeg: num(r.fromDeg) } }
}
