/*
 * FLY IT YOURSELF: A FLIGHT MODEL THAT APPROXIMATES THE AIR 3S. NOT A PHYSICS
 * SIMULATOR (said in About): it moves a point the way the sticks ask, at the
 * speeds the drone is capable of, easing in and out, and stops where the real
 * one would be stopped by the ceiling you set or by what the scan has in the
 * way.
 *
 * Mode 2 sticks, each axis -1..1: left x = yaw, left y = climb, right x =
 * sideways, right y = forward. Speeds per mode: DJI publishes the Air 3S's top
 * horizontal speed, 21 m/s, and its climb and descent, 10 m/s each
 * (dji.com/air-3s/specs); it does not publish per-mode figures, so Cine and
 * Normal below are this app's assumptions, said as such on screen and
 * editable. Acceleration and yaw rate are assumptions too.
 */
import { AIR3S } from './flight.ts'

export type FlyMode = 'cine' | 'normal' | 'sport'

export interface ModeLimits {
  speedMps: number
  climbMps: number
  yawDegS: number
  /** Whether DJI publishes this figure (sport's top speed, the climb) or it is assumed. */
  published: boolean
}

export const MODES: Record<FlyMode, ModeLimits> = {
  cine: { speedMps: 5, climbMps: 3, yawDegS: 30, published: false },
  normal: { speedMps: 12, climbMps: 6, yawDegS: 60, published: false },
  sport: { speedMps: AIR3S.maxSpeedMps, climbMps: AIR3S.maxClimbMps, yawDegS: 120, published: true },
}

/* Assumed: how quickly the speed follows the stick, m/s², up and down. */
export const ACCEL = 4
export const BRAKE = 7
/* Assumed: the share of the wind the drone fails to hold against (it holds position by GPS). */
export const DRIFT_SHARE = 0.08
/* Never closer than this to a roof or tree under it. */
export const SKIN_M = 1.5

export interface FlyState {
  /** Metres east and north of the takeoff point. */
  x: number
  y: number
  /** Metres above the takeoff point. */
  alt: number
  /** Degrees clockwise from north. */
  yaw: number
  vx: number
  vy: number
  vz: number
  /** Gimbal tilt, degrees, -90 (down) to 60 (up), as the Air 3S. */
  gimbal: number
  /** What stopped it last step, for the HUD: 'ceiling', 'obstacle' or null. */
  held: 'ceiling' | 'obstacle' | null
}

export interface Sticks {
  yaw: number
  climb: number
  side: number
  forward: number
  /** Gimbal wheel, degrees per second. */
  tilt: number
}

export interface FlyEnv {
  mode: FlyMode
  /** Metres above takeoff: the lower of the grid ceiling and your approved one. */
  ceilingM: number
  /** Top of whatever stands at (x, y), metres above takeoff, or null where unknown. */
  surfaceAt: (x: number, y: number) => number | null
  /** The wind at the drone's height: where it comes from, and its speed. */
  wind: { fromDeg: number; mps: number } | null
}

export const START: FlyState = { x: 0, y: 0, alt: 0, yaw: 0, vx: 0, vy: 0, vz: 0, gimbal: -20, held: null }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const toward = (v: number, target: number, dt: number) => {
  const rate = Math.abs(target) > Math.abs(v) && Math.sign(target) === Math.sign(v || target) ? ACCEL : BRAKE
  const d = target - v
  return Math.abs(d) <= rate * dt ? target : v + Math.sign(d) * rate * dt
}

export function step(s: FlyState, sticks: Sticks, env: FlyEnv, dt: number): FlyState {
  const lim = MODES[env.mode]
  const yaw = (((s.yaw + sticks.yaw * lim.yawDegS * dt) % 360) + 360) % 360
  const r = (yaw * Math.PI) / 180
  /* The stick asks for a velocity in the drone's own frame, turned to east and north. */
  const fwd = clamp(sticks.forward, -1, 1) * lim.speedMps
  const side = clamp(sticks.side, -1, 1) * lim.speedMps
  let tx = fwd * Math.sin(r) + side * Math.cos(r)
  let ty = fwd * Math.cos(r) - side * Math.sin(r)
  const speed = Math.hypot(tx, ty)
  if (speed > lim.speedMps) {
    tx *= lim.speedMps / speed
    ty *= lim.speedMps / speed
  }
  const vx = toward(s.vx, tx, dt)
  const vy = toward(s.vy, ty, dt)
  const vz = toward(s.vz, clamp(sticks.climb, -1, 1) * lim.climbMps, dt)
  /* The wind pushes a little, toward where it blows. */
  const wx = env.wind === null ? 0 : -Math.sin((env.wind.fromDeg * Math.PI) / 180) * env.wind.mps * DRIFT_SHARE
  const wy = env.wind === null ? 0 : -Math.cos((env.wind.fromDeg * Math.PI) / 180) * env.wind.mps * DRIFT_SHARE
  let x = s.x + (vx + wx) * dt
  let y = s.y + (vy + wy) * dt
  let alt = s.alt + vz * dt
  let held: FlyState['held'] = null
  if (alt > env.ceilingM) {
    alt = env.ceilingM
    held = 'ceiling'
  }
  /* The scan in the way: not into it, not through it. */
  const top = env.surfaceAt(x, y)
  if (top !== null && alt < top + SKIN_M) {
    const was = env.surfaceAt(s.x, s.y)
    if (was !== null && s.alt < was + SKIN_M + 0.01) {
      alt = Math.max(alt, top + SKIN_M)
    } else {
      x = s.x
      y = s.y
      alt = Math.max(s.alt, alt)
    }
    held = 'obstacle'
  }
  alt = Math.max(0, alt)
  const gimbal = clamp(s.gimbal + sticks.tilt * dt, -90, 60)
  return { x, y, alt, yaw, vx: held === 'obstacle' ? 0 : vx, vy: held === 'obstacle' ? 0 : vy, vz: held === 'ceiling' ? Math.min(0, vz) : vz, gimbal, held }
}

/* The HUD's obstacle bars: the clearance, metres, in front, behind, left, right and below, within `reach`. */
export function obstacleBars(s: FlyState, env: FlyEnv, reach = 30): Record<'front' | 'back' | 'left' | 'right' | 'below', number | null> {
  const under = env.surfaceAt(s.x, s.y)
  /* On the ground, the ground all round is not an obstacle: the bars wake once it is airborne. */
  if (s.alt < 2 * SKIN_M) return { front: null, back: null, left: null, right: null, below: under === null ? null : Math.max(0, s.alt - under) }
  const r = (s.yaw * Math.PI) / 180
  const look = (dx: number, dy: number) => {
    for (let d = 1; d <= reach; d += 1) {
      const top = env.surfaceAt(s.x + dx * d, s.y + dy * d)
      if (top !== null && top >= s.alt - SKIN_M) return d
    }
    return null
  }
  const f = [Math.sin(r), Math.cos(r)]
  const right = [Math.cos(r), -Math.sin(r)]
  return {
    front: look(f[0], f[1]),
    back: look(-f[0], -f[1]),
    right: look(right[0], right[1]),
    left: look(-right[0], -right[1]),
    below: under === null ? null : Math.max(0, s.alt - under),
  }
}
