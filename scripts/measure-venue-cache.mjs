/*
 * HOW BIG IS ONE VENUE, OFFLINE?
 *
 * Usage:  node scripts/measure-venue-cache.mjs [radiusMeters]
 * Writes: measurements/<today>-venue-cache-<radius>m.md
 *
 * WHY THIS EXISTS. The offline cache fills itself when a venue is opened with
 * signal, and the brief set a ceiling: over about 40 MB, cut the top zoom and
 * say so. That decision needs a real number, so every tile the cache would
 * hold is fetched here and weighed. Nothing is estimated from an average tile.
 *
 * SAME TILE LIST THE APP USES. The tiles come from src/lib/tileRange.ts, the
 * module src/lib/offlineCache.ts calls, so this measures what the app would
 * store rather than a parallel guess at it.
 *
 * TWO VENUES, because imagery compresses very differently over forest and over
 * a beach town: Big Meadow in Shenandoah, where the trip failed, and Atlantic
 * Park in Virginia Beach.
 *
 * ALSO THE TERRAIN MEAN. The terrain bucket refuses a browser HEAD, so the app
 * cannot measure terrain before downloading it; it multiplies a tile count by
 * the mean recorded here, and says on screen that terrain is an estimate.
 */
import { writeFileSync } from 'node:fs'
import { boxAround, tilesForRange, tileUrl } from '../src/lib/tileRange.ts'
import { IMAGERY_TEMPLATE, TERRAIN_TEMPLATE, IMAGERY_ZOOMS, TERRAIN_ZOOMS } from '../src/lib/offlineSources.ts'

const RADIUS = Number(process.argv[2] ?? 400)
const VENUES = [
  { name: 'Big Meadow, Shenandoah', at: { lat: 38.5195, lon: -78.444 } },
  { name: 'Atlantic Park, Virginia Beach', at: { lat: 36.8466, lon: -75.9741 } },
]

async function weigh(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
      if (!response.ok) return { status: response.status, bytes: 0 }
      return { status: 200, bytes: (await response.arrayBuffer()).byteLength }
    } catch {
      /* retried; a third failure is recorded as a failure, not as zero */
    }
  }
  return { status: 'failed', bytes: 0 }
}

async function weighAll(urls) {
  const out = []
  const queue = [...urls]
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (queue.length > 0) out.push(await weigh(queue.shift()))
    }),
  )
  return out
}

const mb = (bytes) => (bytes / 1_000_000).toFixed(2)
const lines = []
const summary = []
let failures = 0
/* Terrain per tile, across every venue: the browser cannot HEAD terrain. */
let terrainBytes = 0
let terrainTiles = 0

for (const venue of VENUES) {
  const box = boxAround(venue.at, RADIUS)
  lines.push(`## ${venue.name} (${venue.at.lat}, ${venue.at.lon})`, '')
  lines.push('| layer | zoom | tiles | bytes | MB |', '|---|---|---|---|---|')
  let total = 0
  const byZoom = {}
  for (const [layer, template, [lo, hi]] of [
    ['imagery', IMAGERY_TEMPLATE, IMAGERY_ZOOMS],
    ['terrain', TERRAIN_TEMPLATE, TERRAIN_ZOOMS],
  ]) {
    for (let z = lo; z <= hi; z += 1) {
      const tiles = tilesForRange(box, z, z)
      const results = await weighAll(tiles.map((t) => tileUrl(template, t)))
      const bad = results.filter((r) => r.status !== 200).length
      failures += bad
      const bytes = results.reduce((s, r) => s + r.bytes, 0)
      total += bytes
      byZoom[`${layer}${z}`] = bytes
      if (layer === 'terrain') {
        terrainBytes += bytes
        terrainTiles += results.filter((r) => r.status === 200).length
      }
      lines.push(`| ${layer} | ${z} | ${tiles.length}${bad > 0 ? ` (${bad} failed)` : ''} | ${bytes} | ${mb(bytes)} |`)
    }
  }
  lines.push(`| **total** | | | **${total}** | **${mb(total)}** |`, '')
  summary.push({ venue: venue.name, total, top: byZoom[`imagery${IMAGERY_ZOOMS[1]}`] })
}

const date = new Date().toISOString().slice(0, 10)
const file = `measurements/${date}-venue-cache-${RADIUS}m.md`
const header = [
  '# One venue, offline: what it weighs',
  '',
  `**Date:** ${date}`,
  `**Script:** \`scripts/measure-venue-cache.mjs ${RADIUS}\``,
  `**Radius:** ${RADIUS} m (RADIUS_DEFAULT_METERS)`,
  `**Imagery:** Esri World Imagery, z${IMAGERY_ZOOMS[0]}–z${IMAGERY_ZOOMS[1]}`,
  `**Terrain:** AWS terrarium, z${TERRAIN_ZOOMS[0]}–z${TERRAIN_ZOOMS[1]} (the source's own maxzoom is 15; MapLibre overzooms above it)`,
  '**Method:** every tile touching the box around the radius was fetched and its body length summed. No averages.',
  `**Failed fetches:** ${failures}`,
  '',
  '## Totals',
  '',
  '| venue | total MB | top imagery zoom alone MB |',
  '|---|---|---|',
  ...summary.map((s) => `| ${s.venue} | ${mb(s.total)} | ${mb(s.top)} |`),
  '',
  /*
   * WHY THIS LINE. Esri answers a cross-origin HEAD, so the app measures
   * imagery before downloading it. The terrain bucket's CORS rule allows GET
   * only, so a browser cannot HEAD a terrain tile, and terrain's share of a
   * size shown before download is this mean times the tile count, labelled as
   * an estimate on screen.
   */
  `**Mean bytes per terrain tile:** ${Math.round(terrainBytes / Math.max(1, terrainTiles))} (${terrainTiles} tiles, ${terrainBytes} bytes)`,
  '',
]
writeFileSync(file, [...header, ...lines].join('\n'))
console.log([...header, ...lines].join('\n'))
console.log(`\nwritten to ${file}`)
if (failures > 0) {
  console.log(`=== VENUE CACHE MEASUREMENT INCOMPLETE: ${failures} tiles failed to fetch ===`)
  process.exit(2)
}
