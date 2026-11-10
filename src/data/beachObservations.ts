/*
 * WHAT THE BEACH WAS, SEEN (Batch QA, Section 0B). Each row is one look at a
 * beach set against the buoy at the same time: the evidence a spot's buoy to
 * beach factor is calibrated from (src/core/surf.ts BEACH_CAP). A spot's
 * factor moves only with rows here, never on a guess.
 *
 * The 30-day history the app keeps (src/core/spotSkill.ts) is the forecast
 * against the buoy, both worked to faces by the same transform: it says how
 * far the forecast runs from the buoy, not how big the beach was. It cannot
 * calibrate this; only a look at the beach can.
 */
export interface BeachObservation {
  spot: string
  at: string
  buoy: string
  /** What the buoy read: significant height, feet, and dominant period, seconds. */
  buoyFt: number
  buoyPeriodS: number
  /** What the beach showed, faces, feet, low and high. */
  seenFt: [number, number]
  how: string
}

export const BEACH_OBSERVATIONS: readonly BeachObservation[] = [
  {
    spot: 'Virginia Beach Fishing Pier',
    at: '2026-11-10T11:52:00Z',
    buoy: '44099',
    buoyFt: 3.0,
    buoyPeriodS: 12,
    seenFt: [2, 3],
    how: 'field check 6:52-7:05 AM with the beach cam: thigh to waist, onshore texture; the app said "≈ 4.8 ft"',
  },
]
