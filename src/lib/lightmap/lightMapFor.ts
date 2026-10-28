/*
 * THE LIGHT MAP OVER THE KEPT SCAN: minutes of direct sun per metre of
 * ground around the venue, for one of three questions, drawn as an image on
 * the 2D map.
 *
 *   golden   "Where golden light lands": the last GOLDEN_MIN minutes before
 *            sunset, or for a morning shoot the first GOLDEN_MIN after
 *            sunrise; the more of them a spot is in the sun, the brighter
 *   shade    "Shade all afternoon": noon to sunset; the spots that stay out
 *            of the sun (in it no more than a tenth of the time)
 *   even     "Even light": the shoot window; the spots whose light does not
 *            change through it, all sun or all shade, as against the ones
 *            that go from one to the other
 *
 * Worked out in rows, a few at a time, so the screen keeps moving
 * (src/core/lightMap.ts by rays; checked against skylines in
 * scripts/measure-light-map.mjs).
 */
import { getTimes } from 'suncalc'
import type { LatLon } from '../../core/geo.ts'
import { sunMinutesByRays, sunSteps, wallSunMinutes, type SunStep } from '../../core/lightMap.ts'
import { getSunPosition } from '../../core/sun.ts'
import { mercator, unmercator } from '../lidar/grid.ts'
import { KIND, type Rasters } from '../lidar/raster.ts'
import { seaTestAround } from '../coast.ts'

export type LightPreset = 'golden' | 'shade' | 'even'
export const GOLDEN_MIN = 45
/* Metres either side of the venue the map covers. */
export const HALF_M = 150
const STEP_MIN = 5

export interface LightMap {
  preset: LightPreset
  from: Date
  to: Date
  /** Minutes in the window. */
  windowMin: number
  /** Minutes of direct sun per cell, row 0 north; NaN where the scan measured nothing. */
  minutes: Float32Array
  /** Minutes of direct sun on the walls of each built cell, NaN where it has none (src/core/lightMap.ts wallSunMinutes). */
  walls: Float32Array
  width: number
  height: number
  /** The image, and its corners for MapLibre: top-left, top-right, bottom-right, bottom-left. */
  url: string
  coordinates: [[number, number], [number, number], [number, number], [number, number]]
  /** Cells within this many metres of the scan's edge may be shaded by what it did not reach. */
  edgeM: number
}

/** Whether a shoot window is a morning one: it starts before the sun's noon. */
export function morningShoot(venue: LatLon, dayStart: Date, shoot: { from: Date; to: Date } | null): boolean {
  if (shoot === null) return false
  const noon = getTimes(new Date(dayStart.getTime() + 12 * 3_600_000), venue.lat, venue.lon).solarNoon
  return noon instanceof Date && !Number.isNaN(noon.getTime()) && shoot.from.getTime() < noon.getTime()
}

/*
 * The window a preset asks about, on the day `dayStart` (local midnight)
 * begins. Null when the sun does not rise or set that day here.
 *
 * GOLDEN FOLLOWS THE SHOOT: the first GOLDEN_MIN minutes after sunrise for a
 * morning one. It was the evening only, so a sunrise shoot at the Oceanfront
 * (27 Oct) was asked about the wrong end of the day.
 */
export function presetWindow(preset: LightPreset, venue: LatLon, dayStart: Date, shoot: { from: Date; to: Date } | null): { from: Date; to: Date } | null {
  const t = getTimes(new Date(dayStart.getTime() + 12 * 3_600_000), venue.lat, venue.lon)
  const sunset = t.sunset instanceof Date && !Number.isNaN(t.sunset.getTime()) ? t.sunset : null
  const sunrise = t.sunrise instanceof Date && !Number.isNaN(t.sunrise.getTime()) ? t.sunrise : null
  const noon = t.solarNoon instanceof Date && !Number.isNaN(t.solarNoon.getTime()) ? t.solarNoon : null
  if (preset === 'golden' && morningShoot(venue, dayStart, shoot)) return sunrise === null ? null : { from: sunrise, to: new Date(sunrise.getTime() + GOLDEN_MIN * 60_000) }
  if (preset === 'golden') return sunset === null ? null : { from: new Date(sunset.getTime() - GOLDEN_MIN * 60_000), to: sunset }
  if (preset === 'shade') return sunset === null || noon === null ? null : { from: noon, to: sunset }
  return shoot
}

/* The data colours: the sun's gold for light, the shadow's periwinkle for shade. */
const SUN: [number, number, number] = [255, 213, 74]
const SHADE: [number, number, number] = [154, 167, 255]

/* A wall in the sun: near white, the brightest thing on the map, drawn on the roof's edge above it. */
const WALL: [number, number, number, number] = [255, 250, 225, 255]

/** Whether a built cell's walls are drawn: in the sun for at least a tenth of the window, in the presets that ask where the light lands. */
export function wallLit(preset: LightPreset, f: number): boolean {
  return preset !== 'shade' && !Number.isNaN(f) && f >= 0.1
}

/** A cell the scan has a building on: classified as one, or (scans that classify none) standing tall and unclassified. */
export const builtIn = (r: Rasters) => (i: number) => r.kind[i] === KIND.building || r.kind[i] === KIND.tall

/** The colour of a cell for a preset, or null for none. `f` is the share of the window in the sun. */
export function cellColour(preset: LightPreset, f: number): [number, number, number, number] | null {
  if (Number.isNaN(f)) return null
  if (preset === 'golden') return f <= 0 ? [...SHADE, 70] : [...SUN, Math.round(60 + 170 * f)]
  if (preset === 'shade') return f <= 0.1 ? [...SHADE, 190] : null
  if (f >= 0.9) return [...SUN, 170]
  if (f <= 0.1) return [...SHADE, 170]
  return null
}

/**
 * The surface the light map reads: the scan's DSM with the sea taken out.
 * The sea was measured as it stood the day of the flight, waves and all, and
 * with a low sun every ripple cast a shadow a few metres long (the pier, 27
 * Oct: streaks of shade over the water). Neither the scan's water class nor
 * its water returns mark the sea cleanly (the waves' tops come back as
 * unclassified or even ground, and a mask of them is salt and pepper), so
 * the sea is the map's own (src/lib/coast.ts seaTestAround), tested in 4 m
 * blocks; without the map tiles, the scan's water class alone. The sea casts
 * no shade here and is not drawn.
 */
export function landSurface(r: Rasters, isSea: ((at: LatLon) => boolean) | null): Float32Array {
  const out = r.dsm.slice()
  for (let i = 0; i < out.length; i += 1) if (r.kind[i] === KIND.water) out[i] = Number.NaN
  if (isSea === null) return out
  const B = 4
  for (let by = 0; by < r.height; by += B) {
    for (let bx = 0; bx < r.width; bx += B) {
      const at = unmercator(r.minx + (bx + B / 2) * r.cell, r.maxy - (by + B / 2) * r.cell)
      if (!isSea(at)) continue
      for (let y = by; y < Math.min(r.height, by + B); y += 1) for (let x = bx; x < Math.min(r.width, bx + B); x += 1) out[y * r.width + x] = Number.NaN
    }
  }
  return out
}

export async function lightMapFor(r: Rasters, venue: LatLon, preset: LightPreset, window: { from: Date; to: Date }, onProgress?: (share: number) => void): Promise<LightMap> {
  /* The sea from the map tiles, over the scanned patch (its diagonal from the venue, and a little). */
  const isSea = await seaTestAround(venue, (Math.hypot(r.width, r.height) * r.cell * Math.cos((venue.lat * Math.PI) / 180)) / 2 + 200).catch(() => null)
  const m = mercator(venue.lat, venue.lon)
  const cellM = r.cell * Math.cos((venue.lat * Math.PI) / 180)
  const cx = Math.floor((m.x - r.minx) / r.cell)
  const cy = Math.floor((r.maxy - m.y) / r.cell)
  const half = Math.round(HALF_M / cellM)
  const x0 = Math.max(0, cx - half)
  const y0 = Math.max(0, cy - half)
  const x1 = Math.min(r.width, cx + half)
  const y1 = Math.min(r.height, cy + half)
  const steps: SunStep[] = sunSteps(window.from, window.to, STEP_MIN, (at) => getSunPosition(at, venue.lat, venue.lon))
  const g = { width: r.width, height: r.height, cellM, dsm: landSurface(r, isSea) }
  const width = x1 - x0
  const height = y1 - y0
  const minutes = new Float32Array(width * height)
  const walls = new Float32Array(width * height)
  const built = builtIn(r)
  const gw = { ...g, dtm: r.dtm }
  const ROWS = 12
  for (let y = y0; y < y1; y += ROWS) {
    const rows = { x0, y0: y, x1, y1: Math.min(y1, y + ROWS) }
    minutes.set(sunMinutesByRays(g, rows, steps), (y - y0) * width)
    walls.set(wallSunMinutes(gw, built, rows, steps), (y - y0) * width)
    onProgress?.((y - y0 + ROWS) / height)
    await new Promise((res) => setTimeout(res, 0))
  }
  const windowMin = (window.to.getTime() - window.from.getTime()) / 60_000
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx !== null) {
    const img = ctx.createImageData(width, height)
    for (let i = 0; i < minutes.length; i += 1) {
      const c = wallLit(preset, walls[i] / windowMin) ? WALL : cellColour(preset, minutes[i] / windowMin)
      if (c !== null) img.data.set(c, i * 4)
    }
    ctx.putImageData(img, 0, 0)
  }
  const tl = unmercator(r.minx + x0 * r.cell, r.maxy - y0 * r.cell)
  const br = unmercator(r.minx + x1 * r.cell, r.maxy - y1 * r.cell)
  return {
    preset,
    from: window.from,
    to: window.to,
    windowMin,
    minutes,
    walls,
    width,
    height,
    url: canvas.toDataURL('image/png'),
    coordinates: [
      [tl.lon, tl.lat],
      [br.lon, tl.lat],
      [br.lon, br.lat],
      [tl.lon, br.lat],
    ],
    edgeM: Math.min(cx, cy, r.width - cx, r.height - cy) * cellM - HALF_M,
  }
}
