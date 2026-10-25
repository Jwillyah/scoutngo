/*
 * SUGGEST AT ATLANTIC PARK WITH "I HAVE LAANC HERE" ON.
 *
 * Usage:  node scripts/measure-suggest-laanc.mjs [overpass-url]
 * Writes: measurements/<today>-suggest-atlantic-park-laanc.md
 * Exits:  0 when drone picks appear and none is above the facility map's
 *         ceiling at its own position; 1 when that fails; 2 when it could not
 *         look (Overpass down, no ceiling found).
 *
 * WHY. The switch exists so a shooter with LAANC at a venue gets drone spots
 * instead of having every one dropped for controlled airspace. With it off, all
 * 72 drone candidates at Atlantic Park were dropped (the NAS Oceana Class D
 * surface area covers the venue: see measure-suggest.mjs). With it on, they
 * must come back, and none may be planned above the grid ceiling of the square
 * it would fly in.
 *
 * TWO RUNS, BECAUSE BOTH ARE REAL. Ground and air together, the default; and
 * drone only, which is what the Drone chip asks for. With both, ground spots
 * can take all five picks on light alone, which is a true answer and not a
 * failure of the switch, so the drone-only run is the one that must show drone
 * picks. The same code the app runs: the engine, the kit, the queries, the
 * baked facility map, class airspace, restricted areas and park units.
 */
import { writeFileSync } from 'node:fs'
import { DEFAULT_KIT } from '../src/core/kit.ts'
import { DEFAULT_ALTITUDE_FEET } from '../src/core/air.ts'
import { RADIUS_DEFAULT_METERS } from '../src/core/radius.ts'
import { getSunPosition } from '../src/core/sun.ts'
import { suggestPositions } from '../src/core/suggest.ts'
import { airspaceAt, decodeShape } from '../src/core/airspaceLookup.ts'
import { decodeParkUnit, decodeSpecialUse } from '../src/core/restrictions.ts'
import { applyAmendments } from '../src/lib/kitAmendments.ts'
import { defaultSelection } from '../src/lib/kitSelection.ts'
import { bagOptics, summarise, SUBJECT_AIM_METERS, DATA_MARGIN_METERS } from '../src/lib/suggestRun.ts'
import { buildBuildingsQuery, parseBuildings } from '../src/lib/buildings.ts'
import { buildQuery, parseOverpass } from '../src/lib/overpass.ts'
import { facilityCellAt, facilityEffective } from '../src/lib/uasfm.ts'
import { boxAround } from '../src/lib/tileRange.ts'
import { AIRSPACE_SHAPES, AIRSPACE_COORD_PRECISION } from '../src/data/airspace.ts'
import { PARK_UNITS, RESTRICTIONS_COORD_PRECISION, SPECIAL_USE } from '../src/data/restrictions.ts'
import { DEFAULT_UNITS } from '../src/lib/units.ts'

const ENDPOINT = process.argv[2] ?? 'https://overpass-api.de/api/interpreter'
const VENUE = { lat: 36.8465792, lon: -75.9766619, name: 'Atlantic Park Surf, Virginia Beach' }
const TZ = 'America/New_York'

const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
const offsetHours = Number(
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' })
    .formatToParts(new Date(`${today}T17:00:00Z`))
    .find((p) => p.type === 'timeZoneName')
    ?.value.replace('GMT', '') ?? 'NaN',
)
if (!Number.isFinite(offsetHours)) {
  console.log(`=== LAANC MEASUREMENT ABORTED: could not read the ${TZ} offset ===`)
  process.exit(2)
}
const [y, m, d] = today.split('-').map(Number)
const shoot = new Date(Date.UTC(y, m - 1, d, 17 - offsetHours, 0))

const profile = applyAmendments(DEFAULT_KIT, [], []).profile
const bag = defaultSelection(profile, ['sony-75-300'])
const optics = bagOptics(profile, bag)

const box = boxAround(VENUE, RADIUS_DEFAULT_METERS + DATA_MARGIN_METERS)
const bounds = { west: box.west, south: box.south, east: box.east, north: box.north }

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
      if (response.ok) return response.json()
      last = `HTTP ${response.status}`
    } catch (error) {
      last = error.message
    }
  }
  throw new Error(`${ENDPOINT} did not answer after three tries: ${last}`)
}

let buildings
let site
try {
  buildings = parseBuildings(await overpass(buildBuildingsQuery(bounds)))
  site = parseOverpass(await overpass(buildQuery(bounds)))
} catch (error) {
  console.log(`=== LAANC MEASUREMENT ABORTED: ${error.message} ===`)
  process.exit(2)
}
if (buildings.length === 0) {
  console.log('=== LAANC MEASUREMENT ABORTED: no buildings came back, so line of sight would not be tested ===')
  process.exit(2)
}

const ceilingAt = (p) => facilityCellAt(p.lat, p.lon)?.ceilingFeet ?? null
const venueCeiling = ceilingAt(VENUE)
if (venueCeiling === null) {
  console.log('=== LAANC MEASUREMENT ABORTED: the facility map has no cell at the venue ===')
  process.exit(2)
}

const airspace = AIRSPACE_SHAPES.map((s) => decodeShape(s, AIRSPACE_COORD_PRECISION))
const specialUse = SPECIAL_USE.map((s) => decodeSpecialUse(s, RESTRICTIONS_COORD_PRECISION)).filter((s) => s !== null)
const parks = PARK_UNITS.map((p) => decodeParkUnit(p, RESTRICTIONS_COORD_PRECISION))
const sun = getSunPosition(shoot, VENUE.lat, VENUE.lon)

const run = (platforms, laancOn) =>
  suggestPositions({
    subject: VENUE,
    subjectHeightMeters: SUBJECT_AIM_METERS,
    subjectWidthMeters: null,
    reach: { centre: VENUE, radiusMeters: RADIUS_DEFAULT_METERS },
    optics,
    platforms,
    airAltitudeFeet: DEFAULT_ALTITUDE_FEET,
    sun,
    footprints: buildings.map((b) => ({ id: b.id, ring: b.ring, heightMeters: b.height.metres })),
    water: site.land.water,
    coastline: site.land.coastline ?? [],
    airspace,
    specialUse,
    parks,
    laanc: { enabled: laancOn, ceilingAt },
    marks: [],
    date: today,
  })

const cases = [
  { label: 'Ground and air, LAANC off (as before)', result: run(['ground', 'air'], false) },
  { label: 'Ground and air, LAANC on', result: run(['ground', 'air'], true) },
  { label: 'Drone only, LAANC on', result: run(['air'], true) },
]

let failures = 0
const lines = [
  `# Suggest at ${VENUE.name}, with "I have LAANC here" on`,
  '',
  `**Date:** ${today}`,
  `**Script:** \`scripts/measure-suggest-laanc.mjs\``,
  `**Overpass endpoint:** ${ENDPOINT}`,
  `**Subject:** ${VENUE.lat}, ${VENUE.lon}`,
  `**Shoot time:** ${shoot.toISOString()} (17:00 ${TZ}); sun azimuth ${sun.azimuth.toFixed(1)}°, altitude ${sun.altitude.toFixed(1)}°`,
  `**Airspace over the subject:** ${airspaceAt(airspace, VENUE).map((a) => `${a.name} (Class ${a.cls})`).join(', ')}`,
  `**Facility map ceiling at the subject:** ${venueCeiling} ft (chart effective ${facilityEffective})`,
  `**Planned altitude cap:** ${DEFAULT_ALTITUDE_FEET} ft; the drone flies lower where that frames the subject`,
  `**Buildings:** ${buildings.length} footprints, ${buildings.filter((b) => b.height.metres !== null).length} with a height or levels tag`,
  '',
]

for (const { label, result } of cases) {
  const summary = summarise(result, DEFAULT_UNITS)
  const drones = result.picked.filter((c) => c.platform === 'air')
  lines.push(`## ${label}`, '', `${result.considered} candidates, ${result.survivors} survived.`, '')
  lines.push('| step | dropped |', '|---|---|', ...summary.drops.map((s) => `| ${s.step} | ${s.count} |`), '')
  lines.push('Picked:', '')
  result.picked.forEach((c, i) => {
    const ceiling = c.platform === 'air' ? ceilingAt(c.at) : null
    const over = c.platform === 'air' && ceiling !== null && c.altitudeFeet > ceiling
    if (over) failures += 1
    lines.push(
      `${i + 1}. ${summary.picked[i]}` +
        (c.platform === 'air' ? ` (flying ${c.altitudeFeet} ft, grid ceiling here ${ceiling ?? 'none'} ft${over ? ', ABOVE THE CEILING' : ''})` : '') +
        ` at ${c.at.lat.toFixed(6)}, ${c.at.lon.toFixed(6)}`,
    )
  })
  lines.push('', `Drone picks: ${drones.length}. Highest drone pick: ${drones.length === 0 ? 'none' : `${Math.max(...drones.map((c) => c.altitudeFeet))} ft`}.`, '')
}

const droneOnly = cases[2].result.picked.filter((c) => c.platform === 'air')
if (droneOnly.length === 0) failures += 1
lines.push(
  '## Result',
  '',
  droneOnly.length === 0
    ? 'FAILED: no drone picks appeared with the switch on.'
    : `${droneOnly.length} drone picks with the switch on, none above the grid ceiling at its own position. ` +
        `Highest: ${Math.max(...droneOnly.map((c) => c.altitudeFeet))} ft against a ${venueCeiling} ft ceiling at the subject.`,
  '',
)

const file = `measurements/${today}-suggest-atlantic-park-laanc.md`
writeFileSync(file, lines.join('\n'))
console.log(lines.join('\n'))
console.log(`written to ${file}`)
if (failures > 0) {
  console.log(`=== LAANC MEASUREMENT FAILED: ${failures} problem(s) ===`)
  process.exit(1)
}
