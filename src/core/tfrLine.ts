/*
 * ONE TFR TRUTH (Batch SIMPLE-1, Section 1). The app does fetch TFRs
 * (/api/tfr, src/lib/faaLiveData.ts), so every place that mentions them says
 * what that fetch found, from the fetch itself: the count, the radius it was
 * counted in, and when tfr.faa.gov answered, in the venue's time zone. A
 * failed or missing fetch says "couldn't check", never 0. NOTAMs other than
 * TFRs are not fetched, and the line says so.
 *
 * Failure mode A in docs/failure-modes.md: one source. The Airspace sheet, the
 * Preflight row and the map's airspace panel all build their words here.
 */
import { atMarker, TFR_NEAR_M, type FaaArea } from './faaLive.ts'
import type { LatLon } from './geo.ts'
import { formatClock, formatDayTime } from './timezone.ts'

/** What the TFR fetch said, for one point. */
export type TfrRead =
  | { kind: 'checking' }
  | { kind: 'failed' }
  | {
      kind: 'ok'
      /** In force today and over the point. */
      inside: number
      /** In force today and within `radiusMi` of the point (the ones over it count too). */
      within: number
      radiusMi: number
      /** When the FAA's answer arrived, ms. */
      at: number
      /** From the phone's copy, because the FAA did not answer now. */
      kept: boolean
    }

/** The statute miles TFRs are counted within (faaLive.ts TFR_NEAR_M). */
export const TFR_RADIUS_MI = Math.round(TFR_NEAR_M / 1609.344)

/** The shape of src/lib/faaLiveData.ts LayerAnswer, so this file never imports the lib. */
export interface TfrAnswer {
  data: FaaArea[] | null
  at: number | null
  from: 'live' | 'kept' | 'none'
}

/** `answer` null: the fetch has not come back yet. Data null: it came back with nothing usable. */
export function tfrRead(answer: TfrAnswer | null, at: LatLon, todayIso: string): TfrRead {
  if (answer === null) return { kind: 'checking' }
  if (answer.data === null || answer.at === null) return { kind: 'failed' }
  const m = atMarker({ tfr: answer.data, nsufr: null, fria: null, heliport: null, sua: null }, at, todayIso)
  if (m.tfrsToday === null) return { kind: 'failed' }
  return { kind: 'ok', inside: m.tfrsToday.inside.length, within: m.tfrsToday.near, radiusMi: TFR_RADIUS_MI, at: answer.at, kept: answer.from === 'kept' }
}

const OTHER = 'other NOTAMs not checked'

/**
 * "TFRs today: 0 within 20 mi · from tfr.faa.gov at 9:14 AM · other NOTAMs not checked".
 * The time is the venue's; a time on another day carries its day.
 */
export function tfrLine(read: TfrRead, timeZone: string, now: Date): string {
  if (read.kind === 'checking') return `TFRs: checking tfr.faa.gov… · ${OTHER}`
  if (read.kind === 'failed') return `TFRs: couldn't check · ${OTHER}`
  const d = new Date(read.at)
  const day = (t: Date) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t)
  const sameDay = day(d) === day(now)
  const when = sameDay ? formatClock(d, timeZone) : formatDayTime(d, timeZone)
  const count = read.inside > 0 ? `${read.inside} over this point, ${read.within} within ${read.radiusMi} mi` : `${read.within} within ${read.radiusMi} mi`
  return `TFRs today: ${count} · ${read.kept ? 'kept from' : 'from'} tfr.faa.gov at ${when} · ${OTHER}`
}
