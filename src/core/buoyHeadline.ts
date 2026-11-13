/*
 * THE BUOY'S HEADLINE AT THIS BEACH (Batch NOW, Section 2.3; 13 Nov: the
 * Buoys page led with 44099's 3.6 ft while the NW wind blew that chop out to
 * sea and the beach was flat, Surfline "Flat", ours 0-1).
 *
 * When the waves the buoy reads come from the land side of this beach (more
 * than 90° off the way it faces), they are wind chop blowing out to sea: the
 * page leads with what reaches the beach, the as-faces number ("≈ 0 ft
 * here"), and the buoy's own height is a row under it ("3.6 ft wind chop
 * blowing out to sea"). One comparison word for the Surf and Buoys pages:
 * "bigger than forecast", "smaller than forecast", or nothing when they are
 * within BUOY_MATCH_FT (src/core/surfRange.ts buoyVsForecast), as faces
 * against as faces.
 */
import { buoyVsForecast } from './surfRange.ts'

const apart = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180)

/** The waves come from behind the beach: blowing out to sea. */
export function blowingOut(waveFromDeg: number | null, facingDeg: number | null): boolean {
  return waveFromDeg !== null && facingDeg !== null && apart(waveFromDeg, facingDeg) > 90
}

/** "bigger than forecast" / "smaller than forecast", or null when in line: as faces against as faces, on both pages. */
export function forecastWord(faceFt: number | null, forecastFaceFt: number | null): 'bigger than forecast' | 'smaller than forecast' | null {
  if (faceFt === null || forecastFaceFt === null || !Number.isFinite(faceFt) || !Number.isFinite(forecastFaceFt)) return null
  const v = buoyVsForecast(faceFt, forecastFaceFt)
  return v === 'in line with' ? null : `${v} forecast` as 'bigger than forecast' | 'smaller than forecast'
}
