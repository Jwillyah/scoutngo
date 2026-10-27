/*
 * TREES FROM THE SCAN: the tall things that are not buildings.
 *
 * The USGS projects at the venues leave trees and roofs alike unclassified;
 * a tree here is vegetation by raster.ts (classified, or tall where the laser
 * came back more than once, as it does through leaves and not off a roof),
 * TREE_MIN_M or more over the ground, outside every building footprint, and
 * the highest within PEAK_SPACING_M: one per crown, at its measured height.
 * Up to MAX_TREES, tallest first.
 */
import { mercator, unmercator } from './grid.ts'
import { canopyAt, type Rasters } from './raster.ts'

export const TREE_MIN_M = 3
export const PEAK_SPACING_M = 6
export const MAX_TREES = 600
/* A roof's rim falls in cells just outside its footprint: the mask is grown this far first. */
export const ROOF_RIM_M = 2
/*
 * No tree stands in the water: a pier's deck lets pulses through to the sea
 * and reads like a canopy (Virginia Beach Fishing Pier, 27 Oct, a row of
 * "trees" along it). Peaks with water within this many metres are dropped.
 */
export const WATER_CLEAR_M = 3

export interface CanopyPeak {
  lat: number
  lon: number
  height: number
}

/** A mask of the cells inside any footprint ([lon, lat] rings). */
export function footprintMask(r: Rasters, rings: readonly (readonly [number, number][])[]): Uint8Array {
  const mask = new Uint8Array(r.width * r.height)
  for (const ring of rings) {
    const m = ring.map(([lon, lat]) => mercator(lat, lon))
    const xs = m.map((p) => p.x)
    const ys = m.map((p) => p.y)
    const c0 = Math.max(0, Math.floor((Math.min(...xs) - r.minx) / r.cell))
    const c1 = Math.min(r.width - 1, Math.floor((Math.max(...xs) - r.minx) / r.cell))
    const r0 = Math.max(0, Math.floor((r.maxy - Math.max(...ys)) / r.cell))
    const r1 = Math.min(r.height - 1, Math.floor((r.maxy - Math.min(...ys)) / r.cell))
    for (let row = r0; row <= r1; row += 1) {
      const y = r.maxy - (row + 0.5) * r.cell
      for (let col = c0; col <= c1; col += 1) {
        const x = r.minx + (col + 0.5) * r.cell
        let inside = false
        for (let i = 0, j = m.length - 1; i < m.length; j = i++) {
          if (m[i].y > y !== m[j].y > y && x < ((m[j].x - m[i].x) * (y - m[i].y)) / (m[j].y - m[i].y) + m[i].x) inside = !inside
        }
        if (inside) mask[row * r.width + col] = 1
      }
    }
  }
  return mask
}

function grow(mask: Uint8Array, w: number, h: number, by: number): Uint8Array {
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (mask[y * w + x] !== 1) continue
      for (let dy = -by; dy <= by; dy += 1) for (let dx = -by; dx <= by; dx += 1) {
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) out[ny * w + nx] = 1
      }
    }
  }
  return out
}

export function canopyPeaks(r: Rasters, footprints: Uint8Array): CanopyPeak[] {
  /* Cells are a ground metre each (raster.ts), so metres are cells. */
  const mask = grow(footprints, r.width, r.height, ROOF_RIM_M)
  const wet = r.water === undefined ? null : grow(r.water, r.width, r.height, WATER_CLEAR_M)
  const spacing = PEAK_SPACING_M
  const tall: { i: number; h: number }[] = []
  for (let i = 0; i < r.width * r.height; i += 1) {
    if (mask[i] === 1 || wet?.[i] === 1) continue
    const h = canopyAt(r, i)
    if (h >= TREE_MIN_M) tall.push({ i, h })
  }
  tall.sort((a, b) => b.h - a.h)
  const taken = new Uint8Array(r.width * r.height)
  const out: CanopyPeak[] = []
  for (const t of tall) {
    if (taken[t.i] === 1) continue
    const x = t.i % r.width
    const y = (t.i / r.width) | 0
    for (let dy = -spacing; dy <= spacing; dy += 1) {
      for (let dx = -spacing; dx <= spacing; dx += 1) {
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < r.width && ny < r.height) taken[ny * r.width + nx] = 1
      }
    }
    const p = unmercator(r.minx + (x + 0.5) * r.cell, r.maxy - (y + 0.5) * r.cell)
    out.push({ lat: p.lat, lon: p.lon, height: t.h })
    if (out.length >= MAX_TREES) break
  }
  return out
}
