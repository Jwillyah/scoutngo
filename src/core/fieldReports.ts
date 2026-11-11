/*
 * FIELD REPORTS (Batch Beach, Section 3). One tap after a session or a look:
 * "S-Turns 3-4 ft, good, 7 AM". Kept on this phone (src/lib/fieldReportStore.ts)
 * and used to calibrate that spot's beach factor here: what the beach showed
 * over what the buoy read at the time, the same evidence as
 * src/data/beachObservations.ts, from you.
 *
 * Sharing is off unless you tap it, and then it is only the spot's public
 * name, the hour, the size and the rating: no coordinate, no identity, no
 * history (shareText). Truth is what was seen, never another app's forecast.
 */

export const REPORT_SIZES = [
  { id: '0-1', low: 0, high: 1, words: 'Flat · 0–1 ft' },
  { id: '1-2', low: 1, high: 2, words: '1–2 ft' },
  { id: '2-3', low: 2, high: 3, words: '2–3 ft' },
  { id: '3-4', low: 3, high: 4, words: '3–4 ft' },
  { id: '4-6', low: 4, high: 6, words: '4–6 ft' },
  { id: '6-8', low: 6, high: 8, words: '6–8 ft' },
] as const
export type ReportSize = (typeof REPORT_SIZES)[number]['id']

export const REPORT_RATINGS = ['Poor', 'Fair', 'Good', 'Firing'] as const
export type ReportRating = (typeof REPORT_RATINGS)[number]

export interface FieldReport {
  /** The spot's key on this phone (src/core/spotSkill.ts spotKey). */
  spot: string
  /** The spot's public name, for the list and a share. */
  name: string
  /** When it was seen, ms. */
  at: number
  size: ReportSize
  rating: ReportRating
  /** The buoy's face at this beach when it was seen, worked with the factor at 1 (src/core/spotSkill.ts buoyFaceFt, BEACH_CAP), so the ratio is the factor itself; null when no buoy was in hand. */
  buoyFt: number | null
}

export const sizeOf = (id: ReportSize) => REPORT_SIZES.find((s) => s.id === id) ?? REPORT_SIZES[0]

/* A spot's factor moves only after this many reports with a buoy beside them; one look is a story, three a pattern. */
export const SPOT_FACTOR_MIN_REPORTS = 3
/* The factor stays within these: a report can correct a transform, not replace it. */
export const SPOT_FACTOR_RANGE: readonly [number, number] = [0.5, 2]

/**
 * This spot's factor from its reports: the median of what was seen (the
 * middle of the size) over the buoy's own height at the time, as faces with
 * the factor at 1. Null with fewer than SPOT_FACTOR_MIN_REPORTS such reports.
 * Flat reports count (a buoy of 3 ft giving flat is evidence); a buoy under
 * 0.5 ft does not (nothing to scale).
 */
export function spotFactor(reports: readonly FieldReport[], spot: string): number | null {
  const ratios = reports
    .filter((r) => r.spot === spot && r.buoyFt !== null && r.buoyFt >= 0.5)
    .map((r) => {
      const s = sizeOf(r.size)
      return (s.low + s.high) / 2 / (r.buoyFt as number)
    })
  if (ratios.length < SPOT_FACTOR_MIN_REPORTS) return null
  const s = [...ratios].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  const med = s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2
  return Math.min(SPOT_FACTOR_RANGE[1], Math.max(SPOT_FACTOR_RANGE[0], med))
}

/** What a share says, and nothing more: spot, hour (UTC, to the hour), size, rating. */
export function shareText(r: Pick<FieldReport, 'name' | 'at' | 'size' | 'rating'>): string {
  const hour = new Date(Math.floor(r.at / 3_600_000) * 3_600_000).toISOString().slice(0, 13)
  return `${r.name} · ${hour}:00Z · ${sizeOf(r.size).words} · ${r.rating}`
}
