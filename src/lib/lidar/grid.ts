/*
 * THE PATCH OF LIDAR A VENUE DOWNLOADS: A FIXED GRID, NOT CENTRED ON THE PIN.
 *
 * Web Mercator (EPSG:3857, the projects' own horizontal reference and the map
 * tiles'), cut into CELL-unit squares from the origin. A venue takes the 3 x 3
 * block of cells around the one its pin falls in, so two venues on the same
 * block share one download and nudging the pin a few metres changes nothing.
 * At 37 N a unit is cos(37) = 0.8 m on the ground: the block is about 1.2 km.
 */
export const CELL = 512
const R = 6378137

export interface MercatorBox {
  minx: number
  miny: number
  maxx: number
  maxy: number
}

export interface LidarArea extends MercatorBox {
  /** "x/y" of the centre cell: the key the scan is kept under. */
  id: string
  /** Ground metres per Web Mercator unit here (cos of the latitude). */
  metresPerUnit: number
}

export const mercator = (lat: number, lon: number): { x: number; y: number } => ({
  x: ((lon * Math.PI) / 180) * R,
  y: Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R,
})

export const unmercator = (x: number, y: number): { lat: number; lon: number } => ({
  lat: (Math.atan(Math.exp(y / R)) * 360) / Math.PI - 90,
  lon: (x / R) * (180 / Math.PI),
})

export function areaFor(lat: number, lon: number): LidarArea {
  const m = mercator(lat, lon)
  const cx = Math.floor(m.x / CELL)
  const cy = Math.floor(m.y / CELL)
  return { minx: (cx - 1) * CELL, maxx: (cx + 2) * CELL, miny: (cy - 1) * CELL, maxy: (cy + 2) * CELL, id: `${cx}/${cy}`, metresPerUnit: Math.cos((lat * Math.PI) / 180) }
}

/** Ground area of a box, square metres. */
export const areaM2 = (b: MercatorBox, metresPerUnit: number): number => (b.maxx - b.minx) * (b.maxy - b.miny) * metresPerUnit * metresPerUnit

/** The share of `a` that `b` covers, 0..1. */
export function overlap(a: MercatorBox, b: MercatorBox): number {
  const w = Math.max(0, Math.min(a.maxx, b.maxx) - Math.max(a.minx, b.minx))
  const h = Math.max(0, Math.min(a.maxy, b.maxy) - Math.max(a.miny, b.miny))
  const area = (a.maxx - a.minx) * (a.maxy - a.miny)
  return area === 0 ? 0 : (w * h) / area
}
