/*
 * SUGGEST AT A REAL VENUE: WHAT IT PICKS, WHY, AND WHAT IT DROPPED AT EACH STEP.
 *
 * Usage:  node scripts/measure-suggest.mjs [overpass-url]
 * Writes: measurements/<today>-suggest-atlantic-park.md
 *
 * WHY THIS EXISTS. Suggest stopped asking a model where to stand and started
 * working it out (src/core/suggest.ts). The proof that it does something
 * sensible at a real place is a run at one, recorded: the candidates, the
 * count each step dropped, the picks with their reasons, the runners-up.
 *
 * THE SAME CODE THE APP RUNS. The engine, the optics from the kit, the
 * Overpass queries and their parsers, the airspace extract and the summary are
 * all imported from src/. Only the network endpoint can differ: the main
 * Overpass server was answering 502 when this was written, so the endpoint
 * is an argument and the file records which one answered.
 *
 * THE INPUTS ARE THE APP'S DEFAULTS at this venue: the shooter's kit with the
 * Sony 70-200 added and the 75-300 shelved (src/lib/kitAmendments.ts), the
 * default 400 m reach ring, the default 15:00 to 19:00 window scrubbed to its
 * middle, no subject size, terrain off. Each is recorded below.
 */
import { writeFileSync } from 'node:fs'
import { DEFAULT_KIT } from '../src/core/kit.ts'
import { DEFAULT_ALTITUDE_FEET } from '../src/core/air.ts'
import { RADIUS_DEFAULT_METERS } from '../src/core/radius.ts'
import { getSunPosition } from '../src/core/sun.ts'
import { suggestPositions } from '../src/core/suggest.ts'
import { applyAmendments } from '../src/lib/kitAmendments.ts'
import { defaultSelection } from '../src/lib/kitSelection.ts'
import { bagOptics, summarise, SUBJECT_AIM_METERS, DATA_MARGIN_METERS } from '../src/lib/suggestRun.ts'
import { buildBuildingsQuery, parseBuildings } from '../src/lib/buildings.ts'
import { buildQuery, parseOverpass } from '../src/lib/overpass.ts'
import { boxAround } from '../src/lib/tileRange.ts'
import { AIRSPACE_SHAPES, AIRSPACE_COORD_PRECISION } from '../src/data/airspace.ts'
import { airspaceAt, decodeShape } from '../src/core/airspaceLookup.ts'
import { DEFAULT_UNITS } from '../src/lib/units.ts'

const ENDPOINT = process.argv[2] ?? 'https://overpass-api.de/api/interpreter'
/* Atlantic Park Surf, as Photon returns it and as the fixed search now picks it. */
const VENUE = { lat: 36.8465792, lon: -75.9766619, name: 'Atlantic Park Surf, Virginia Beach' }
const TZ = 'America/New_York'

/* The default window on today's date: 15:00 to 19:00 venue time, scrubbed to 17:00. */
const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
/* 17:00 in New York, whatever zone this machine is in: the zone's own offset that day. */
const offsetHours = Number(
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' })
    .formatToParts(new Date(`${today}T17:00:00Z`))
    .find((p) => p.type === 'timeZoneName')
    ?.value.replace('GMT', '') ?? 'NaN',
)
if (!Number.isFinite(offsetHours)) {
  console.log(`=== SUGGEST MEASUREMENT ABORTED: could not read the ${TZ} offset ===`)
  process.exit(2)
}
const [y, m, d] = today.split('-').map(Number)
const shoot = new Date(Date.UTC(y, m - 1, d, 17 - offsetHours, 0))

const profile = applyAmendments(DEFAULT_KIT, [], []).profile
const shelved = ['sony-75-300']
const bag = defaultSelection(profile, shelved)
const optics = bagOptics(profile, bag)

const box = boxAround(VENUE, RADIUS_DEFAULT_METERS + DATA_MARGIN_METERS)
const bounds = { west: box.west, south: box.south, east: box.east, north: box.north }

/* A public server under load answers 502/504 now and then: three tries, spaced. */
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

let buildingsPayload
let sitePayload
try {
  buildingsPayload = await overpass(buildBuildingsQuery(bounds))
  sitePayload = await overpass(buildQuery(bounds))
} catch (error) {
  console.log(`=== SUGGEST MEASUREMENT ABORTED: ${error.message} ===`)
  process.exit(2)
}
const buildings = parseBuildings(buildingsPayload)
const site = parseOverpass(sitePayload)
const airspace = AIRSPACE_SHAPES.map((s) => decodeShape(s, AIRSPACE_COORD_PRECISION))
const overVenue = airspaceAt(airspace, VENUE)
if (buildings.length === 0) {
  console.log('=== SUGGEST MEASUREMENT ABORTED: no buildings came back, so line of sight would not be tested ===')
  process.exit(2)
}

const sun = getSunPosition(shoot, VENUE.lat, VENUE.lon)
const result = suggestPositions({
  subject: VENUE,
  subjectHeightMeters: SUBJECT_AIM_METERS,
  subjectWidthMeters: null,
  reach: { centre: VENUE, radiusMeters: RADIUS_DEFAULT_METERS },
  optics,
  platforms: ['ground', 'air'],
  airAltitudeFeet: DEFAULT_ALTITUDE_FEET,
  sun,
  footprints: buildings.map((b) => ({ id: b.id, ring: b.ring, heightMeters: b.height.metres })),
  water: site.land.water,
  coastline: site.land.coastline ?? [],
  airspace,
  marks: [],
  date: today,
})
const summary = summarise(result, DEFAULT_UNITS)
const withHeight = buildings.filter((b) => b.height.metres !== null).length

const lines = [
  `# Suggest at ${VENUE.name}`,
  '',
  `**Date:** ${today}`,
  `**Script:** \`scripts/measure-suggest.mjs ${process.argv[2] ?? ''}\``.replace(' `', '`'),
  `**Overpass endpoint:** ${ENDPOINT}`,
  `**Subject:** ${VENUE.lat}, ${VENUE.lon}`,
  `**Shoot time:** ${shoot.toISOString()} (17:00 ${TZ}, the middle of the default 15:00–19:00 window)`,
  `**Sun:** azimuth ${sun.azimuth.toFixed(1)}°, altitude ${sun.altitude.toFixed(1)}°`,
  `**Reach ring:** ${RADIUS_DEFAULT_METERS} m around the subject`,
  `**Bag:** ${optics.map((o) => o.name).join(', ')} (Sony 75-300 shelved)`,
  `**Subject size:** not set; terrain: off (the app defaults)`,
  `**Buildings:** ${buildings.length} footprints, ${withHeight} with a height or levels tag`,
  `**Airspace over the subject:** ${overVenue.length === 0 ? 'none in the extract' : overVenue.map((a) => `${a.name} (Class ${a.cls})`).join(', ')}`,
  `**Water polygons:** ${site.land.water.length}; **coastline ways:** ${(site.land.coastline ?? []).length}`,
  '',
  `## ${summary.considered} candidates, ${summary.survivors} survived`,
  '',
  '| step | dropped |',
  '|---|---|',
  ...summary.drops.map((d) => `| ${d.step} | ${d.count} |`),
  '',
  '## Picked',
  '',
  ...summary.picked.map((why, i) => {
    const c = result.picked[i]
    return `${i + 1}. ${why} — ${c.at.lat.toFixed(6)}, ${c.at.lon.toFixed(6)}`
  }),
  '',
  '## Runners-up',
  '',
  ...summary.runnersUp.map((line) => `- ${line}`),
  '',
  '## Notes the app shows',
  '',
  ...summary.notes.map((n) => `- ${n}`),
  '',
]
const file = `measurements/${today}-suggest-atlantic-park.md`
writeFileSync(file, lines.join('\n'))
console.log(lines.join('\n'))
console.log(`written to ${file}`)
