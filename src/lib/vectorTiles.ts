/*
 * OPENFREEMAP VECTOR TILES: BUILDINGS AND THE SEA, WITH NO OVERPASS.
 *
 * WHY. At Virginia Beach Fishing Pier at 7:11 AM on 27 Oct the 3D view said
 * "Map data didn't load" every time on an iPhone, while the same requests
 * worked from a Mac: Overpass rate-limits by address, and iCloud Private
 * Relay puts many phones behind one. Map tiles are served from a CDN with no
 * such limit. So the buildings (footprints with their heights) and the sea
 * (the `water` layer's ocean polygons) come from OpenFreeMap's tiles, and
 * Overpass is asked only for what the tiles do not have.
 *
 * THE SAME CACHE AS THE PHOTOGRAPH. Tiles are read through loadRawTile
 * (offlineCache.ts): the copy saved on the phone first, the network second,
 * under the same timeout; a venue's saved area includes them (areaUrls).
 *
 * WHAT GOES TO OPENFREEMAP: tile numbers around where the map is looking,
 * the same thing the photograph and elevation tiles already send to Esri and
 * AWS. No key, no cookies.
 */
import { VectorTile, classifyRings, type VectorTileFeature } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { tileBuildingHeight } from '../core/buildingHeight.ts'
import { clipRingToSquare, ringArea, type TilePoint } from '../core/oceanMask.ts'
import { tilePointLonLat, type TileAddress } from '../core/seaTile.ts'
import type { Building } from './buildings.ts'
import { loadRawTile } from './offlineCache.ts'
import { VECTOR_TEMPLATE, VECTOR_ZOOMS } from './offlineSources.ts'
import { tilesInBox, tileUrl, type Box } from './tileRange.ts'

export const vectorTileUrl = (t: TileAddress): string => tileUrl(VECTOR_TEMPLATE, t)

/* One decode per tile URL; the elevation tiles under one vector tile share it. */
const decoded = new Map<string, Promise<VectorTile | null>>()
const DECODED_KEPT = 48

/*
 * Loader, swappable for tests and measuring scripts. Resolved when asked, not
 * when this module loads: offlineCache.ts reaches here through seaMask.ts.
 */
let swapped: ((url: string) => Promise<ArrayBuffer | null>) | null = null
export function setVectorLoader(next: ((url: string) => Promise<ArrayBuffer | null>) | null): void {
  swapped = next
  decoded.clear()
  failedAt.clear()
}

/*
 * A TILE THAT FAILED IS NOT ASKED FOR AGAIN FOR A WHILE. Every elevation tile
 * under it asks, and on a network that hangs rather than refuses each ask
 * would hold an elevation tile for the whole tile timeout. With the map
 * tiles blocked at Virginia Beach the app asked 36 times in one load.
 */
export const VECTOR_RETRY_MS = 30_000
const failedAt = new Map<string, number>()

/** A Retry someone pressed: the tiles that failed are asked for again now, not after VECTOR_RETRY_MS. */
export function forgetVectorFailures(): void {
  failedAt.clear()
}

/** A vector tile, decoded, or null when it cannot be had (not saved and no signal, or refused). */
export function loadVectorTile(t: TileAddress): Promise<VectorTile | null> {
  const url = vectorTileUrl(t)
  const hit = decoded.get(url)
  if (hit !== undefined) return hit
  const failed = failedAt.get(url)
  if (failed !== undefined && Date.now() - failed < VECTOR_RETRY_MS) return Promise.resolve(null)
  const run = (async () => {
    const bytes = await (swapped ?? loadRawTile)(url)
    return bytes === null ? null : new VectorTile(new PbfReader(new Uint8Array(bytes)))
  })().catch(() => null)
  decoded.set(url, run)
  /* A failure is not kept as an answer: after VECTOR_RETRY_MS the next ask tries again. */
  void run.then((v) => {
    if (v !== null) return
    decoded.delete(url)
    failedAt.set(url, Date.now())
  })
  if (decoded.size > DECODED_KEPT) decoded.delete(decoded.keys().next().value as string)
  return run
}

/** The vector tile an elevation tile is cleaned against: itself, or its ancestor at the deepest vector zoom. Null below VECTOR_ZOOMS. */
export function vectorTileFor(t: TileAddress): TileAddress | null {
  if (t.z < VECTOR_ZOOMS[0]) return null
  const z = Math.min(t.z, VECTOR_ZOOMS[1])
  const shift = 2 ** (t.z - z)
  return { z, x: Math.floor(t.x / shift), y: Math.floor(t.y / shift) }
}

const pointsOf = (ring: { x: number; y: number }[]): TilePoint[] => ring.map((p) => ({ x: p.x, y: p.y }))

/** The sea in a vector tile: each ocean feature's rings, in tile coordinates. */
export function oceanFeatures(tile: VectorTile): TilePoint[][][] {
  const layer = tile.layers.water
  if (layer === undefined) return []
  const out: TilePoint[][][] = []
  for (let i = 0; i < layer.length; i += 1) {
    const f = layer.feature(i)
    if (f.type !== 3 || f.properties.class !== 'ocean') continue
    out.push(f.loadGeometry().map(pointsOf))
  }
  return out
}

/** The piers in one vector tile (OpenMapTiles transportation, class pier): decks as polygons, and those mapped as a line. */
export function pierFeatures(tile: VectorTile): { polygons: TilePoint[][][]; lines: TilePoint[][] } {
  const layer = tile.layers.transportation
  const out: { polygons: TilePoint[][][]; lines: TilePoint[][] } = { polygons: [], lines: [] }
  if (layer === undefined) return out
  for (let i = 0; i < layer.length; i += 1) {
    const f = layer.feature(i)
    if (f.properties.class !== 'pier') continue
    if (f.type === 3) out.polygons.push(f.loadGeometry().map(pointsOf))
    else if (f.type === 2) for (const line of f.loadGeometry()) out.lines.push(pointsOf(line))
  }
  return out
}

export const vectorExtent = (tile: VectorTile): number => tile.layers.water?.extent ?? tile.layers.building?.extent ?? 4096

/**
 * The buildings in one vector tile, each footprint's outer ring cut to the
 * tile's own square (a building across two tiles is two halves that meet),
 * with the tile's height read by tileBuildingHeight. `hide_3d` footprints are
 * outlines whose parts are drawn instead, and are left out.
 */
export function buildingsInTile(tile: VectorTile, at: TileAddress): Building[] {
  const layer = tile.layers.building
  if (layer === undefined) return []
  const extent = layer.extent
  const out: Building[] = []
  for (let i = 0; i < layer.length; i += 1) {
    const f: VectorTileFeature = layer.feature(i)
    if (f.type !== 3 || f.properties.hide_3d === true) continue
    const height = tileBuildingHeight(f.properties.render_height, f.properties.render_min_height)
    const polygons = classifyRings(f.loadGeometry())
    polygons.forEach((rings, p) => {
      const outer = clipRingToSquare(pointsOf(rings[0]), 0, extent)
      /*
       * NOTHING LEFT AFTER THE CUT. A building that only touches the tile's
       * edge comes out as one point repeated, and a footprint of no area
       * stops the 3D engine for good: it finds a polygon's centre by dividing
       * by its area (NaN), and "Rendering has stopped" on the pier at
       * Virginia Beach on 27 Oct. Under one tile unit (about 0.2 m² at zoom
       * 14) is not a building.
       */
      if (outer.length < 3 || Math.abs(ringArea(outer)) / 2 < 1) return
      const ring = outer.map((q) => {
        const ll = tilePointLonLat(at, q.x / extent, q.y / extent)
        return [ll.lon, ll.lat] as [number, number]
      })
      ring.push([ring[0][0], ring[0][1]])
      out.push({ id: `t${at.z}/${at.x}/${at.y}/${i}/${p}`, ring, height, name: null })
    })
  }
  return out
}

export type TileBuildings = { status: 'ok'; buildings: Building[] } | { status: 'unavailable'; reason: string }

/** Every building in the zoom 14 tiles over a box. Unavailable when any tile cannot be had: half a town drawn reads as the other half empty. */
export async function buildingsFromTiles(box: Box): Promise<TileBuildings> {
  const tiles = tilesInBox(box, VECTOR_ZOOMS[1])
  const loaded = await Promise.all(tiles.map((t) => loadVectorTile(t)))
  if (loaded.some((v) => v === null)) {
    const missing = loaded.filter((v) => v === null).length
    return { status: 'unavailable', reason: `${missing} of ${tiles.length} map tiles could not be loaded.` }
  }
  /*
   * THE BOX, NOT THE TILES. A zoom 14 tile is about 2 km across, and the
   * tiles over a 600 m box at the pier held 1993 buildings; the box holds the
   * ones the view is about. A building is kept when any corner is inside.
   */
  const inBox = (b: Building) => b.ring.some(([lon, lat]) => lon >= box.west && lon <= box.east && lat >= box.south && lat <= box.north)
  const out: Building[] = []
  loaded.forEach((v, i) => out.push(...buildingsInTile(v as VectorTile, tiles[i]).filter(inBox)))
  return { status: 'ok', buildings: out }
}
