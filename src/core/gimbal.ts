/*
 * HOW THE PREVIEW'S CAMERA MOVES: like a gimbal, not a mouse.
 *
 * EASING. A drone move starts and stops gently: the speed ramps up over the
 * first RAMP_S seconds and down over the last, smoothly (a smoothstep in
 * speed), and is steady between. The move still takes its planned time and
 * covers its planned path: `easedTime` remaps the clock, so the path itself is
 * untouched. The ramp's speed is v(u) = 3u^2 - 2u^3 of the steady speed; its
 * distance in closed form is u^3 - u^4 / 2 of a ramp's length, checked in the
 * tests against summing the speed in small steps.
 *
 * DRIFT. A real gimbal holds within a fraction of a degree, never perfectly:
 * two slow sines, deterministic, never more than DRIFT_DEG either way.
 *
 * MOTION BLUR. Each 30 fps frame averages SUBFRAMES renders spread over half
 * the frame time (a 180 degree shutter, as a cinema camera).
 */
export const RAMP_S = 1.5
export const DRIFT_DEG = 0.25
export const FPS = 30
export const SUBFRAMES = 4
export const SHUTTER = 0.5

/** Distance covered by a smoothstep speed ramp from 0 to u (0..1), in units of the ramp's length at full speed. */
const rampDistance = (u: number): number => u ** 3 - u ** 4 / 2

/** The move's clock eased at both ends: t in 0..T gives the planned time to show, also 0..T. */
export function easedTime(t: number, total: number, ramp = RAMP_S): number {
  if (total <= 0) return 0
  const r = Math.min(ramp, total / 2)
  if (r <= 0) return Math.min(total, Math.max(0, t))
  /* Steady speed so that the whole covers `total`: two ramps of r/2 each and the middle. */
  const v = total / (total - r)
  const x = Math.min(total, Math.max(0, t))
  if (x < r) return v * r * rampDistance(x / r)
  if (x > total - r) return total - v * r * rampDistance((total - x) / r)
  return v * (r / 2 + (x - r))
}

/** The eased speed relative to the planned one, for the check: 0 at the ends. */
export function easedSpeed(t: number, total: number, ramp = RAMP_S): number {
  const r = Math.min(ramp, total / 2)
  const v = total / (total - r)
  const x = Math.min(total, Math.max(0, t))
  const s = (u: number) => 3 * u * u - 2 * u ** 3
  if (x < r) return v * s(x / r)
  if (x > total - r) return v * s((total - x) / r)
  return v
}

/** A gimbal's small wander, degrees of yaw and pitch, at t seconds. */
export function drift(t: number): { yaw: number; pitch: number } {
  const w = (a: number, b: number, phase: number) => ((Math.sin(2 * Math.PI * a * t + phase) + 0.5 * Math.sin(2 * Math.PI * b * t + 2 * phase)) / 1.5) * DRIFT_DEG
  return { yaw: w(0.13, 0.31, 0.4), pitch: w(0.17, 0.23, 1.9) }
}

/** Times of each frame of a move `total` seconds long at FPS. */
export function frameTimes(total: number, fps = FPS): number[] {
  const n = Math.max(1, Math.round(total * fps))
  return Array.from({ length: n + 1 }, (_, i) => Math.min(total, i / fps))
}

/** The instants one frame at `t` averages for its motion blur: spread over the shutter's open time after it. */
export function subframeTimes(t: number, total: number, fps = FPS, n = SUBFRAMES, shutter = SHUTTER): number[] {
  return Array.from({ length: n }, (_, i) => Math.min(total, t + ((i + 0.5) / n) * (shutter / fps)))
}
