/*
 * COLOR ABOVE THE FOG, INLAND (Batch SIMPLE-3, Section 1.3). When the one sky
 * call dropped a beach's call for sea fog (src/core/fogRisk.ts fogSkyCall,
 * line "Color above the fog inland"), Best spot near me puts the spots away
 * from the water first: a sea fog bank lies along the beach (23 Nov 4:30 PM:
 * the beach fogged in, inland "kinda fired"). Within each group the ranking
 * is the list's own (src/core/bestSky.ts rankSpots), unchanged. Nothing here
 * knows a spot's height, so "elevated" is not claimed: inland is.
 */
import type { RankedSpot } from './bestSky.ts'

/** Inland: no water in front and no beach facing. */
export const isInland = (r: Pick<RankedSpot, 'spot'>): boolean => !r.spot.water && r.spot.facing === null

/** The ranking with the inland spots first when the fog line shows; as it was otherwise. */
export function inlandFirst<T extends Pick<RankedSpot, 'spot'>>(ranked: readonly T[], aboveFog: boolean): T[] {
  if (!aboveFog) return [...ranked]
  return [...ranked.filter(isInland), ...ranked.filter((r) => !isInland(r))]
}
