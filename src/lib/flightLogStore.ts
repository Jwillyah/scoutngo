/*
 * YOUR LAST FLIGHT, ON THIS PHONE ONLY (Batch DRONE, Section 2.4). Opt-in:
 * nothing is kept until you import a log, and "Forget it" removes it. The
 * file itself is never kept or sent; only its summary (src/core/flightLog.ts)
 * and the place it was imported for, in localStorage.
 */
import type { FlightSummary } from '../core/flightLog.ts'
import type { LatLon } from '../core/geo.ts'

export const FLIGHT_LOG_KEY = 'scoutngo.lastFlight.v1'

export interface KeptFlight {
  summary: FlightSummary
  /** Where it flew: the log's takeoff, else the place it was imported at. */
  place: LatLon
  name: string
}

export function readKeptFlight(): KeptFlight | null {
  try {
    const raw = JSON.parse(localStorage.getItem(FLIGHT_LOG_KEY) ?? 'null') as (Omit<KeptFlight, 'summary'> & { summary: Omit<FlightSummary, 'at'> & { at: string | null } }) | null
    if (raw === null || typeof raw.place?.lat !== 'number' || typeof raw.summary?.durationS !== 'number') return null
    return { ...raw, summary: { ...raw.summary, at: raw.summary.at === null ? null : new Date(raw.summary.at) } }
  } catch {
    return null
  }
}

export function keepFlight(f: KeptFlight): void {
  try {
    localStorage.setItem(FLIGHT_LOG_KEY, JSON.stringify({ ...f, summary: { ...f.summary, at: f.summary.at === null ? null : f.summary.at.toISOString() } }))
  } catch {
    /* No storage (a private window): shown for this visit only. */
  }
}

export function forgetFlight(): void {
  try {
    localStorage.removeItem(FLIGHT_LOG_KEY)
  } catch {
    /* nothing kept */
  }
}
