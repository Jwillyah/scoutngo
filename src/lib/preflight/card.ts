/*
 * THE FLIGHT CARD: the move's numbers, each worked out two ways
 * (src/core/flight.ts), turned into the lines the card shows. Plain words
 * first, numbers small; never "safe", "legal" or "clear"; always ending with
 * FLIGHT_CARD_CLOSE.
 */
import {
  battery,
  clearanceByBoxes,
  clearanceBySurface,
  FLIGHT_CARD_CLOSE,
  FT,
  hiddenByHorizon,
  hiddenByMarch,
  legWind,
  pathLengthFormula,
  pathLengthSampled,
  stretches,
  type Heights,
  type Move,
  type PathPoint,
} from '../../core/flight.ts'
import { bearingBetween, type LatLon } from '../../core/geo.ts'
import type { LevelWind } from '../../core/windProfile.ts'

export interface CardInput {
  move: Move
  path: PathPoint[]
  capFt: number
  pilot: LatLon
  heights: Heights
  boxes: { ring: [number, number][]; topM: number }[]
  /** The scan's year, when its surface is what the clearances were measured against. */
  scanYear: number | null
  ceilingAt: (at: LatLon) => number | null
  winds: readonly LevelWind[]
  flightMinutes: number
}

export interface FlightCard {
  lengthM: number
  lengthCheckM: number
  durationS: number
  highestFt: number
  cappedFt: number | null
  clearance: { metres: number; checkMetres: number | null; t: number } | null
  hidden: [number, number][]
  hiddenS: number
  hiddenCheckS: number
  overCeiling: [number, number][]
  legs: { from: number; to: number; level: number; wind: string; speedMps: number }[]
  battery: ReturnType<typeof battery>
  lines: string[]
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export function flightCard(i: CardInput): FlightCard {
  const step = i.path.length > 1 ? i.path[1].t - i.path[0].t : 0.5
  const lengthM = pathLengthSampled(i.path)
  const lengthCheckM = pathLengthFormula(i.move, i.capFt)
  const durationS = i.path.length === 0 ? 0 : i.path[i.path.length - 1].t
  const highestFt = Math.max(0, ...i.path.map((p) => p.ft))
  const asked = Math.max(0, ...i.path.map((p) => p.askedFt))
  const a = clearanceBySurface(i.path, i.pilot, i.heights)
  const b = clearanceByBoxes(i.path, i.pilot, i.heights, i.boxes)
  const hidden = stretches(i.path, (p) => hiddenByMarch(i.pilot, p, i.heights))
  const hiddenCheck = stretches(i.path, (p) => hiddenByHorizon(i.pilot, p, i.heights))
  const secs = (runs: [number, number][]) => runs.reduce((s, [f, t]) => s + (t - f) + step, 0)
  const overCeiling = stretches(i.path, (p) => {
    const c = i.ceilingAt(p.at)
    return c !== null && p.ft > c
  })
  /* Legs: a new leg every 10 s, the wind at the nearer of 80 m and 120 m to the leg's height. */
  const legs: FlightCard['legs'] = []
  for (let k = 0; k + 1 < i.path.length; k += Math.max(1, Math.round(10 / step))) {
    const p = i.path[k]
    const q = i.path[Math.min(i.path.length - 1, k + Math.max(1, Math.round(10 / step)))]
    const level = p.ft * FT < 100 ? 80 : 120
    const w = i.winds.find((l) => l.heightMeters === level)
    if (w === undefined || w.speedMps === null || w.fromDegrees === null) continue
    if (p.at.lat === q.at.lat && p.at.lon === q.at.lon) continue
    legs.push({ from: p.t, to: q.t, level, wind: legWind(bearingBetween(p.at, q.at), w.fromDegrees), speedMps: w.speedMps })
  }
  const bat = battery(durationS, i.flightMinutes)
  const ft = (m: number) => Math.round(m / FT)
  const lines: string[] = [
    `${Math.round(lengthM)} m in ${mmss(durationS)}, highest ${Math.round(highestFt)} ft above takeoff.`,
    ...(asked > i.capFt ? [`Held at ${i.capFt} ft: the move asked for ${Math.round(asked)} ft, over the ceiling you set.`] : []),
    a === null
      ? 'No clearance worked out: nothing is known of what stands under the path.'
      : `Closest: ${ft(a.metres)} ft over the roofs and trees${i.scanYear === null ? ' the map knows of' : ` (${i.scanYear} scan)`}, at ${mmss(a.t)}. Check on site.`,
    hidden.length === 0 ? 'Never hidden from where you stand, by what the scan and the map know of.' : `Hidden from you for ${Math.round(secs(hidden))} s (amber on the path).`,
    overCeiling.length === 0 ? 'Under the grid ceiling along the whole path.' : `Over the grid ceiling for ${Math.round(secs(overCeiling))} s.`,
    ...(legs.length === 0 ? [] : [`Wind aloft: ${[...new Set(legs.map((l) => l.wind))].join(', ')}; up to ${Math.max(...legs.map((l) => l.speedMps)).toFixed(0)} m/s.`]),
    `Battery: ${bat.usedMin.toFixed(1)} of ${bat.usableMin.toFixed(0)} minutes before the ${Math.round(100 * 0.25)}% reserve.`,
    FLIGHT_CARD_CLOSE,
  ]
  return {
    lengthM,
    lengthCheckM,
    durationS,
    highestFt,
    cappedFt: asked > i.capFt ? i.capFt : null,
    clearance: a === null ? null : { metres: a.metres, checkMetres: b?.metres ?? null, t: a.t },
    hidden,
    hiddenS: secs(hidden),
    hiddenCheckS: secs(hiddenCheck),
    overCeiling,
    legs,
    battery: bat,
    lines,
  }
}
