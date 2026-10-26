/*
 * HOW MANY TREES OPENSTREETMAP HAS AT THE EXAMPLE VENUE.
 *
 * Usage:  node scripts/measure-trees.mjs
 * Writes: measurements/<today>-trees-brew-river.md
 *
 * The 3D view draws mapped trees as clay shapes, or none where the mapping is
 * too sparse to mean anything: a dozen trees drawn among hundreds that are
 * really there would say the rest is open ground. This counts what is mapped
 * within 700 m of the calibration venue, the reach the 3D view loads.
 */
import { writeFileSync } from 'node:fs'
import { OVERPASS_URL } from '../src/lib/overpass.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { treesQuery, TREE_BOX_METERS, SPARSE_TREES } from '../src/lib/trees.ts'

const at = { lat: Number(CALIBRATION_VENUE.latitude), lon: Number(CALIBRATION_VENUE.longitude) }
const query = treesQuery(at)
const res = await fetch(OVERPASS_URL, { method: 'POST', body: new URLSearchParams({ data: query }), headers: { 'User-Agent': 'ScoutNGo measurement (github.com/Jwillyah/scoutngo)' } })
if (!res.ok) {
  console.log(`could not look: Overpass answered ${res.status}`)
  process.exit(2)
}
const json = await res.json()
const counts = {}
for (const e of json.elements ?? []) {
  const kind = `${e.type} ${e.tags?.natural ?? e.tags?.landuse ?? '?'}`
  counts[kind] = (counts[kind] ?? 0) + 1
}
const trees = counts['node tree'] ?? 0
const lines = [
  '# Mapped trees at the example venue',
  '',
  `Run: ${new Date().toISOString()} · node scripts/measure-trees.mjs · ${OVERPASS_URL}`,
  `Box: ${TREE_BOX_METERS} m around ${at.lat}, ${at.lon} (the calibration venue, Brew River Dock Bar, Salisbury MD)`,
  '',
  '| what | count |',
  '|---|---|',
  ...Object.entries(counts).map(([k, v]) => `| ${k} | ${v} |`),
  '',
  `Single trees mapped: ${trees}. Sparse below ${SPARSE_TREES}: ${trees < SPARSE_TREES ? 'yes, so the 3D view draws no trees here' : 'no, so the 3D view draws them'}.`,
  '',
]
const out = `measurements/${new Date().toISOString().slice(0, 10)}-trees-brew-river.md`
writeFileSync(out, lines.join('\n'))
console.log(lines.join('\n'))
