/*
 * Cloud along the sightline, not cloud overhead.
 *
 * WHY TOTAL CLOUD COVER IS USELESS HERE. A forecast saying "60% cloud" is a
 * statement about the column of sky above one point. For a low sun shot, what
 * decides whether the light arrives is cloud along the line the camera is
 * looking down, tens of kilometres away, near the horizon. A venue can sit under
 * clear sky and still lose every low angle to a bank of cloud 40km downrange.
 *
 * So this samples the sky ALONG THE BEARING from each position toward its
 * subject, at increasing distances, and keeps the three layers apart. Low cloud
 * is reported separately because it is the layer that actually blocks a low sun:
 * high cirrus at 8km diffuses light, low stratus at 1km removes it.
 *
 * Arithmetic only. Sample points, layer aggregation, and the verdict are computed
 * here and tested. The network call lives in src/lib/forecast.ts, and no model is
 * involved at any point: a language model asked about tomorrow's cloud is
 * guessing, and a guess dressed as a forecast is exactly the kind of plausible
 * fiction this project refuses to produce.
 */

import { destinationPoint, type LatLon } from './geo.ts'

/**
 * How far downrange to look, in kilometres.
 *
 * Open-Meteo serves a gridded model whose cells are several kilometres across, so
 * samples closer together than that return the same cell and say nothing new.
 * These five span the distance range where cloud actually affects a long lens
 * sightline, and are far enough apart to land in genuinely different cells.
 */
export const SAMPLE_DISTANCES_KM = [10, 20, 40, 60, 80] as const

export interface CloudSamplePoint {
  distanceKm: number
  at: LatLon
}

/** The points to ask about: along `bearing` from `from`, at each distance. */
export function sightlineSamplePoints(from: LatLon, bearing: number): CloudSamplePoint[] {
  return SAMPLE_DISTANCES_KM.map((distanceKm) => ({
    distanceKm,
    at: destinationPoint(from, bearing, distanceKm * 1000),
  }))
}

/*
 * One sample's three layers, each 0 to 100 percent, OR NULL.
 *
 * MISSING IS NOT ZERO. These used to be plain numbers, with the reader
 * returning 0 for an absent value, which reads as "clear sky": the most
 * optimistic lie available about a shoot, synthesised out of an absence. Same
 * mistake as a coordinate falling back to Null Island and a drone's slant
 * range reading 0m. Null travels all the way through to the verdict, which has
 * a variant for not knowing.
 */
export interface CloudLayers {
  low: number | null
  mid: number | null
  high: number | null
}

export interface CloudSample extends CloudLayers {
  distanceKm: number
}

/**
 * What the sightline looks like overall.
 *
 * `worstLow` rather than an average, because one solid bank at 40km ruins the
 * shot regardless of how clear the other four samples are. Averaging would hide
 * exactly the thing worth knowing.
 */
export interface SightlineCloud {
  samples: CloudSample[]
  /** Null when no sample reported a low layer at all. */
  worstLow: number | null
  worstLowAtKm: number | null
  meanLow: number | null
  meanMid: number | null
  meanHigh: number | null
  verdict: CloudVerdict
}

/**
 * The reading, in the terms a shooter cares about.
 *
 * These thresholds are judgement about light, not meteorology, which is why they
 * are named here rather than buried in a component.
 */
export type CloudVerdict =
  | 'clear sightline'
  | 'thin high cloud, soft light'
  | 'broken low cloud, light will come and go'
  | 'low cloud blocks the sightline'
  /*
   * NOT AN ERROR AND NOT A CLEAR SKY. The forecast did not say, which is a
   * third thing, and it used to be reported as the second: an empty sample set
   * returned 'clear sightline', and a missing percentage became 0.
   */
  | 'no cloud forecast for this sightline'

export const LOW_CLOUD_BLOCKS = 70
export const LOW_CLOUD_BROKEN = 30
export const HIGH_CLOUD_DIFFUSES = 40

export function cloudVerdict(layers: {
  worstLow: number | null
  meanHigh: number | null
  meanMid: number | null
}): CloudVerdict {
  /*
   * THE LOW LAYER DECIDES, so without it there is no verdict. A reading for
   * the high layer alone cannot say the sightline is clear, because low cloud
   * is the thing that removes a low sun and that is exactly what is unknown.
   */
  if (layers.worstLow === null) return 'no cloud forecast for this sightline'
  if (layers.worstLow >= LOW_CLOUD_BLOCKS) return 'low cloud blocks the sightline'
  if (layers.worstLow >= LOW_CLOUD_BROKEN) return 'broken low cloud, light will come and go'
  if (
    (layers.meanHigh ?? 0) >= HIGH_CLOUD_DIFFUSES ||
    (layers.meanMid ?? 0) >= HIGH_CLOUD_DIFFUSES
  ) {
    return 'thin high cloud, soft light'
  }
  return 'clear sightline'
}

/**
 * The mean of what is actually there.
 *
 * Nulls are skipped rather than counted as zero, and all-null is null rather
 * than zero: the average of nothing is not clear sky.
 */
const mean = (values: (number | null)[]): number | null => {
  const known = values.filter((v): v is number => v !== null)
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0) / known.length
}

export function summariseSightline(samples: CloudSample[]): SightlineCloud {
  /*
   * NO SAMPLES IS NOT A CLEAR SIGHTLINE. This used to return worstLow 0 and
   * 'clear sightline', which is a confident forecast built from nothing at all.
   */
  const withLow = samples.filter((s): s is CloudSample & { low: number } => s.low !== null)
  const meanMid = mean(samples.map((s) => s.mid))
  const meanHigh = mean(samples.map((s) => s.high))

  if (withLow.length === 0) {
    return {
      samples,
      worstLow: null,
      worstLowAtKm: null,
      meanLow: null,
      meanMid,
      meanHigh,
      verdict: cloudVerdict({ worstLow: null, meanHigh, meanMid }),
    }
  }

  const worst = withLow.reduce((a, b) => (b.low > a.low ? b : a))

  return {
    samples,
    worstLow: worst.low,
    worstLowAtKm: worst.distanceKm,
    meanLow: mean(samples.map((s) => s.low)),
    meanMid,
    meanHigh,
    verdict: cloudVerdict({ worstLow: worst.low, meanHigh, meanMid }),
  }
}
