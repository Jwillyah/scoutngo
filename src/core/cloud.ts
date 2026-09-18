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

/** One sample's three layers, each 0 to 100 percent. */
export interface CloudLayers {
  low: number
  mid: number
  high: number
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
  worstLow: number
  worstLowAtKm: number | null
  meanLow: number
  meanMid: number
  meanHigh: number
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

export const LOW_CLOUD_BLOCKS = 70
export const LOW_CLOUD_BROKEN = 30
export const HIGH_CLOUD_DIFFUSES = 40

export function cloudVerdict(layers: {
  worstLow: number
  meanHigh: number
  meanMid: number
}): CloudVerdict {
  if (layers.worstLow >= LOW_CLOUD_BLOCKS) return 'low cloud blocks the sightline'
  if (layers.worstLow >= LOW_CLOUD_BROKEN) return 'broken low cloud, light will come and go'
  if (layers.meanHigh >= HIGH_CLOUD_DIFFUSES || layers.meanMid >= HIGH_CLOUD_DIFFUSES) {
    return 'thin high cloud, soft light'
  }
  return 'clear sightline'
}

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length

export function summariseSightline(samples: CloudSample[]): SightlineCloud {
  if (samples.length === 0) {
    return {
      samples,
      worstLow: 0,
      worstLowAtKm: null,
      meanLow: 0,
      meanMid: 0,
      meanHigh: 0,
      verdict: 'clear sightline',
    }
  }

  const worst = samples.reduce((a, b) => (b.low > a.low ? b : a))
  const meanMid = mean(samples.map((s) => s.mid))
  const meanHigh = mean(samples.map((s) => s.high))

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
