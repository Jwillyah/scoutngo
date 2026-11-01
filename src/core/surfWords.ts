/*
 * THE SURF PAGE'S WORDS, from the field test of 30 Oct (build-touch §14).
 * Arithmetic and naming only; src/components/SurfPage.tsx draws them.
 *
 *  - Swell trains: up to three, biggest first, named Primary, Secondary,
 *    Third. "Groundswell" only from GROUNDSWELL_S up: a 6–7 s swell is wind
 *    swell, and calling it groundswell promised lines that never came.
 *  - The cleanest stretch follows the wind's direction to the beach first:
 *    offshore hours, else cross-shore, never onshore however light. It said
 *    "cleanest 4:30–9:30 PM" over five onshore hours.
 *  - The buoy against the forecast, in words, with both numbers.
 *  - Hour labels short enough not to wrap are formatShortHour in
 *    src/core/timezone.ts, the one clock writer.
 */
export const GROUNDSWELL_S = 10
export const TRAINS = 3

export interface Train {
  heightM: number
  periodS: number
  fromDeg: number | null
}

export interface NamedTrain extends Train {
  /** "Primary", "Secondary", "Third". */
  rank: string
  groundswell: boolean
}

const RANK = ['Primary', 'Secondary', 'Third']

/** The trains worth naming: real heights only, biggest first, at most TRAINS. */
export function namedTrains(trains: readonly (Train | null)[]): NamedTrain[] {
  return trains
    .filter((t): t is Train => t !== null && Number.isFinite(t.heightM) && t.heightM > 0.05 && Number.isFinite(t.periodS))
    .sort((a, b) => b.heightM - a.heightM)
    .slice(0, TRAINS)
    .map((t, i) => ({ ...t, rank: RANK[i], groundswell: t.periodS >= GROUNDSWELL_S }))
}

export type WindClass = 'offshore' | 'cross' | 'onshore'

export interface WindHour {
  at: Date
  cls: WindClass | null
}

/** The longest run of the best wind class present, offshore before cross; onshore never. Null when there is none. */
export function cleanestRun(hours: readonly WindHour[]): { from: Date; to: Date; cls: WindClass } | null {
  for (const cls of ['offshore', 'cross'] as const) {
    let run: WindHour[] = []
    let top: WindHour[] = []
    for (const h of hours) {
      if (h.cls === cls) run.push(h)
      else run = []
      if (run.length > top.length) top = [...run]
    }
    if (top.length > 0) return { from: top[0].at, to: new Date(top[top.length - 1].at.getTime() + 3_600_000), cls }
  }
  return null
}

/** "the buoy is running bigger than forecast: 3.6 vs 2.9 ft". Within 15% is "about as forecast". */
export function buoyWords(buoyFt: number | null, forecastFt: number | null): string | null {
  if (buoyFt === null || forecastFt === null || !Number.isFinite(buoyFt) || !Number.isFinite(forecastFt) || forecastFt <= 0) return null
  const pair = `${buoyFt.toFixed(1)} vs ${forecastFt.toFixed(1)} ft`
  const r = buoyFt / forecastFt
  return r > 1.15 ? `The buoy is running bigger than forecast: ${pair}` : r < 0.85 ? `The buoy is running smaller than forecast: ${pair}` : `The buoy is about as forecast: ${pair}`
}

/** Cams on the Surf page: within CAM_MI of the pin, nearest first, at most three. */
export const CAM_MI = 30
export function nearestWithin<T extends { at: { lat: number; lon: number } }>(cams: readonly T[], metresTo: (c: T) => number, n = 3): { cam: T; m: number }[] {
  return cams
    .map((cam) => ({ cam, m: metresTo(cam) }))
    .filter((c) => c.m <= CAM_MI * 1609.344)
    .sort((a, b) => a.m - b.m)
    .slice(0, n)
}
