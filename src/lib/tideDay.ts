/*
 * THE TIDE SHEET'S DAY CURVE, AS GEOMETRY: the water level across one venue
 * day, the high and low marks, and the sun's bands behind it (the time bar's
 * own band(), so the gold here and the gold on the bar start together).
 * Everything in the drawing's own pixels; the component only draws.
 */
import { getPosition } from 'suncalc'
import { band, BAND_THRESHOLDS, type SunBand } from '../core/sunPath.ts'
import { levelAt, type TideExtreme, type TideSample } from '../core/tide.ts'
import { zonedTimeToUtc } from '../core/timezone.ts'

export interface TideDayModel {
  from: number
  to: number
  path: string
  marks: { x: number; y: number; kind: 'high' | 'low'; at: Date; feet: number }[]
  bands: { x0: number; x1: number; band: SunBand }[]
  /** Where the sun crosses the horizon (the time bar's calibrated horizon), when it does that day. */
  sun: { x: number; at: Date; kind: 'rise' | 'set' }[]
  /** Feet at the bottom and top of the drawing. */
  lowFeet: number
  highFeet: number
  xOf: (t: number) => number
  tOf: (x: number) => number
  yOf: (feet: number) => number
}

const STEP = 5 * 60_000

export function tideDayModel(input: {
  date: string
  timeZone: string
  curve: TideSample[]
  extremes: TideExtreme[]
  lat: number
  lon: number
  width: number
  height: number
}): TideDayModel | null {
  const start = zonedTimeToUtc(input.date, '00:00', input.timeZone)
  if (start === null) return null
  const from = start.getTime()
  const to = from + 86_400_000
  const xOf = (t: number) => ((t - from) / (to - from)) * input.width
  const tOf = (x: number) => from + (x / input.width) * (to - from)
  const samples: { t: number; feet: number }[] = []
  for (let t = from; t <= to; t += STEP) {
    const f = levelAt(input.curve, new Date(t))
    if (f !== null) samples.push({ t, feet: f })
  }
  if (samples.length < 2) return null
  const feet = samples.map((s) => s.feet)
  const lowFeet = Math.floor(Math.min(...feet, 0))
  const highFeet = Math.ceil(Math.max(...feet))
  const pad = 14
  const yOf = (f: number) => pad + (1 - (f - lowFeet) / Math.max(1, highFeet - lowFeet)) * (input.height - 2 * pad)
  const path = samples.map((s, i) => `${i === 0 ? 'M' : 'L'}${xOf(s.t).toFixed(1)},${yOf(s.feet).toFixed(1)}`).join('')
  const marks = input.extremes
    .filter((e) => e.at.getTime() >= from && e.at.getTime() <= to)
    .map((e) => ({ x: xOf(e.at.getTime()), y: yOf(e.feet), kind: e.kind, at: e.at, feet: e.feet }))
  const bands: TideDayModel['bands'] = []
  for (let t = from; t < to; t += STEP) {
    const b = band(getPosition(new Date(t), input.lat, input.lon).altitude)
    const last = bands[bands.length - 1]
    if (last !== undefined && last.band === b) last.x1 = xOf(t + STEP)
    else bands.push({ x0: xOf(t), x1: xOf(t + STEP), band: b })
  }
  const sun: TideDayModel['sun'] = []
  let up = getPosition(new Date(from), input.lat, input.lon).altitude > BAND_THRESHOLDS.horizon
  for (let t = from + 60_000; t <= to; t += 60_000) {
    const now = getPosition(new Date(t), input.lat, input.lon).altitude > BAND_THRESHOLDS.horizon
    if (now !== up) sun.push({ x: xOf(t), at: new Date(t), kind: now ? 'rise' : 'set' })
    up = now
  }
  return { from, to, path, marks, bands, sun, lowFeet, highFeet, xOf, tOf, yOf }
}
