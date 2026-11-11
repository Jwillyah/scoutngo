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
  /** The stretch of coast it calibrates (BEACH_REGIONS). */
  region: BeachRegionId
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
    region: 'vb',
    at: '2026-11-10T11:52:00Z',
    buoy: '44099',
    buoyFt: 3.0,
    buoyPeriodS: 12,
    seenFt: [2, 3],
    how: 'field check 6:52-7:05 AM with the beach cam: thigh to waist, onshore texture; the app said "≈ 4.8 ft"',
  },
  {
    spot: 'S-Turns, Rodanthe',
    region: 'obx',
    /* The day only: the report gave no time. 44095 as the report quotes it, 3.0 ft 12 s from the E. */
    at: '2026-11-10',
    buoy: '44095',
    buoyFt: 3.0,
    buoyPeriodS: 12,
    seenFt: [3, 4],
    how: 'Jwilly’s field report (Batch Beach): 3-4 ft barrels at S-Turns; the app, pinned on the sound side, said 0-1 ft FLAT',
  },
]

/*
 * THE REGIONS (Batch Beach, Section 2: the Outer Banks break bigger than
 * Virginia Beach for the same buoy). A box each, south to north; a spot
 * outside every box keeps BEACH_CAP. Sandbridge is Virginia Beach; Corolla
 * to Ocracoke is the Outer Banks.
 */
export type BeachRegionId = 'obx' | 'vb'

export interface BeachRegion {
  id: BeachRegionId
  name: string
  south: number
  north: number
  west: number
  east: number
}

export const BEACH_REGIONS: readonly BeachRegion[] = [
  { id: 'obx', name: 'Outer Banks', south: 34.9, north: 36.55, west: -76.3, east: -75.2 },
  { id: 'vb', name: 'Virginia Beach', south: 36.55, north: 37.0, west: -76.3, east: -75.7 },
]
