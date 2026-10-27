/*
 * BEFORE THE LIDAR IS BUILT ON: CAN A BROWSER READ IT, DOES IT COVER THE TWO
 * VENUES, AND DO ITS HEIGHTS AGREE WITH OURS?
 *
 * Usage:  node scripts/measure-lidar-stop.mjs
 * Writes: measurements/<today>-lidar-stop.md
 * Exits:  0 every condition met; 1 one failed (Phase 2 stops); 2 could not look.
 *
 * USGS 3DEP lidar as Entwine Point Tiles in the public bucket usgs-lidar-public
 * (s3-us-west-2.amazonaws.com), public domain. The conditions:
 *
 *   readable   HTTPS, no account, and CORS lets https://scoutngo.vercel.app
 *              read the coverage index, a project's ept.json and a point tile
 *              (Access-Control-Allow-Origin on a GET with that Origin).
 *              Nothing is proxied through our server.
 *   coverage   the projects whose boundary holds Virginia Beach Fishing Pier
 *              and Brew River Dock Bar (the index hobuinc/usgs-lidar keeps),
 *              with the year in each project's name.
 *   datum      horizontal: the project's srs; vertical: the ground points
 *              (class 2) along a line from each venue against our Terrarium
 *              elevation at the same spots, within 1 m on the beach.
 */
import { writeFileSync } from 'node:fs'
import { createLazPerf } from 'laz-perf'
import { groundAlong } from './lidarProbe.mjs'

const ORIGIN = 'https://scoutngo.vercel.app'
const INDEX = 'https://raw.githubusercontent.com/hobuinc/usgs-lidar/master/boundaries/resources.geojson'
const BUCKET = 'https://s3-us-west-2.amazonaws.com/usgs-lidar-public'
const VENUES = [
  { name: 'Virginia Beach Fishing Pier', lat: 36.8435575, lon: -75.9713104, bearing: 270 },
  { name: 'Brew River Dock Bar', lat: 38.364236, lon: -75.605912, bearing: 90 },
]
const lines = []
let ok = true
const fail = (why) => {
  ok = false
  lines.push(`FAIL: ${why}`)
}
const corsOf = async (url) => {
  const r = await fetch(url, { headers: { Origin: ORIGIN } })
  return { status: r.status, allow: r.headers.get('access-control-allow-origin'), body: r }
}

try {
  /* 1. Readable from the browser. */
  lines.push('## Readable from a browser, no account', '', '| what | URL | HTTP | Access-Control-Allow-Origin |', '|---|---|---|---|')
  const index = await corsOf(INDEX)
  lines.push(`| coverage index | ${INDEX} | ${index.status} | ${index.allow ?? 'none'} |`)
  const geo = await index.body.json()

  /* 2. Coverage. */
  const inside = (pt, poly) => {
    let c = false
    for (const ring of poly) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[i]
      const [x2, y2] = ring[j]
      if (y1 > pt[1] !== y2 > pt[1] && pt[0] < ((x2 - x1) * (pt[1] - y1)) / (y2 - y1) + x1) c = !c
    }
    return c
  }
  const covers = new Map()
  for (const v of VENUES) {
    const hits = geo.features.filter((f) => (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]).some((p) => inside([v.lon, v.lat], p)))
    covers.set(v.name, hits.map((f) => f.properties.name))
  }
  const firstProject = [...covers.values()].flat()[0]
  if (firstProject === undefined) throw new Error('neither venue is covered')
  const ept = await corsOf(`${BUCKET}/${firstProject}/ept.json`)
  lines.push(`| project metadata | ${BUCKET}/${firstProject}/ept.json | ${ept.status} | ${ept.allow ?? 'none'} |`)
  const tile = await corsOf(`${BUCKET}/${firstProject}/ept-data/0-0-0-0.laz`)
  lines.push(`| point tile | ${BUCKET}/${firstProject}/ept-data/0-0-0-0.laz | ${tile.status} | ${tile.allow ?? 'none'} |`, '')
  for (const r of [index, ept, tile]) if (r.status !== 200 || (r.allow !== '*' && r.allow !== ORIGIN)) fail('a lidar source is not readable from the app\'s origin')

  lines.push('## Coverage', '', '| venue | projects covering it | year in the name |', '|---|---|---|')
  for (const v of VENUES) {
    const names = covers.get(v.name)
    lines.push(`| ${v.name} | ${names.join(', ') || 'none'} | ${names.map((n) => (n.match(/_(\d{4})(?:_|$)/) ?? [])[1] ?? '?').join(', ') || '—'} |`)
    if (names.length === 0) fail(`${v.name} is not covered`)
  }
  lines.push('')

  /* 3. Datum: ground along a line from each venue against Terrarium. */
  const Laz = await createLazPerf()
  const bytesPerPoint = []
  lines.push('## Heights: lidar ground against our elevation (Terrarium z15)', '')
  for (const v of VENUES) {
    const project = [...(covers.get(v.name) ?? [])].sort((a, b) => Number((b.match(/(\d{4})/) ?? [0, 0])[1]) - Number((a.match(/(\d{4})/) ?? [0, 0])[1]))[0]
    if (project === undefined) continue
    const meta = await (await fetch(`${BUCKET}/${project}/ept.json`)).json()
    lines.push(`### ${v.name}: ${project}`, '', `Horizontal: EPSG:${meta.srs?.horizontal ?? '?'} (${(meta.srs?.wkt ?? '').match(/PROJCS\["([^"]+)"/)?.[1] ?? 'no name'}). Vertical: ${meta.srs?.vertical ?? 'not declared in ept.json'}.`, '')
    const { rows, bytes, nodes, counted } = await groundAlong(Laz, `${BUCKET}/${project}`, meta, v, v.bearing, 13, 20, async (z, x, y) => new Uint8Array(await (await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`)).arrayBuffer()))
    bytesPerPoint.push(bytes / counted)
    lines.push(`Read ${nodes} point tiles, ${(bytes / 1e6).toFixed(1)} MB, ${counted} points by the tile index: ${(bytes / counted).toFixed(2)} bytes a point, for a ${12 * 20} m line.`, '', '| metres from the venue | lidar ground (m, median within 5 m) | Terrarium (m) | apart (m) |', '|---|---|---|---|')
    let worst = 0
    let landCount = 0
    for (const r of rows) {
      const apart = r.ground === null ? null : r.ground - r.terrarium
      /* The beach and the land: ground above the water and Terrarium not in the sea artefact. */
      if (apart !== null && r.ground > 0.3) {
        worst = Math.max(worst, Math.abs(apart))
        landCount += 1
      }
      lines.push(`| ${r.m} | ${r.ground === null ? 'no ground points' : r.ground.toFixed(2)} | ${r.terrarium.toFixed(2)} | ${apart === null ? '—' : apart.toFixed(2)} |`)
    }
    lines.push('', `On land (lidar ground above 0.3 m): ${landCount} points, largest difference ${worst.toFixed(2)} m (limit 1).`, '')
    if (landCount < 5) fail(`${v.name}: only ${landCount} land points to compare`)
    if (worst > 1) fail(`${v.name}: lidar ground and our elevation are ${worst.toFixed(2)} m apart`)
  }
  lines.push(`Compressed tile bytes per point, both projects: ${bytesPerPoint.map((b) => b.toFixed(2)).join(' and ')}; the larger, rounded up, sizes the offer: ${Math.ceil(Math.max(...bytesPerPoint))}.`, '')
} catch (error) {
  console.log(`=== LIDAR STOP CHECK ABORTED: ${error instanceof Error ? error.message : String(error)} ===`)
  process.exit(2)
}
const out = ['# Lidar: readable, covering, and on our heights?', '', `Run: ${new Date().toISOString()} · node scripts/measure-lidar-stop.mjs · Origin sent: ${ORIGIN}`, '', ...lines, ok ? 'Pass: Phase 2 may go ahead.' : 'FAIL: Phase 2 stops here.', '']
writeFileSync(`measurements/${new Date().toISOString().slice(0, 10)}-lidar-stop.md`, out.join('\n'))
console.log(out.join('\n'))
process.exit(ok ? 0 : 1)
