/*
 * THE TIME BAR, AS GEOMETRY.
 *
 * A strip of sky a few hours wide that slides under a fixed needle: the
 * needle is "now on the plan", the strip is time. Everything here is in the
 * strip's own pixels so the component only draws:
 *
 *   sun     the sun's height across the strip, as an SVG path
 *   moon    the same for the moon, when asked for
 *   bands   day, golden, blue and the three nights, as runs along the strip
 *   ticks   every 15 minutes, labelled on the hour in the venue's clock
 *   marks   where the sun (and moon) cross the horizon: rise and set
 *
 * Heights come from suncalc in this build's degrees, the same as the day
 * curve (sunPath.ts), and the bands use its calibrated thresholds, so the
 * golden band on this bar and on the day curve start at the same minute.
 */
import { getMoonPosition, getPosition } from 'suncalc'
import { band, BAND_THRESHOLDS, type SunBand } from './sunPath.ts'
import { formatClock } from './timezone.ts'

/** How much time the strip shows across its width. */
export const MINUTES_ACROSS = 360
/** The heights the strip's height spans, in degrees. */
export const ALTITUDE_RANGE: readonly [number, number] = [-30, 75]
/** The moon's horizon in this build: see HORIZON_ALTITUDE in alignment.ts. */
const MOON_HORIZON = 0.133
const STEP_MINUTES = 5
const MINUTE = 60_000

export interface TimeBarInput {
  at: Date
  width: number
  height: number
  lat: number
  lon: number
  timeZone: string
  moon: boolean
  minutesAcross?: number
}

export interface TimeBarModel {
  sunPath: string
  moonPath: string | null
  /** Where 0 degrees sits: the horizon line. */
  horizonY: number
  bands: { x0: number; x1: number; band: SunBand }[]
  ticks: { x: number; major: boolean; label: string | null }[]
  marks: { x: number; body: 'sun' | 'moon'; kind: 'rise' | 'set' }[]
}

export function timeBarModel(input: TimeBarInput): TimeBarModel {
  const across = input.minutesAcross ?? MINUTES_ACROSS
  const perMinute = input.width / across
  const x = (t: number) => input.width / 2 + ((t - input.at.getTime()) / MINUTE) * perMinute
  const [low, high] = ALTITUDE_RANGE
  const y = (alt: number) => {
    const clamped = Math.max(low, Math.min(high, alt))
    return input.height - ((clamped - low) / (high - low)) * input.height
  }

  /* Samples a step past each edge, so the curve runs off the strip rather than stopping short. */
  const from = input.at.getTime() - (across / 2 + STEP_MINUTES) * MINUTE
  const to = input.at.getTime() + (across / 2 + STEP_MINUTES) * MINUTE
  const samples: { t: number; sun: number; moon: number }[] = []
  for (let t = Math.floor(from / (STEP_MINUTES * MINUTE)) * STEP_MINUTES * MINUTE; t <= to; t += STEP_MINUTES * MINUTE) {
    const at = new Date(t)
    samples.push({ t, sun: getPosition(at, input.lat, input.lon).altitude, moon: getMoonPosition(at, input.lat, input.lon).altitude })
  }

  const path = (pick: (s: (typeof samples)[number]) => number) =>
    samples.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.t).toFixed(1)},${y(pick(s)).toFixed(1)}`).join('')

  const bands: TimeBarModel['bands'] = []
  for (let i = 0; i < samples.length - 1; i += 1) {
    const b = band(samples[i].sun)
    const x0 = x(samples[i].t)
    const x1 = x(samples[i + 1].t)
    const last = bands[bands.length - 1]
    if (last !== undefined && last.band === b) last.x1 = x1
    else bands.push({ x0, x1, band: b })
  }

  const marks: TimeBarModel['marks'] = []
  const crossings = (body: 'sun' | 'moon', pick: (s: (typeof samples)[number]) => number, horizon: number) => {
    for (let i = 0; i < samples.length - 1; i += 1) {
      const a = pick(samples[i]) - horizon
      const b = pick(samples[i + 1]) - horizon
      if (a === b || (a < 0) === (b < 0)) continue
      const share = a / (a - b)
      const t = samples[i].t + share * (samples[i + 1].t - samples[i].t)
      marks.push({ x: x(t), body, kind: a < 0 ? 'rise' : 'set' })
    }
  }
  crossings('sun', (s) => s.sun, BAND_THRESHOLDS.horizon)
  if (input.moon) crossings('moon', (s) => s.moon, MOON_HORIZON)

  const ticks: TimeBarModel['ticks'] = []
  const quarter = 15 * MINUTE
  for (let t = Math.ceil(from / quarter) * quarter; t <= to; t += quarter) {
    const label = formatClock(new Date(t), input.timeZone)
    const major = label.endsWith(':00')
    ticks.push({ x: x(t), major, label: major ? label : null })
  }

  return {
    sunPath: path((s) => s.sun),
    moonPath: input.moon ? path((s) => s.moon) : null,
    horizonY: y(0),
    bands,
    ticks,
    marks,
  }
}

/** Dragging the strip by some pixels moves the needle's time by this many minutes. */
export function minutesForDrag(dx: number, width: number, minutesAcross: number = MINUTES_ACROSS): number {
  return -(dx / width) * minutesAcross
}
