/*
 * WIND FROM FIVE MODELS: one number to read, and how far apart they are.
 *
 * Speed: the median of the models (one wild model cannot move it), and the
 * 10-90% range across them. Direction: the CIRCULAR mean of the directions,
 * because 350° and 10° average to north, not to south as their arithmetic
 * mean says. Gust: the highest any model gives.
 *
 * FROM AND TO. A wind direction is where the wind comes FROM (meteorology's
 * convention, and every model's): a north wind blows toward the south. An
 * arrow that shows the air moving points TO, the FROM bearing plus 180.
 * Both are named here so nothing has to remember which is which.
 */

const DEG = Math.PI / 180

/** Where the wind blows TO, for an arrow, from where it comes FROM. */
export const windTo = (fromDeg: number): number => (((fromDeg + 180) % 360) + 360) % 360

/** The circular mean of directions, degrees; null when they cancel out (no prevailing direction). */
export function circularMean(dirs: readonly number[]): number | null {
  if (dirs.length === 0) return null
  const x = dirs.reduce((s, d) => s + Math.cos(d * DEG), 0) / dirs.length
  const y = dirs.reduce((s, d) => s + Math.sin(d * DEG), 0) / dirs.length
  if (Math.hypot(x, y) < 0.1) return null
  return ((Math.atan2(y, x) / DEG) % 360 + 360) % 360
}

/** A quantile by linear interpolation between the sorted values (0-1). */
export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const at = (s.length - 1) * q
  const lo = Math.floor(at)
  const hi = Math.ceil(at)
  return s[lo] + (s[hi] - s[lo]) * (at - lo)
}

export interface WindHour {
  /** Median of the models' speeds, m/s. */
  median: number | null
  p10: number | null
  p90: number | null
  /** Circular mean FROM direction, degrees. */
  from: number | null
  /** Highest gust any model gives, m/s (ground level only). */
  gust: number | null
  /** How many models said anything. */
  models: number
}

const nums = (xs: readonly (number | null | undefined)[]): number[] => xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))

export function summarise(speeds: readonly (number | null)[], dirs: readonly (number | null)[], gusts: readonly (number | null)[] = []): WindHour {
  const s = nums(speeds)
  const g = nums(gusts)
  return {
    median: quantile(s, 0.5),
    p10: quantile(s, 0.1),
    p90: quantile(s, 0.9),
    from: circularMean(nums(dirs)),
    gust: g.length === 0 ? null : Math.max(...g),
    models: s.length,
  }
}

/** Whether a speed is over the drone's rated wind: said, never turned into "safe" the other way. */
export const overRated = (mps: number | null, ratedMps: number | null): boolean => mps !== null && ratedMps !== null && mps > ratedMps
