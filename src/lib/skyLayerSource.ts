import type { FeatureCollection } from 'geojson'
import { cellPolygon, type ForecastCell } from '../core/cloudGrid.ts'
import { windBand, type SkyLayerKind } from '../core/skyLayer.ts'
import { windAtHeight } from '../core/windProfile.ts'

/**
 * WHAT THE SKY LAYER DRAWS, as data rather than as paint.
 *
 * In lib rather than inside MapView so it can be asserted by value: the wind
 * layer silently drew nothing on its first run, and a function that lives
 * inside a WebGL component can only be debugged by looking at a map.
 *
 * A CELL THE MODEL DID NOT ANSWER FOR IS DROPPED, never drawn at zero. An
 * unshaded square reads as calm, and calm is the one answer that would get
 * somebody to fly.
 */
export function cloudForecastCollection(
  cells: readonly ForecastCell[],
  layer: SkyLayerKind,
  /** The height the wind is read at, for the wind layer. */
  windMeters: number,
  /** The aircraft's published rating, or null when none is known. */
  ratedMps: number | null,
): FeatureCollection {
  if (layer === 'wind') {
    return {
      type: 'FeatureCollection',
      features: cells
        /*
       * `?? []` because a cell can arrive without the field at all: a grid
       * cached earlier in the session, or any caller built before wind was
       * carried. windAtHeight throws on undefined, and a throw here aborts the
       * whole effect and leaves the layer empty with nothing said, which is
       * indistinguishable from a layer that does not work.
       */
      .map((cell) => ({ cell, speed: windAtHeight(cell.wind ?? [], windMeters).speedMps }))
        /*
         * A cell the model did not answer for is DROPPED, never drawn at zero.
         * An unshaded square reads as calm, and calm is the one answer that
         * would get somebody to fly.
         */
        .filter((entry) => entry.speed !== null)
        .map(({ cell, speed }) => ({
          type: 'Feature' as const,
          properties: {
            speed,
            /* Null band when there is no rating to measure against. */
            band: windBand(speed, ratedMps) ?? 'unrated',
          },
          geometry: { type: 'Polygon' as const, coordinates: cellPolygon(cell.at) },
        })),
    }
  }

  return {
    type: 'FeatureCollection',
    features: cells
      .filter((cell) => cell.cover !== null)
      .map((cell) => ({
        type: 'Feature' as const,
        properties: { cover: cell.cover },
        geometry: { type: 'Polygon' as const, coordinates: cellPolygon(cell.at) },
      })),
  }
}
