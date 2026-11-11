/*
 * WHERE YOUR FIELD REPORTS ARE KEPT (Batch Beach, Section 3): this phone's
 * localStorage, nothing else. "scoutngo." keys go in the backup file and
 * Privacy › Clear this phone removes them. Sharing is a separate tap, off by
 * default (src/core/fieldReports.ts shareText).
 */
import { REPORT_RATINGS, REPORT_SIZES, type FieldReport } from '../core/fieldReports.ts'

export const FIELD_REPORTS_KEY = 'scoutngo.fieldReports.v1'
/* A season of sessions; the oldest go first. */
export const MAX_REPORTS = 200
/** Sent on this window after a report is saved or removed, so the spot's factor is read again. */
export const REPORTS_CHANGED = 'scoutngo:fieldReports'
const changed = () => {
  try {
    window.dispatchEvent(new Event(REPORTS_CHANGED))
  } catch {
    /* No window (tests, scripts). */
  }
}

type Store = Pick<Storage, 'getItem' | 'setItem'>
const local = (): Store | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

const SIZES = new Set<string>(REPORT_SIZES.map((s) => s.id))
const RATINGS = new Set<string>(REPORT_RATINGS)

export function readReports(store: Store | null = local()): FieldReport[] {
  if (store === null) return []
  try {
    const raw = JSON.parse(store.getItem(FIELD_REPORTS_KEY) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter(
      (r): r is FieldReport =>
        r !== null &&
        typeof r === 'object' &&
        typeof r.spot === 'string' &&
        typeof r.name === 'string' &&
        typeof r.at === 'number' &&
        SIZES.has(r.size) &&
        RATINGS.has(r.rating) &&
        (r.buoyFt === null || typeof r.buoyFt === 'number'),
    )
  } catch {
    return []
  }
}

export function addReport(report: FieldReport, store: Store | null = local()): FieldReport[] {
  const next = [...readReports(store), report].sort((a, b) => a.at - b.at).slice(-MAX_REPORTS)
  try {
    store?.setItem(FIELD_REPORTS_KEY, JSON.stringify(next))
  } catch {
    /* Full or refused: kept for this screen only. */
  }
  changed()
  return next
}

export function removeReport(at: number, spot: string, store: Store | null = local()): FieldReport[] {
  const next = readReports(store).filter((r) => !(r.at === at && r.spot === spot))
  try {
    store?.setItem(FIELD_REPORTS_KEY, JSON.stringify(next))
  } catch {
    /* As above. */
  }
  changed()
  return next
}
