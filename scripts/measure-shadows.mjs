/*
 * IS THE SOUTH BANK OF THE WICOMICO IN SUN AT NOON?
 *
 * Usage:  node scripts/measure-shadows.mjs
 * Writes: measurements/<today>-shadows-brew-river.md
 *
 * WHY. The shadow map (src/core/shadowMap.ts) draws every building's shadow
 * from its footprint and height. The check the brief set: at Brew River Dock
 * Bar at noon the south bank is in sun. At solar noon in late October the sun
 * is due south, so shadows fall north, and the only things that can shade the
 * south bank are buildings on the south bank itself. This runs the real map
 * code on real OpenStreetMap buildings and records the answer, either way.
 *
 * THE SAME CODE THE APP RUNS: the buildings query and parser from
 * src/lib/buildings.ts, the water from src/lib/overpass.ts, the sun from
 * src/core/sun.ts, the shadows from src/core/shadowMap.ts.
 *
 * WHERE THE SOUTH BANK IS, found rather than assumed: from the venue, walk
 * south at ten east-west offsets until the line has crossed OSM's water and
 * come out on land, then step 15 m inland. A point that cannot be found that
 * way is reported as such, not invented.
 */
import { writeFileSync } from 'node:fs'
import { getTimes } from 'suncalc'
import { buildBuildingsQuery, parseBuildings } from '../src/lib/buildings.ts'
import { buildQuery, parseOverpass } from '../src/lib/overpass.ts'
import { boxAround } from '../src/lib/tileRange.ts'
import { getSunPosition } from '../src/core/sun.ts'
import { destinationPoint } from '../src/core/geo.ts'
import { isInWater } from '../src/core/siting.ts'
import { pointInShadow, shadowMap } from '../src/core/shadowMap.ts'
import { localNoon } from '../src/core/milkyWay.ts'

const ENDPOINT = 'https://overpass-api.de/api/interpreter'
const VENUE = { lat: 38.364236, lon: -75.605912, name: 'Brew River Dock Bar, Salisbury MD' }
const DATE = '2026-10-26'
const TZ = 'America/New_York'
const RADIUS = 400
const INLAND_METERS = 15

async function overpass(query) {
  let last = ''
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 20_000))
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=UTF-8', 'user-agent': 'scoutngo-measure/1.0' },
        body: query,
        signal: AbortSignal.timeout(60_000),
      })
      const text = await response.text()
      if (response.ok && text.startsWith('{')) return JSON.parse(text)
      last = `HTTP ${response.status}`
    } catch (error) {
      last = error.message
    }
  }
  console.log(`=== SHADOW MEASUREMENT ABORTED: ${ENDPOINT} did not answer after three tries: ${last} ===`)
  process.exit(2)
}

/*
 * RIVERS ARE OFTEN RELATIONS, NOT WAYS. The Wicomico here is three multipolygon
 * relations (the river and its North and South Prongs), and the app's site
 * query reads water WAYS only, so it returns none of them. This script fetches
 * the relations' full geometry and joins their member ways into rings. The
 * gap in src/lib/overpass.ts is reported, not patched here.
 */
function stitch(lines) {
  const key = (p) => `${p[0]},${p[1]}`
  const pool = lines.filter((l) => l.length >= 2).map((l) => [...l])
  const rings = []
  while (pool.length > 0) {
    let ring = pool.shift()
    for (let guard = 0; guard < 10_000 && key(ring[0]) !== key(ring[ring.length - 1]); guard++) {
      const end = key(ring[ring.length - 1])
      const i = pool.findIndex((l) => key(l[0]) === end || key(l[l.length - 1]) === end)
      if (i === -1) break
      const next = pool.splice(i, 1)[0]
      ring = ring.concat(key(next[0]) === end ? next.slice(1) : [...next].reverse().slice(1))
    }
    if (ring.length >= 4 && key(ring[0]) === key(ring[ring.length - 1])) rings.push(ring)
  }
  return rings
}

function relationWater(payload) {
  const polygons = []
  for (const rel of payload.elements ?? []) {
    if (rel.type !== 'relation') continue
    const ways = (role) =>
      (rel.members ?? [])
        .filter((m) => m.type === 'way' && m.role === role && Array.isArray(m.geometry))
        .map((m) => m.geometry.map((g) => [g.lon, g.lat]))
    const inners = stitch(ways('inner'))
    for (const outer of stitch(ways('outer'))) polygons.push([outer, ...inners])
  }
  return polygons
}

const box = boxAround(VENUE, RADIUS)
const bounds = { west: box.west, south: box.south, east: box.east, north: box.north }
const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`
const buildings = parseBuildings(await overpass(buildBuildingsQuery(bounds)))
await new Promise((r) => setTimeout(r, 5000))
const site = parseOverpass(await overpass(buildQuery(bounds)))
await new Promise((r) => setTimeout(r, 5000))
const rivers = relationWater(await overpass(`[out:json][timeout:60];rel["natural"="water"](${bbox});out geom;`))
const water = [...site.land.water, ...rivers]

if (buildings.length === 0) {
  console.log('=== SHADOW MEASUREMENT ABORTED: no buildings came back, so there is nothing to cast a shadow ===')
  process.exit(2)
}
if (water.length === 0) {
  console.log('=== SHADOW MEASUREMENT ABORTED: no water polygons came back, so the south bank cannot be found ===')
  process.exit(2)
}

const noon = getTimes(localNoon(DATE, TZ), VENUE.lat, VENUE.lon).solarNoon
const sun = getSunPosition(noon, VENUE.lat, VENUE.lon)
const map = shadowMap(
  buildings.map((b) => ({ id: b.id, ring: b.ring, heightMeters: b.height.metres })),
  sun,
)
if (map.status !== 'ok') {
  console.log(`=== SHADOW MEASUREMENT ABORTED: ${map.reason} ===`)
  process.exit(2)
}

/* Each offset: walk south across the water, out onto the far bank. */
const rows = []
for (let offset = -90; offset <= 90; offset += 20) {
  const start = destinationPoint(VENUE, offset < 0 ? 270 : 90, Math.abs(offset))
  let seenWater = false
  let bank = null
  for (let m = 0; m <= 400; m += 5) {
    const p = destinationPoint(start, 180, m)
    const wet = isInWater(p, water)
    if (wet) seenWater = true
    else if (seenWater) {
      bank = destinationPoint(p, 180, INLAND_METERS)
      break
    }
  }
  if (bank === null) {
    rows.push({ offset, point: null, result: 'no water crossed within 400 m south, so no south bank here' })
    continue
  }
  const shade = pointInShadow(bank, map)
  rows.push({
    offset,
    point: bank,
    result: shade === null ? 'in sun (no mapped building with a known height shades it)' : `in shadow of building ${shade}`,
  })
}

const found = rows.filter((r) => r.point !== null)
const shaded = found.filter((r) => r.result.startsWith('in shadow'))
const withHeight = buildings.filter((b) => b.height.metres !== null).length
const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
const verdict =
  found.length === 0
    ? 'NOT CHECKED: no south bank point could be located from the water data.'
    : shaded.length === 0
      ? `The south bank is in sun at solar noon: ${found.length} of ${found.length} bank points are outside every mapped shadow.`
      : `${shaded.length} of ${found.length} south bank points are in a mapped shadow at solar noon.`

const lines = [
  `# Shadows at ${VENUE.name}, solar noon`,
  '',
  `**Date:** ${today}`,
  '**Script:** `scripts/measure-shadows.mjs`',
  `**Overpass endpoint:** ${ENDPOINT}`,
  `**Venue:** ${VENUE.lat}, ${VENUE.lon}`,
  `**Shoot date:** ${DATE}, solar noon ${noon.toISOString()}`,
  `**Sun:** azimuth ${sun.azimuth.toFixed(1)} degrees, altitude ${sun.altitude.toFixed(1)} degrees`,
  `**Buildings in a ${RADIUS} m box:** ${buildings.length}, of which ${withHeight} have a height or levels tag and cast a shadow; ${map.skippedNoHeight} have none and cast nothing`,
  `**Water polygons:** ${site.land.water.length} from water ways, ${rivers.length} stitched from river relations`,
  `**Longest shadow:** ${Math.max(...map.shadows.map((s) => s.lengthMeters)).toFixed(1)} m`,
  `**South bank points:** walked south from the venue at each east-west offset until past OSM water, then ${INLAND_METERS} m inland`,
  '',
  `## ${verdict}`,
  '',
  '| offset east (m) | bank point | result |',
  '|---|---|---|',
  ...rows.map((r) => `| ${r.offset} | ${r.point === null ? 'none' : `${r.point.lat.toFixed(6)}, ${r.point.lon.toFixed(6)}`} | ${r.result} |`),
  '',
  'In sun here means outside every shadow of a MAPPED building with a known height. Trees, awnings and buildings OSM gives no height for are not in this check.',
  '',
]
const file = `measurements/${today}-shadows-brew-river.md`
writeFileSync(file, lines.join('\n'))
console.log(lines.join('\n'))
console.log(`written to ${file}`)
