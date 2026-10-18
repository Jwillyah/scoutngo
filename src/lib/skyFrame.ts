import { destinationPoint, type LatLon } from '../core/geo.ts'
import {
  SAMPLE_DISTANCES_METERS,
  horizonAngleDegrees,
  sunVisibility,
  type SunVisibility,
} from '../core/horizon.ts'
import type { SkyCamera } from '../core/sunSky.ts'

/**
 * What the overlay needs from the map, read fresh on every camera change.
 *
 * A PLAIN SNAPSHOT rather than the map instance, so the component is a
 * function of numbers and the arithmetic lives in src/core.
 */
export interface SkyFrame extends SkyCamera {
  /** Where the sun is, computed, not guessed. */
  sunAzimuth: number
  sunAltitude: number
  /** What the terrain does along the sun's bearing, or unknown. */
  visibility: SunVisibility
}

/**
 * Read the camera and the terrain in one go.
 *
 * EXPORTED AND PURE-ISH so the probe can call it: the browser audit asserts
 * this against MapLibre's own projection rather than against a copy of the
 * arithmetic, which is the only way to know the camera model is right.
 */
export function readSkyFrame(
  map: {
    getBearing(): number
    getPitch(): number
    getVerticalFieldOfView(): number
    getCanvas(): { clientWidth: number; clientHeight: number }
    /* MapLibre types the sides as optional, so they are read defensively. */
    getPadding(): { top?: number; bottom?: number; left?: number; right?: number }
    queryTerrainElevation(at: [number, number]): number | null
    getTerrain(): unknown
  },
  venue: LatLon | null,
  sunAzimuth: number,
  sunAltitude: number,
): SkyFrame {
  const canvas = map.getCanvas()
  const camera: SkyCamera = {
    bearing: map.getBearing(),
    pitch: map.getPitch(),
    fovDegrees: map.getVerticalFieldOfView(),
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    /* The sheet pads the map, which moves the optical axis. See SkyCamera. */
    padding: (() => {
      const p = map.getPadding()
      return {
        top: p.top ?? 0,
        bottom: p.bottom ?? 0,
        left: p.left ?? 0,
        right: p.right ?? 0,
      }
    })(),
  }

  /*
   * THE RIDGE, SAMPLED ALONG THE SUN'S OWN BEARING.
   *
   * Only when terrain is on, because without a DEM loaded
   * queryTerrainElevation answers null everywhere and the honest result is
   * 'unknown' rather than a flat horizon. See src/core/horizon.ts.
   */
  let visibility: SunVisibility = 'unknown'
  if (venue !== null && map.getTerrain() !== null && map.getTerrain() !== undefined) {
    const observer = map.queryTerrainElevation([venue.lon, venue.lat])
    const samples = SAMPLE_DISTANCES_METERS.map((distanceMeters) => {
      const at = destinationPoint(venue, sunAzimuth, distanceMeters)
      return { distanceMeters, elevationMeters: map.queryTerrainElevation([at.lon, at.lat]) }
    })
    visibility = sunVisibility(sunAltitude, horizonAngleDegrees(samples, observer))
  }

  return { ...camera, sunAzimuth, sunAltitude, visibility }
}

