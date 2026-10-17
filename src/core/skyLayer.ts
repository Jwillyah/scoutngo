import { GRID_CELLS, GRID_HALF_SPAN_METERS } from './cloudGrid.ts'

/**
 * WHAT THE SKY LAYER IS SHOWING.
 *
 * WHAT WAS ASKED FOR. "Let me choose what the layer shows: cloud, wind, and
 * whatever else Open-Meteo already gives us for free. One picker, same place.
 * Wind especially, since it decides whether I fly."
 *
 * TWO TO START, AND BOTH EARN IT. Cloud decides whether there is light; wind
 * decides whether the aircraft leaves the bag. Everything else Open-Meteo
 * serves for free is either already on the Conditions panel as a number, where
 * it is more useful than as a tint, or is not a field: temperature and
 * pressure do not vary meaningfully across 150 km of coast, so a map of them
 * would be one flat colour pretending to be information.
 *
 * THE TWO HAVE DIFFERENT SOURCES AND THE DIFFERENCE IS NOT COSMETIC.
 *
 *   CLOUD has a photograph. GOES-19 observes it, so past and now are a real
 *   picture and only the future is a model.
 *
 *   WIND HAS NO PHOTOGRAPH, at any time. There is no satellite image of wind
 *   at 200 feet; every value is a model run, including the one for an hour
 *   that has already happened. So the wind layer is always labelled a
 *   forecast, and it never borrows the word "observed" from the layer beside
 *   it. See src/core/skyTime.ts for the same rule applied to time.
 */
export type SkyLayerKind = 'cloud' | 'wind'

export const SKY_LAYERS: readonly SkyLayerKind[] = ['cloud', 'wind'] as const

export const SKY_LAYER_LABEL: Record<SkyLayerKind, string> = {
  cloud: 'Cloud',
  wind: 'Wind',
}

export const SKY_LAYER_NOTE: Record<SkyLayerKind, string> = {
  cloud:
    'How much of the sky is covered. Observed by GOES-19 for now and the past, modelled after that.',
  wind:
    'Wind at the height you are flying, from the Open-Meteo model. There is no satellite picture of wind, so every hour of this is a model, including the ones already past.',
}

/** Whether this layer can ever be a photograph rather than a model. */
export function hasSatellite(kind: SkyLayerKind): boolean {
  return kind === 'cloud'
}

/**
 * HOW WINDY A CELL IS, against the aircraft's own published rating.
 *
 * FOUR BANDS, AND THE BOUNDARIES COME FROM THE AIRCRAFT rather than from a
 * general idea of windy. A 249 g sub-250 machine and an Air 3S do not meet the
 * same air in the same state, and the only honest reference is what the
 * manufacturer published for the one that is coming.
 *
 * WITH NO RATING THERE ARE NO BANDS. Null in, null out: an invented wind limit
 * is something somebody could fly on. The layer then still draws, by speed
 * alone, and the key says it is not measured against anything.
 */
export type WindBand = 'calm' | 'workable' | 'near-limit' | 'over'

export function windBand(speedMps: number | null, ratedMps: number | null): WindBand | null {
  if (speedMps === null) return null
  if (ratedMps === null || ratedMps <= 0) return null
  const share = speedMps / ratedMps
  if (share < 0.4) return 'calm'
  if (share < 0.75) return 'workable'
  if (share < 1) return 'near-limit'
  return 'over'
}

export const WIND_BAND_LABEL: Record<WindBand, string> = {
  calm: 'calm',
  workable: 'workable',
  'near-limit': 'near the limit',
  over: 'over the rating',
}

/**
 * HOW BIG THE FORECAST GRID IS, in words.
 *
 * WHAT WAS REPORTED. "At 50 mi the forecast cells cover a small square around
 * the venue with nothing around it, which reads as broken."
 *
 * It is not broken and it is not widenable to the horizon either: every cell
 * is a point queried from a model, and a grid that filled a continental view
 * would be thousands of requests for a layer nobody reads at that zoom. So it
 * stays the size it is and SAYS the size it is, which is the other half of the
 * instruction. A square that announces its own edges is a measurement; one
 * that does not is a bug.
 */
export function gridExtentLine(): string {
  const km = Math.round((GRID_HALF_SPAN_METERS * 2) / 1000)
  const miles = Math.round(km * 0.621371)
  return `${GRID_CELLS} by ${GRID_CELLS} model points, ${km} km across (${miles} mi), centred on the venue. Outside the square is not clear sky, it is simply not asked for.`
}
