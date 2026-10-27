import { useEffect, useRef, useState } from 'react'
import { EYE_M, FT, type PathPoint } from '../../core/flight.ts'
import { destinationPoint, distanceMeters, type LatLon } from '../../core/geo.ts'
import { START, step, type FlyEnv, type FlyMode, type FlyState, type Sticks } from '../../core/flyModel.ts'

/*
 * FLYING IT YOURSELF: the loop. Sticks from the screen (refs the Stick
 * controls write) or a Bluetooth game controller (the Gamepad API: axes 0-3,
 * Mode 2), the model stepped every frame (src/core/flyModel.ts), the camera
 * put where the drone is, line of sight checked four times a second, and the
 * track recorded every half second so it becomes a plan with a flight card.
 */
export const NO_STICKS: Sticks = { yaw: 0, climb: 0, side: 0, forward: 0, tilt: 0 }
const DEAD = 0.08

export interface FlyHud {
  state: FlyState
  at: LatLon
  /** Metres from the pilot, on the ground. */
  distanceM: number
  speedMps: number
  /** Seconds flown. */
  t: number
  hidden: boolean
  nearCeiling: boolean
}

export interface FlyOptions {
  takeoff: LatLon
  /** Ground metres at takeoff (the drone's height is above this). */
  groundM: number
  env: Omit<FlyEnv, 'surfaceAt'> & { surfaceAbsAt: (at: LatLon) => number | null }
  /** Puts the 3D camera at the drone: lat, lon, metres absolute, yaw, gimbal. */
  view: (at: LatLon, altAbsM: number, yaw: number, gimbal: number) => void
  /** Whether the drone at `at`, altitude above takeoff, is hidden from the pilot's eye. */
  hiddenAt: (at: LatLon, ftAboveTakeoff: number) => boolean
  sticks: React.MutableRefObject<Sticks>
  mode: FlyMode
}

export function useFly(active: boolean, opts: FlyOptions) {
  const [hud, setHud] = useState<FlyHud | null>(null)
  const track = useRef<PathPoint[]>([])
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  useEffect(() => {
    if (!active) return
    let s: FlyState = START
    let t = 0
    let last = performance.now()
    let nextLos = 0
    let nextRec = 0
    let hidden = false
    let raf = 0
    track.current = []
    const frame = (now: number) => {
      const o = optsRef.current
      /* A slow frame (a busy phone) is still a fair step: up to a quarter second at once. */
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      t += dt
      let sticks = o.sticks.current
      const pad = typeof navigator.getGamepads === 'function' ? [...navigator.getGamepads()].find((g) => g !== null) : undefined
      if (pad != null && pad.axes.length >= 4) {
        const ax = (i: number) => (Math.abs(pad.axes[i]) < DEAD ? 0 : pad.axes[i])
        sticks = { yaw: ax(0), climb: -ax(1), side: ax(2), forward: -ax(3), tilt: (pad.buttons[7]?.value ?? 0) * 30 - (pad.buttons[6]?.value ?? 0) * 30 }
      }
      const env: FlyEnv = {
        mode: o.mode,
        ceilingM: o.env.ceilingM,
        wind: o.env.wind,
        surfaceAt: (x, y) => {
          const at = destinationPoint(destinationPoint(o.takeoff, 90, x), 0, y)
          const abs = o.env.surfaceAbsAt(at)
          return abs === null ? null : abs - o.groundM
        },
      }
      s = step(s, sticks, env, dt)
      const at = destinationPoint(destinationPoint(o.takeoff, 90, s.x), 0, s.y)
      o.view(at, o.groundM + s.alt, s.yaw, s.gimbal)
      if (t >= nextLos) {
        nextLos = t + 0.25
        const now2 = s.alt > EYE_M && o.hiddenAt(at, s.alt / FT)
        if (now2 && !hidden && typeof navigator.vibrate === 'function') navigator.vibrate(120)
        hidden = now2
      }
      if (t >= nextRec) {
        nextRec = t + 0.5
        track.current.push({ t, at, ft: s.alt / FT, askedFt: s.alt / FT })
        setHud({ state: s, at, distanceM: distanceMeters(o.takeoff, at), speedMps: Math.hypot(s.vx, s.vy), t, hidden, nearCeiling: o.env.ceilingM - s.alt < 10 })
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [active])

  return { hud: active ? hud : null, track }
}
