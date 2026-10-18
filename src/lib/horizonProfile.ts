/*
 * THE SKYLINE ALL THE WAY ROUND, FROM THE DEM THAT IS ALREADY LOADED.
 *
 * This is the seam src/core/horizon.ts named and deliberately did not build:
 * that file answers ONE bearing at one moment, which is what putting a sun on
 * screen needs. A sky window needs the whole circle, because a radiant moves
 * across many bearings between rising and dawn and the ridge is a different
 * height at each of them.
 *
 * NO NETWORK. queryTerrainElevation answers from the terrain tiles MapLibre
 * already has in memory for the 3D render. If terrain is off, or the DEM has
 * no answer here, this returns a FLAT horizon and says so in the kind, and
 * skyWindow prints that word on screen. There is no third state where the app
 * uses a flat horizon while implying a real one.
 *
 * THE COST, STATED. 24 bearings by 12 distances is 288 lookups against tiles
 * already in memory, done once per venue rather than per frame. It is not on
 * any render path and must not be put on one.
 */

import { destinationPoint, type LatLon } from '../core/geo.ts'
import { horizonAngleDegrees, SAMPLE_DISTANCES_METERS } from '../core/horizon.ts'
import type { HorizonInput, HorizonSample } from '../core/skyWindow.ts'

/**
 * Every 15 degrees.
 *
 * Finer than the 22.5 of a compass rose because a notch in a ridge is the
 * thing that lets a radiant out early, and coarser than 10 because the DEM
 * under this is 30 m and pretending to more direction than that is pretending.
 */
export const HORIZON_BEARING_STEP = 15

export interface TerrainReader {
  queryTerrainElevation(at: [number, number]): number | null
  getTerrain(): unknown
}

/**
 * The horizon profile at a venue, or a flat horizon with the reason implicit
 * in the kind.
 *
 * RETURNS 'flat' RATHER THAN THROWING OR GUESSING. The three ways this can
 * fail -- terrain off, no venue, DEM silent at the observer -- all produce a
 * horizon the caller can still compute with, labelled honestly. skyWindow
 * refuses only the fourth case, where terrain was claimed and no samples came.
 */
export function readHorizonProfile(map: TerrainReader, venue: LatLon | null): HorizonInput {
  if (venue === null) return { kind: 'flat' }
  const terrain = map.getTerrain()
  if (terrain === null || terrain === undefined) return { kind: 'flat' }

  const observer = map.queryTerrainElevation([venue.lon, venue.lat])
  if (observer === null) return { kind: 'flat' }

  const samples: HorizonSample[] = []
  for (let azimuth = 0; azimuth < 360; azimuth += HORIZON_BEARING_STEP) {
    const along = SAMPLE_DISTANCES_METERS.map((distanceMeters) => {
      const at = destinationPoint(venue, azimuth, distanceMeters)
      return { distanceMeters, elevationMeters: map.queryTerrainElevation([at.lon, at.lat]) }
    })
    const angle = horizonAngleDegrees(along, observer)
    /*
     * A BEARING THE DEM COULD NOT ANSWER IS LEFT OUT, not filled with zero. A
     * zero here would be a claim that the horizon is flat in that direction,
     * which is exactly the claim horizonAngleDegrees returns null to avoid.
     * horizonAngleAt then falls to the nearest direction that IS known.
     */
    if (angle !== null) samples.push({ azimuth, angleDegrees: angle })
  }

  if (samples.length === 0) return { kind: 'flat' }
  return { kind: 'terrain', samples }
}
