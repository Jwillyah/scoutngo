import type { LatLon } from '../../core/geo.ts'

/* A fly-it-yourself session, handed from Preflight to the 3D view (Clay3D.tsx). */
export interface FlySession {
  takeoff: LatLon
  ceilingFt: number
  focal: 24 | 70
  flightMinutes: number
  wind: { fromDeg: number; mps: number } | null
  /** Top of what stands at a point: metres absolute (scan) or above the local ground (map boxes). */
  surfaceAt: (at: LatLon) => number | null
  surfaceRelative: boolean
  /** Whether the drone at `at`, feet above takeoff, is hidden from the pilot (src/core/flight.ts). */
  hiddenAt: (at: LatLon, ft: number) => boolean
  /** The ND table's answer for now, said short, or null. */
  exposure: string | null
  record: boolean
  tick: number
}
