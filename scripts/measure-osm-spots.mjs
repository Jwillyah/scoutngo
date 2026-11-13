/*
 * THE MAP'S SPOTS WITHIN 15 MI (Batch NOW, Section 0.4): how many
 * viewpoints, piers, boat ramps and parks on the water OpenStreetMap has
 * round Virginia Beach, asked the app's way (src/core/osmSpots.ts: fixed
 * 0.25° tiles, one Overpass question each).
 *
 * Usage:  node scripts/measure-osm-spots.mjs [fetch]
 *         Asks Overpass (overpass-api.de, then its two mirrors) for each tile
 *         not yet kept in tests/data/osm-2026-11-13/, then counts what is kept.
 * Writes: measurements/2026-11-13-osm-spots.md
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { osmQuery, osmSpots, osmTiles, dedupeSpots } from '../src/core/osmSpots.ts'
import { STARTER_SPOTS } from '../src/data/bestSkySpots.ts'
import { distanceMeters } from '../src/core/geo.ts'
import { roundedCentre } from '../src/core/bestSky.ts'

const DIR = 'tests/data/osm-2026-11-13'
const VB = { lat: 36.85, lon: -75.98 }
const KM = 15 * 1.609344
mkdirSync(DIR, { recursive: true })
const centre = roundedCentre(VB)
const tiles = osmTiles(centre, KM)
const all = []
/* Overpass at capacity answers 502/504: each round asks only for the tiles still missing, with a longer pause after a round that failed. */
for (let round = 0; round < 5; round += 1) {
  const missing = tiles.filter((t) => !existsSync(`${DIR}/tile-${t.south}-${t.west}.json`))
  if (missing.length === 0) break
  for (const t of missing) {
    try {
      await fetchTile(t)
    } catch (e) {
      console.log(String(e).slice(0, 120))
    }
  }
  await new Promise((res) => setTimeout(res, 20_000 * (round + 1)))
}
async function fetchTile(t) {
  const file = `${DIR}/tile-${t.south}-${t.west}.json`
  {
    /* Overpass refuses a request with no User-Agent (406); one tile at a time, a pause between (a shared, free service). */
    /* The app's three servers in its order (src/lib/overpassClient.ts), the next when one is busy. */
    let r = null
    let text = ''
    for (const server of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
      r = await fetch(server, { method: 'POST', headers: { 'user-agent': 'scoutngo-measure (Batch NOW, measurements)', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: osmQuery(t) }) }).catch(() => null)
      text = r === null ? '' : await r.text()
      if (r !== null && r.ok) break
      await new Promise((res) => setTimeout(res, 3000))
    }
    if (r === null || !r.ok) throw new Error(`Overpass ${r?.status} for ${file}: ${text.slice(0, 120)}`)
    writeFileSync(file, text)
    await new Promise((res) => setTimeout(res, 2000))
  }
}
for (const t of tiles) {
  const file = `${DIR}/tile-${t.south}-${t.west}.json`
  if (!existsSync(file)) throw new Error(`${file}: Overpass never answered`)
  all.push(...osmSpots(JSON.parse(readFileSync(file, 'utf8'))))
}
const inside = all.filter((s) => distanceMeters(centre, s.at) / 1000 <= KM)
const starter = STARTER_SPOTS.filter((s) => distanceMeters(centre, s.at) / 1000 <= KM)
const kept = dedupeSpots(starter, inside, 300, distanceMeters)
const kind = (s) => s.kind
const count = (list) => Object.entries(list.reduce((m, s) => ({ ...m, [kind(s)]: (m[kind(s)] ?? 0) + 1 }), {})).map(([k, n]) => `${k} ${n}`).join(', ')
const L = [
  '# The map\'s spots within 15 mi of Virginia Beach',
  '',
  `Run ${new Date().toISOString()} · node scripts/measure-osm-spots.mjs ${process.argv.slice(2).join(' ')} · ${tiles.length} tiles of 0.25° round ${centre.lat}, ${centre.lon} (kept in ${DIR}/) · OpenStreetMap through Overpass`,
  '',
  `- In the tiles: ${all.length} (${count(all)})`,
  `- Within 15 mi: ${inside.length} (${count(inside)})`,
  `- Added to the ${starter.length} starter spots, after dropping any within 300 m of one or of each other: ${kept.length}`,
  `- With a facing from the map (a viewpoint's direction tag): ${kept.filter((s) => s.facing !== null).length}`,
  '',
]
writeFileSync('measurements/2026-11-13-osm-spots.md', L.join('\n'))
console.log(L.join('\n'))
