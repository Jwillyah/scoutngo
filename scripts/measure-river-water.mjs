/*
 * IS THE WICOMICO WATER? THE RIVER-AS-RELATION FIX AGAINST LIVE OVERPASS.
 *
 * Usage:  node scripts/measure-river-water.mjs [overpass-url]
 * Writes: measurements/<today>-river-water-brew-river.md
 * Exits:  0 when relation water is found and a line south from the venue
 *         crosses it; 1 when it does not; 2 when Overpass did not answer.
 *
 * WHY. The Wicomico at Brew River Dock Bar is mapped as multipolygon
 * relations, and the parser once read water WAYS only, so the river came back
 * as no water at all. The fix (relationWater and stitchRings in
 * src/lib/overpass.ts) was tested on a fixture while Overpass was down. This
 * is the same query and the same parser the app runs, against the live server.
 */
import { writeFileSync } from 'node:fs'
import { buildQuery, parseOverpass } from '../src/lib/overpass.ts'
import { boxAround } from '../src/lib/tileRange.ts'
import { isInWater } from '../src/core/siting.ts'
import { destinationPoint } from '../src/core/geo.ts'

const ENDPOINT = process.argv[2] ?? 'https://overpass-api.de/api/interpreter'
const VENUE = { lat: 38.364236, lon: -75.605912, name: 'Brew River Dock Bar, Salisbury MD' }
const BOX_METERS = 400
const STEP_METERS = 10
const WALK_METERS = 300

const box = boxAround(VENUE, BOX_METERS)
let raw
try {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=UTF-8', 'user-agent': 'scoutngo-measure/1.0' },
    body: buildQuery({ west: box.west, south: box.south, east: box.east, north: box.north }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  raw = await response.json()
} catch (error) {
  console.log(`=== RIVER WATER ABORTED: ${ENDPOINT} did not answer: ${error.message} ===`)
  process.exit(2)
}

const elements = raw.elements ?? []
const waterTagged = (e) => e.tags?.natural === 'water' || e.tags?.waterway === 'riverbank'
const ways = elements.filter((e) => e.type === 'way' && waterTagged(e))
const relations = elements.filter((e) => e.type === 'relation' && waterTagged(e))
const site = parseOverpass(raw)
const water = site.land.water

/* Walk south from the venue: where does the app's water start and stop? */
const walk = []
for (let m = 0; m <= WALK_METERS; m += STEP_METERS) {
  const at = destinationPoint(VENUE, 180, m)
  walk.push({ m, at, wet: isInWater(at, water) })
}
const wetRuns = []
for (const p of walk) {
  if (p.wet && (wetRuns.length === 0 || wetRuns.at(-1).end !== p.m - STEP_METERS)) wetRuns.push({ start: p.m, end: p.m })
  else if (p.wet) wetRuns.at(-1).end = p.m
}

const ok = relations.length > 0 && wetRuns.length > 0
const lines = [
  `# The Wicomico at ${VENUE.name}: water from relations, live`,
  '',
  `**Date:** ${new Date().toLocaleDateString('en-CA')}`,
  '**Script:** `scripts/measure-river-water.mjs`',
  `**Overpass endpoint:** ${ENDPOINT}`,
  `**Overpass data as of:** ${raw.osm3s?.timestamp_osm_base ?? 'not given'}`,
  `**Venue:** ${VENUE.lat}, ${VENUE.lon}; box ${BOX_METERS} m round it`,
  '',
  `Water-tagged ways: ${ways.length}. Water-tagged relations: ${relations.length} (${relations.map((r) => `${r.id} ${r.tags.name ?? r.tags.water ?? ''}`.trim()).join('; ') || 'none'}).`,
  `Water polygons the app's parser returned: ${water.length}.`,
  '',
  `Walking south from the venue every ${STEP_METERS} m for ${WALK_METERS} m, the app reads water at: ${wetRuns.length === 0 ? 'no point' : wetRuns.map((r) => `${r.start} to ${r.end} m`).join(', ')}.`,
  '',
  ok
    ? `## The river is water: ${relations.length} relations came back and the walk south crosses water from ${wetRuns[0].start} m.`
    : '## FAILED: the river did not come back as water.',
  '',
]
const file = `measurements/${new Date().toLocaleDateString('en-CA')}-river-water-brew-river.md`
writeFileSync(file, lines.join('\n'))
console.log(lines.join('\n'))
console.log(`written to ${file}`)
process.exit(ok ? 0 : 1)
