/*
 * EVERY SURF SPOT'S OCEAN BEACH AND FACING, FROM THE COASTLINE (Batch Beach,
 * Section 1).
 *
 * Usage:  node scripts/measure-spot-facing.mjs [--out measurements/<file>.md]
 * Reads:  live, public: OpenFreeMap's vector tiles (the map's own), through
 *         the app's own code: src/lib/coast.ts coastFacing, the open-sea
 *         test and the ocean side of a barrier island.
 *
 * For each spot in src/data/surfSpots.ts, and each candidate below (a point
 * near the spot, to be snapped): the side ('open', 'island', 'enclosed'),
 * the ocean beach point (the last land before the open sea along the
 * facing) and the facing there. And the Rodanthe pin of 10 Nov: the town's
 * own point, on the sound side.
 *
 * NOT IN THE GATE: it reaches live hosts.
 */
import { writeFileSync } from 'node:fs'

const mem = new Map()
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) }

const { setVectorLoader } = await import('../src/lib/vectorTiles.ts')
const { coastFacing, seaTestAround } = await import('../src/lib/coast.ts')
const { destinationPoint, distanceMeters } = await import('../src/core/geo.ts')
const { facingByNearest, WALK_STEP_M } = await import('../src/core/coastFacing.ts')
const { SURF_SPOTS } = await import('../src/data/surfSpots.ts')

setVectorLoader(async (url) => {
  const r = await fetch(url).catch(() => null)
  return r === null || !r.ok ? null : await r.arrayBuffer()
})

const args = process.argv.slice(2)
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : `measurements/${new Date().toISOString().slice(0, 10)}-spot-facing.md`

/* Near the spot, to be snapped to its ocean beach. Starting points: S-Turns at the coast cams list's own point for it (src/data/coastCams.ts 'nc-rodanthe-s-turns'); the others estimated by hand to within a kilometre or so, then moved to the waterline the tiles draw. The facing is always the tiles'. */
const CANDIDATES = [
  { id: 'rodanthe-town', name: 'Rodanthe (the town’s point, the 10 Nov pin)', at: { lat: 35.5935, lon: -75.4679 } },
  { id: 's-turns', name: 'S-Turns', at: { lat: 35.607, lon: -75.469 } },
  { id: 'mirlo-beach-south', name: 'Mirlo Beach (0.7 km south of S-Turns)', at: { lat: 35.6015, lon: -75.468 } },
  { id: 'rodanthe-pier', name: 'Rodanthe Pier', at: { lat: 35.5892, lon: -75.4637 } },
  { id: 'buxton', name: 'Buxton', at: { lat: 35.256, lon: -75.518 } },
  { id: 'cape-point', name: 'Cape Point', at: { lat: 35.221, lon: -75.53 } },
  { id: 'frisco-pier', name: 'Frisco Pier', at: { lat: 35.2268, lon: -75.633 } },
]

/* The last land point before the sea along `bearing` from `at` (the waterline), within 3 km. */
const waterline = async (at, bearing) => {
  const sea = await seaTestAround(at, 3200)
  if (sea === null) return null
  let last = sea(at) ? null : at
  for (let m = WALK_STEP_M; m <= 3000; m += WALK_STEP_M) {
    const p = destinationPoint(at, bearing, m)
    if (sea(p)) return last
    last = p
  }
  return null
}

const rows = []
const look = async (s) => {
  const f = await coastFacing(s.at)
  if (f === 'inland' || f === 'unavailable') return { ...s, side: f }
  const from = f.beachAt ?? s.at
  const edge = (await waterline(from, f.facing)) ?? from
  const sea = await seaTestAround(edge)
  const facing = sea === null ? f.facing : (facingByNearest(edge, sea) ?? f.facing)
  return { ...s, side: f.side, rawFacing: f.byCircle ?? f.facing, beach: edge, moved: Math.round(distanceMeters(s.at, edge)), facing: Math.round(facing) }
}
for (const s of SURF_SPOTS) rows.push({ src: 'list', listed: s.facing, ...(await look({ id: s.id, name: s.name, at: s.at })) })
for (const c of CANDIDATES) rows.push({ src: 'candidate', ...(await look(c)) })

const L = []
L.push('# Surf spots: the ocean beach and its facing, from the coastline')
L.push('')
L.push(`Run ${new Date().toISOString()} · \`node scripts/measure-spot-facing.mjs\` · OpenFreeMap vector tiles, live (the map's own), through src/lib/coast.ts coastFacing: the open-sea test 20, 60 and 120 km out on zoom-7 tiles, the ocean side across a barrier island within 3 km, then the waterline and the nearest-sea facing on zoom-12 tiles.`)
L.push('')
L.push('| spot | from | side | facing read at the point | ocean beach (lat, lon) | moved | facing there | listed facing |')
L.push('|---|---|---|---|---|---|---|---|')
for (const r of rows) {
  const b = r.beach ? `${r.beach.lat.toFixed(4)}, ${r.beach.lon.toFixed(4)}` : '—'
  L.push(`| ${r.name} | ${r.src} | ${r.side} | ${r.rawFacing === undefined ? '—' : Math.round(r.rawFacing) + '°'} | ${b} | ${r.moved === undefined ? '—' : r.moved + ' m'} | ${r.facing === undefined ? '—' : r.facing + '°'} | ${r.listed === undefined ? '—' : r.listed + '°'} |`)
}
writeFileSync(OUT, `${L.join('\n')}\n`)
console.log(L.join('\n'))
console.log(`wrote ${OUT}`)
