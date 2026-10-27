/*
 * WHAT THE MAP TILES' BUILDING HEIGHTS ARE MADE OF.
 *
 * Usage:  node scripts/measure-tile-heights.mjs
 * Writes: measurements/<today>-tile-heights.md
 *
 * WHY. The 3D view's buildings come from OpenFreeMap's tiles now
 * (src/lib/vectorTiles.ts), which carry one number per footprint,
 * render_height, and not the OpenStreetMap tags it was made from. The app
 * must not draw an invented height as a surveyed one (src/core/buildingHeight.ts),
 * so this checks, building by building, what render_height is when OSM has a
 * height, has storeys, or has neither.
 *
 * HOW. Every building way within 600 m of Virginia Beach Fishing Pier, with
 * its tags, from Overpass (asked once, from this machine); each way's centre
 * found in the zoom 14 tile's footprints; the tile's render_height set beside
 * the tags.
 */
import { writeFileSync } from 'node:fs'
import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { boxAround, tilesInBox, tileUrl } from '../src/lib/tileRange.ts'
import { VECTOR_TEMPLATE } from '../src/lib/offlineSources.ts'

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const RADIUS = 600
const box = boxAround(PIER, RADIUS)
const query = `[out:json][timeout:60];way["building"](${box.south},${box.west},${box.north},${box.east});out center tags;`
const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: query }), headers: { 'User-Agent': 'ScoutNGo measure-tile-heights' } })
if (!res.ok) {
  console.log(`=== TILE HEIGHTS ABORTED: Overpass answered ${res.status} ===`)
  process.exit(2)
}
const osm = (await res.json()).elements

const footprints = []
for (const t of tilesInBox(box, 14)) {
  const bytes = new Uint8Array(await (await fetch(tileUrl(VECTOR_TEMPLATE, t))).arrayBuffer())
  const layer = new VectorTile(new PbfReader(bytes)).layers.building
  for (let i = 0; i < (layer?.length ?? 0); i += 1) {
    const f = layer.feature(i)
    for (const ring of f.loadGeometry()) footprints.push({ t, extent: layer.extent, ring, h: f.properties.render_height })
  }
}
const inTile = (t, extent, lat, lon) => {
  const n = 2 ** t.z
  const s = Math.sin((lat * Math.PI) / 180)
  return { x: (((lon + 180) / 360) * n - t.x) * extent, y: ((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n - t.y) * extent }
}
const inside = (p, r) => {
  let c = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i].y > p.y !== r[j].y > p.y && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) c = !c
  return c
}

const groups = { height: new Map(), levels: new Map(), none: new Map() }
let unmatched = 0
for (const e of osm) {
  const hit = footprints.find((f) => {
    const p = inTile(f.t, f.extent, e.center.lat, e.center.lon)
    return p.x >= 0 && p.x <= f.extent && p.y >= 0 && p.y <= f.extent && inside(p, f.ring)
  })
  if (hit === undefined) {
    unmatched += 1
    continue
  }
  const tags = e.tags ?? {}
  const kind = tags.height !== undefined ? 'height' : tags['building:levels'] !== undefined ? 'levels' : 'none'
  const pair = `${tags.height ?? tags['building:levels'] ?? 'no tag'} → ${hit.h}`
  groups[kind].set(pair, (groups[kind].get(pair) ?? 0) + 1)
}
const count = (m) => [...m.values()].reduce((a, b) => a + b, 0)
const noneFives = groups.none.get('no tag → 5') ?? 0
const out = [
  "# What the map tiles' building heights are made of",
  '',
  `Run: ${new Date().toISOString()} · node scripts/measure-tile-heights.mjs · ${osm.length} OSM building ways within ${RADIUS} m of Virginia Beach Fishing Pier (${PIER.lat}, ${PIER.lon}) · tiles ${VECTOR_TEMPLATE}, zoom 14`,
  `Matched to a tile footprint: ${osm.length - unmatched}; not matched (centre outside every footprint): ${unmatched}.`,
  '',
  `With no height and no storeys in OSM: ${count(groups.none)}, of which ${noneFives} read 5 in the tiles.`,
  `With a height: ${count(groups.height)}. With storeys and no height: ${count(groups.levels)}.`,
  '',
  '| OSM has | OSM tag → tile render_height | buildings |',
  '|---|---|---|',
  ...Object.entries(groups).flatMap(([kind, m]) => [...m].sort((a, b) => b[1] - a[1]).map(([pair, n]) => `| ${kind} | ${pair} | ${n} |`)),
  '',
]
const file = `measurements/${new Date().toISOString().slice(0, 10)}-tile-heights.md`
writeFileSync(file, out.join('\n'))
console.log(out.slice(0, 8).join('\n'))
