/*
 * ADDRESSES AND PLACE NAMES IN THE SPOT SEARCH (Batch SIMPLE-1, Section 2).
 *
 * Usage:  node scripts/measure-search-address.mjs --record   (asks the live services, writes the fixture)
 *         node scripts/measure-search-address.mjs            (replays the fixture, nothing asked)
 * Writes: tests/fixtures/search-address.json (with --record)
 *         measurements/<today>-search-address.md
 *
 * Each query goes through the spot picker's own path (tests/searchAddressRun.ts):
 * the words parsed, our spots searched, Photon then Nominatim asked with the
 * typed words and nothing else, the answer ranked. The first result is held
 * against a truth that is not OpenStreetMap: the local government's address
 * point for an address (within TOLERANCE metres), the boundary of the place
 * for a name (PAD-US 4.1 for the parks and the refuge, TIGERweb for the
 * town). Recording asks Nominatim no faster than one a second (the app's own
 * clock in src/lib/search.ts, and a pause between queries) with a User-Agent
 * naming this run.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const { runPicker, insidePolygons, nearestVertexMeters, replayFetch } = await import('../tests/searchAddressRun.ts')
const { distanceMeters } = await import('../src/core/geo.ts')
const { markNominatim } = await import('../src/lib/search.ts')

const FIXTURE = new URL('../tests/fixtures/search-address.json', import.meta.url)
const TOLERANCE = 150
const UA = 'ScoutNGo (+https://github.com/Jwillyah/scoutngo)'
const record = process.argv.includes('--record')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/*
 * Ten addresses, two a town; the Pinner St pair from the report and three with
 * a name typed in front; five place names. Each address's truth is the local
 * government's own address point: VGIN's statewide Virginia Address Points
 * (the cities' own points, merged), New Hanover County's addressing layer,
 * Wicomico County's address points (the City of Salisbury's GIS). One point a
 * case, no unit, or the run stops. The Census geocoder's point is kept beside
 * it for reference: it is interpolated along the street.
 */
const VGIN = ['VGIN Virginia Address Points', 'https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Address_Points/FeatureServer/0/query']
const NHC = ['New Hanover County GIS addressing', 'https://gis.nhcgov.com/server/rest/services/Layers/Addressing/FeatureServer/0/query']
const WICO = ['Wicomico County address points (City of Salisbury GIS)', 'https://services6.arcgis.com/Hx8jJ6McXQ0jnqLk/arcgis/rest/services/Wicomico_Address_Points/FeatureServer/1/query']
const ADDRESSES = [
  ['2401 Courthouse Dr, Virginia Beach, VA 23456', '2401 Courthouse Dr, Virginia Beach, VA 23456', VGIN, "ADDRNUM = '2401' AND STREET_NAME = 'COURTHOUSE' AND MUNICIPALITY = 'Virginia Beach City'"],
  ['717 General Booth Blvd, Virginia Beach', '717 General Booth Blvd, Virginia Beach, VA 23451', VGIN, "ADDRNUM = '717' AND STREET_NAME = 'GENERAL BOOTH' AND MUNICIPALITY = 'Virginia Beach City'"],
  ['425 E Pinner St, Suffolk', '425 E Pinner St, Suffolk, VA 23434', VGIN, "ADDRNUM = '425' AND STREET_NAME = 'PINNER' AND MUNICIPALITY = 'Suffolk City'"],
  ['Pub, 425 E Pinner St, Suffolk, VA 23434', '425 E Pinner St, Suffolk, VA 23434', VGIN, "ADDRNUM = '425' AND STREET_NAME = 'PINNER' AND MUNICIPALITY = 'Suffolk City'"],
  ['442 W Washington St, Suffolk, VA', '442 W Washington St, Suffolk, VA 23434', VGIN, "ADDRNUM = '442' AND STREET_NAME = 'WASHINGTON' AND MUNICIPALITY = 'Suffolk City'"],
  ["Joe's Pizza, 442 W Washington St, Suffolk", '442 W Washington St, Suffolk, VA 23434', VGIN, "ADDRNUM = '442' AND STREET_NAME = 'WASHINGTON' AND MUNICIPALITY = 'Suffolk City'"],
  ['810 Union St, Norfolk, VA 23510', '810 Union St, Norfolk, VA 23510', VGIN, "ADDRNUM = '810' AND STREET_NAME = 'UNION' AND MUNICIPALITY = 'Norfolk City'"],
  ['245 W Olney Rd, Norfolk', '245 W Olney Rd, Norfolk, VA 23510', VGIN, "ADDRNUM = '245' AND STREET_NAME = 'OLNEY' AND MUNICIPALITY = 'Norfolk City'"],
  ['102 N 3rd St, Wilmington, NC 28401', '102 N 3rd St, Wilmington, NC 28401', NHC, "NUMBER = 102 AND STREET = '3RD' AND DIR_ABBR = 'N' AND INCMUNI = 'WILMINGTON'"],
  ['Blue Heron Coffee Roasters, 102 N 3rd St, Wilmington, NC', '102 N 3rd St, Wilmington, NC 28401', NHC, "NUMBER = 102 AND STREET = '3RD' AND DIR_ABBR = 'N' AND INCMUNI = 'WILMINGTON'"],
  ['310 Chestnut St, Wilmington, NC', '310 Chestnut St, Wilmington, NC 28401', NHC, "NUMBER = 310 AND STREET = 'CHESTNUT' AND INCMUNI = 'WILMINGTON'"],
  ['125 N Division St, Salisbury, MD 21801', '125 N Division St, Salisbury, MD 21801', WICO, "add_number = 125 AND st_name = 'DIVISION' AND inc_muni = 'Salisbury' AND unit IS NULL"],
  ['909 S Schumaker Dr, Salisbury, MD', '909 S Schumaker Dr, Salisbury, MD 21804', WICO, "add_number = 909 AND st_name = 'SCHUMAKER' AND inc_muni = 'Salisbury' AND unit IS NULL"],
]
const PADUS = 'https://edits.nationalmap.gov/arcgis/rest/services/PAD-US/PAD_US_4_1/MapServer/0/query'
const TIGER_PLACES = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4/query'
const AREA = { geometry: '-77.9,34.1,-75.0,38.4', geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' }
const PLACES = [
  ['Norfolk Botanical Garden', 'PAD-US 4.1 fee unit "Botanical Gardens" (Norfolk, VA)', PADUS, { where: "Unit_Nm = 'Botanical Gardens' AND State_Nm = 'VA'", ...AREA }],
  ['Wrightsville Beach', 'TIGERweb incorporated place "Wrightsville Beach town", NC', TIGER_PLACES, { where: "BASENAME = 'Wrightsville Beach' AND STATE = '37'" }],
  ['Assateague', 'PAD-US 4.1 fee unit "Assateague Island National Seashore" (MD, VA)', PADUS, { where: "Unit_Nm = 'Assateague Island National Seashore'", ...AREA }],
  /* The swamp's public land: the federal refuge (VA, NC) and North Carolina's state park, both in the swamp. */
  ['Great Dismal Swamp', 'PAD-US 4.1 fee units "Great Dismal Swamp National Wildlife Refuge" (VA, NC) and "Dismal Swamp State Park" (NC)', PADUS, { where: "Unit_Nm IN ('Great Dismal Swamp National Wildlife Refuge', 'Dismal Swamp State Park')", ...AREA }],
  ['First Landing State Park', 'PAD-US 4.1 fee unit "First Landing State Park" (VA)', PADUS, { where: "Unit_Nm = 'First Landing State Park'", ...AREA }],
]

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!r.ok) throw new Error(`${r.status} from ${url}`)
  return r.json()
}

/*
 * --before=<src>: the same queries through an older tree's picker path (its
 * parseQuery, ownSpots, geocodeWords and rankResults), live, for the table of
 * what it did. <src> is that tree's src/, e.g. from `git archive 3db2f29 src`.
 * Writes measurements/<today>-search-address-before.md.
 */
const beforeArg = process.argv.find((a) => a.startsWith('--before='))
if (beforeArg !== undefined) {
  const src = beforeArg.slice('--before='.length).replace(/\/$/, '')
  const old = await import(`${src}/core/spotSearch.ts`)
  const { geocodeWords } = await import(`${src}/lib/spotSearchData.ts`)
  const { PICKER_SPOTS } = await import('../src/lib/spotSearchData.ts')
  const fx = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  const realFetch = globalThis.fetch
  const sent = []
  globalThis.fetch = (input, init) => {
    sent.push(String(input))
    return realFetch(input, { ...init, headers: { ...(init?.headers ?? {}), 'User-Agent': UA } })
  }
  const lines = []
  for (const c of fx.cases) {
    sent.length = 0
    const q = old.parseQuery(c.query)
    const own = old.ownSpots(q, null, PICKER_SPOTS, old.localPool([], []))
    const answer = await geocodeWords(q.geocoderText)
    const rows = answer.status === 'ok' ? answer.rows : []
    const results = old.rankResults(q, own, rows, null)
    const top = results[0]
    const right = top === undefined ? 'nothing' : c.kind === 'address' ? `${Math.round(distanceMeters(top.at, c.truth.at))} m` : insidePolygons(top.at, c.truth.polygons) ? 'inside' : 'outside'
    lines.push(`| ${c.query} | ${answer.status} | ${rows.length} | ${results.length} | ${top === undefined ? 'nothing ("Nothing found by that name.")' : `${top.name} [${top.group}]`} | ${right} | ${sent.map((u) => new URL(u).hostname.split('.')[0]).join(', ')} |`)
    await sleep(1100)
  }
  const day = new Date().toISOString().slice(0, 10)
  const out = [
    '# The spot search before Batch SIMPLE-1, Section 2: addresses and place names',
    '',
    `Run: \`node scripts/measure-search-address.mjs --before=${src}\`, ${new Date().toISOString()}, live against photon.komoot.io and nominatim.openstreetmap.org (User-Agent "${UA}"). The older tree's own parseQuery, ownSpots, geocodeWords and rankResults, in the spot picker's order, first run (no position); the picker's spots from this tree (the same lists, moved). Queries and truths from tests/fixtures/search-address.json.`,
    '',
    '| Query | Geocoders | Rows they gave | Results shown | First result | Against the truth | Asked |',
    '|---|---|---|---|---|---|---|',
    ...lines,
    '',
  ]
  const path = `measurements/${day}-search-address-before.md`
  writeFileSync(new URL(`../${path}`, import.meta.url), out.join('\n'))
  console.log(out.join('\n'))
  console.log(`wrote ${path}`)
  process.exit(0)
}

let fixture
if (record) {
  const realFetch = globalThis.fetch
  const cases = []
  for (const [query, census, [source, base], where] of ADDRESSES) {
    const url = `${base}?${new URLSearchParams({ where, outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'json' })}`
    const pts = (await getJson(url)).features ?? []
    if (pts.length !== 1) throw new Error(`${source} has ${pts.length} points for ${query}`)
    const censusUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${new URLSearchParams({ address: census, benchmark: 'Public_AR_Current', format: 'json' })}`
    const m = (await getJson(censusUrl)).result.addressMatches
    if (m.length !== 1) throw new Error(`Census matched ${m.length} for ${census}`)
    cases.push({ query, kind: 'address', truth: { source, url, at: { lat: pts[0].geometry.y, lon: pts[0].geometry.x }, matched: census, census: { url: censusUrl, at: { lat: m[0].coordinates.y, lon: m[0].coordinates.x }, matched: m[0].matchedAddress } }, responses: {} })
  }
  for (const [query, source, base, params] of PLACES) {
    const url = `${base}?${new URLSearchParams({ ...params, returnGeometry: 'true', outSR: '4326', maxAllowableOffset: '0.0003', outFields: 'OBJECTID', f: 'json' })}`
    const d = await getJson(url)
    /* One polygon a record: PAD-US lists a unit once per manager, and two copies of one ring cancel under even-odd. */
    const polygons = (d.features ?? []).map((f) => (f.geometry?.rings ?? []).map((ring) => ring.map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))])))
    if (polygons.length === 0) throw new Error(`no boundary for ${query}: ${JSON.stringify(d).slice(0, 200)}`)
    cases.push({ query, kind: 'place', truth: { source, url, polygons, name: query }, responses: {} })
  }
  /* Now the app's own path against the live geocoders, every answer kept under the URL that asked it. */
  for (const c of cases) {
    globalThis.fetch = async (input, init) => {
      const href = String(input)
      const r = await realFetch(input, { ...init, headers: { ...(init?.headers ?? {}), 'User-Agent': UA } })
      const body = await r.json()
      c.responses[href] = body
      return new Response(JSON.stringify(body), { status: r.status, headers: { 'Content-Type': 'application/json' } })
    }
    await runPicker(c.query)
    console.log(`recorded ${c.query}: ${Object.keys(c.responses).length} answers`)
    await sleep(1100)
  }
  globalThis.fetch = realFetch
  fixture = { recorded: new Date().toISOString(), userAgent: UA, toleranceMeters: TOLERANCE, cases }
  mkdirSync(new URL('../tests/fixtures/', import.meta.url), { recursive: true })
  writeFileSync(FIXTURE, `${JSON.stringify(fixture)}\n`)
} else {
  fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'))
}

/* The table: replayed from the fixture, as the test runs it. */
const asked = []
globalThis.fetch = replayFetch(fixture.cases, asked)
const rows = []
let right = 0
const ll = (at) => `${at.lat.toFixed(5)}, ${at.lon.toFixed(5)}`
for (const c of fixture.cases) {
  markNominatim(0)
  asked.length = 0
  const run = await runPicker(c.query)
  const top = run.results[0]
  let verdict = 'nothing'
  let far = '-'
  if (top !== undefined && c.kind === 'address') {
    const m = distanceMeters(top.at, c.truth.at)
    far = `${Math.round(m)} m (Census point: ${Math.round(distanceMeters(top.at, c.truth.census.at))} m)`
    verdict = m <= fixture.toleranceMeters ? 'yes' : 'NO'
  } else if (top !== undefined) {
    const inside = insidePolygons(top.at, c.truth.polygons)
    far = inside ? 'inside' : `outside, ${Math.round(nearestVertexMeters(top.at, c.truth.polygons))} m from the boundary`
    verdict = inside ? 'yes' : 'NO'
  }
  if (verdict === 'yes') right += 1
  const sent = asked.map((u) => `${new URL(u).hostname.split('.')[0]} "${new URL(u).searchParams.get('q')}"`).join(' → ')
  const truth = c.kind === 'address' ? `${c.truth.source} (${ll(c.truth.at)})` : c.truth.source
  rows.push(`| ${c.query} | ${top === undefined ? 'nothing' : `${top.name}${top.where === '' ? '' : `, ${top.where}`} [${top.group}] (${ll(top.at)})`} | ${far} | ${verdict} | ${truth} | ${sent} |`)
}

const day = new Date().toISOString().slice(0, 10)
const out = [
  '# Addresses and place names in the spot search (Batch SIMPLE-1, Section 2)',
  '',
  `Run: \`node scripts/measure-search-address.mjs\`, ${new Date().toISOString()}, replaying tests/fixtures/search-address.json (recorded ${fixture.recorded} from photon.komoot.io and nominatim.openstreetmap.org, User-Agent "${fixture.userAgent}"). Path: tests/searchAddressRun.ts, the spot picker's own calls (parseQuery, ownSpots over the picker's spots with no saved or cached spots, geoAsk, geocodeAsk, rankResults), first run: no position, so no distance sort. Only the typed words were sent: no lat, lon, viewbox or bias parameter in any URL asked. Right means, for an address, within ${fixture.toleranceMeters} m of the local government's address point (the Census geocoder's interpolated point is given beside it for reference); for a name, inside the boundary.`,
  '',
  `Right first: ${right} of ${fixture.cases.length}.`,
  '',
  '| Query | First result [group] (lat, lon) | Distance from truth | Right | Truth source | Asked, in order |',
  '|---|---|---|---|---|---|',
  ...rows,
  '',
]
const path = `measurements/${day}-search-address.md`
writeFileSync(new URL(`../${path}`, import.meta.url), out.join('\n'))
console.log(out.join('\n'))
console.log(`wrote ${path}`)
