/*
 * THE SKYLINE FROM A SPOT ON A KEPT SCAN, with the day's sun and moon on it.
 *
 * The spot's ground is the scan's own (the DTM); the eye stands EYE_M above
 * it, or a drone at its height. The skyline is from the scan's surface (the
 * DSM: roofs and trees as measured), by marching (src/core/skyRing.ts). The
 * sun's and moon's paths are suncalc's, every two minutes through the day.
 *
 * WHAT IT GOES BEHIND is named from what the scan found at the cell that sets
 * the skyline there: a mapped building's own name when its footprint holds
 * the cell, else "a building" for a roof, "trees" for the canopy,
 * "something tall" for what the scan found tall but could not class, "the
 * ground" for a dune or a bank. Never a guess beyond that.
 */
import { getTimes } from 'suncalc'
import type { LatLon } from '../../core/geo.ts'
import { getMoonArc } from '../../core/moonArc.ts'
import { crossings, skylineByMarch, type Crossing, type Skyline, type SunPoint } from '../../core/skyRing.ts'
import { getSunPosition } from '../../core/sun.ts'
import type { Building } from '../buildings.ts'
import { mercator, unmercator } from '../lidar/grid.ts'
import { KIND, type Rasters } from '../lidar/raster.ts'

export const EYE_M = 1.6
const STEP_MS = 2 * 60_000

export interface SkyEvent extends Crossing {
  body: 'sun' | 'moon'
  /** What it goes behind or comes out from: a building's name, "a building", "trees", "something tall" or "the ground". */
  what: string
}

export interface SkylineResult {
  skyline: Skyline
  sunPath: SunPoint[]
  moonPath: SunPoint[]
  events: SkyEvent[]
  sunset: Date | null
  /** The eye's height on the scan's datum, the ground under it, and what the eye stands on (the deck, a roof, the ground). */
  eyeM: number
  groundM: number
  standM: number
}

function inRing(ring: readonly [number, number][], at: LatLon): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > at.lat !== yj > at.lat && at.lon < ((xj - xi) * (at.lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** What stands at a cell, in words. */
export function whatAt(r: Rasters, cell: number, buildings: readonly Building[]): string {
  const col = cell % r.width
  const row = Math.floor(cell / r.width)
  const at = unmercator(r.minx + (col + 0.5) * r.cell, r.maxy - (row + 0.5) * r.cell)
  const named = buildings.find((b) => b.name !== null && inRing(b.ring, at))
  if (named !== undefined && named.name !== null) return named.name
  if (buildings.some((b) => inRing(b.ring, at))) return 'a building'
  const k = r.kind[cell]
  if (k === KIND.building) return 'a building'
  if (k === KIND.vegetation) return 'trees'
  /* Tall, but neither a mapped footprint nor a canopy: not named past that. */
  if (k === KIND.tall) return 'something tall'
  if (k === KIND.water) return 'the water'
  return 'the ground'
}

/** The skyline at a spot on the scan, `aboveGroundM` up, for the local day starting at `dayStart`. Null when the spot is off the scan. */
export function skylineFor(r: Rasters, buildings: readonly Building[], spot: LatLon, aboveGroundM: number, dayStart: Date, onFoot = aboveGroundM === EYE_M): SkylineResult | null {
  const m = mercator(spot.lat, spot.lon)
  const x = (m.x - r.minx) / r.cell
  const y = (r.maxy - m.y) / r.cell
  if (x < 0 || y < 0 || x >= r.width || y >= r.height) return null
  const cell = Math.floor(y) * r.width + Math.floor(x)
  /*
   * ON FOOT, ON WHAT IS THERE: the surface the scan measured at the spot, so
   * on the pier the deck and on a roof terrace the roof, not the sand under
   * them (the pier's pin, 27 Oct: from the sand under the pier house the
   * house's own roof a metre away filled every direction). A drone's
   * height is above the ground it took off from.
   */
  const groundM = r.dtm[cell]
  if (Number.isNaN(groundM)) return null
  const surfaceM = Number.isNaN(r.dsm[cell]) ? groundM : r.dsm[cell]
  const eyeM = (onFoot ? surfaceM : groundM) + aboveGroundM
  /* The raster's cell in ground metres: a Web Mercator unit is cos(latitude) of a metre. */
  const cellM = r.cell * Math.cos((spot.lat * Math.PI) / 180)
  const skyline = skylineByMarch({ width: r.width, height: r.height, cellM, dsm: r.dsm }, x, y, eyeM)
  const sunPath: SunPoint[] = []
  const moonPath: SunPoint[] = []
  for (let t = dayStart.getTime(); t <= dayStart.getTime() + 86_400_000; t += STEP_MS) {
    const at = new Date(t)
    const s = getSunPosition(at, spot.lat, spot.lon)
    sunPath.push({ at, azimuth: s.azimuth, altitude: s.altitude })
    const mo = getMoonArc(at, spot.lat, spot.lon)
    moonPath.push({ at, azimuth: mo.azimuth, altitude: mo.altitude })
  }
  const name = (c: Crossing) => (skyline.cell[c.bin] < 0 ? 'the ground' : whatAt(r, skyline.cell[c.bin], buildings))
  const events: SkyEvent[] = [
    ...crossings(skyline, sunPath).map((c) => ({ ...c, body: 'sun' as const, what: name(c) })),
    ...crossings(skyline, moonPath).map((c) => ({ ...c, body: 'moon' as const, what: name(c) })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime())
  const sunset = getTimes(new Date(dayStart.getTime() + 12 * 3_600_000), spot.lat, spot.lon).sunset ?? null
  return { skyline, sunPath, moonPath, events, sunset: sunset instanceof Date && !Number.isNaN(sunset.getTime()) ? sunset : null, eyeM, groundM, standM: onFoot ? surfaceM : groundM }
}
