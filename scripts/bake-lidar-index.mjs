/*
 * WHICH USGS LIDAR PROJECTS EXIST, AND WHERE, BAKED INTO THE APP.
 *
 * Usage:   node scripts/bake-lidar-index.mjs
 * Writes:  src/data/lidarIndex.ts
 *
 * From the boundary index the EPT publishers keep,
 * https://raw.githubusercontent.com/hobuinc/usgs-lidar/master/boundaries/resources.geojson
 * (8.7 MB: too heavy to fetch on a phone for every venue). Kept: each
 * project's name, its bounding box, its point count, and the acquisition
 * year from its name (the first four-digit year; null where the name has
 * none). The phone narrows by box, then confirms from the project's own tile
 * index that points really are there (src/lib/lidar/coverage.ts).
 */
import { writeFileSync } from 'node:fs'

const URL_ = 'https://raw.githubusercontent.com/hobuinc/usgs-lidar/master/boundaries/resources.geojson'
const geo = await (await fetch(URL_)).json()
const rows = []
for (const f of geo.features) {
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const p of polys) for (const ring of p) for (const [x, y] of ring) {
    w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y)
  }
  const name = f.properties.name
  const year = Number((name.match(/(?:^|_)((?:19|20)\d{2})(?:_|$)/) ?? [])[1]) || null
  const r = (v) => Math.round(v * 1000) / 1000
  rows.push([name, r(w), r(s), r(e), r(n), year, f.properties.count])
}
rows.sort((a, b) => a[0].localeCompare(b[0]))
writeFileSync('src/data/lidarIndex.ts', `/*
 * USGS 3DEP lidar projects as Entwine Point Tiles in s3://usgs-lidar-public,
 * baked by scripts/bake-lidar-index.mjs from ${URL_}
 * on ${new Date().toISOString().slice(0, 10)}. ${rows.length} projects:
 * [name, west, south, east, north, acquisition year from the name or null, points].
 * Boxes only; real coverage is confirmed from each project's tile index. Re-bake, never hand-edit.
 */
export const LIDAR_PROJECTS: readonly (readonly [string, number, number, number, number, number | null, number])[] = [
${rows.map((r) => `  ${JSON.stringify(r)},`).join('\n')}
]
`)
console.log(`wrote src/data/lidarIndex.ts: ${rows.length} projects`)
