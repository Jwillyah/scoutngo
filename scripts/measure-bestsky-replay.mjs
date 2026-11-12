/*
 * WHERE'S THE COLOR, REPLAYED (Batch BEST SKY, Section 1).
 *
 * Usage:  node scripts/measure-bestsky-replay.mjs <date> <sunrise|sunset> <lat> <lon> <radiusMi> [fetch]
 *         e.g. 2026-11-11 sunset 36.85 -75.98 15 fetch
 * With "fetch": asks Open-Meteo (the forecast API's latest runs for those
 * hours, the default model) for each grid tile's low, mid and high cloud,
 * and keeps the answers in tests/data/bestsky-<date>/. Without it: replays
 * what is kept.
 * Writes: measurements/<date>-bestsky-<event>.md: the curated spots ranked
 *         the app's way (rankSpots, from the given lat/lon), with the
 *         tie-break's keys.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { getPosition, getTimes } from 'suncalc'
import { gridTiles, rankSpots, scoreGrid } from '../src/core/bestSky.ts'
import { STARTER_SPOTS } from '../src/data/bestSkySpots.ts'

const [date, kind, lat, lon, radius, ...rest] = process.argv.slice(2)
const fetching = rest.includes('fetch')
const centre = { lat: Number(lat), lon: Number(lon) }
const event = getTimes(new Date(`${date}T12:00:00Z`), centre.lat, centre.lon)[kind]
const az = getPosition(event, centre.lat, centre.lon).azimuth
const hour = new Date(Math.round(event.getTime() / 3_600_000) * 3_600_000).toISOString().slice(0, 13) + ':00'
const dir = `tests/data/bestsky-${date}`
mkdirSync(dir, { recursive: true })
const tiles = gridTiles(centre, Number(radius))
const points = []
for (const t of tiles) {
  const file = `${dir}/tile-${t.spacing}-${t.south}-${t.west}.json`
  if (fetching || !existsSync(file)) {
    const u = new URL('https://api.open-meteo.com/v1/forecast')
    u.searchParams.set('latitude', t.points.map((p) => p.lat.toFixed(2)).join(','))
    u.searchParams.set('longitude', t.points.map((p) => p.lon.toFixed(2)).join(','))
    u.searchParams.set('hourly', 'cloud_cover_low,cloud_cover_mid,cloud_cover_high')
    u.searchParams.set('start_date', date)
    u.searchParams.set('end_date', date)
    u.searchParams.set('timezone', 'GMT')
    writeFileSync(file, JSON.stringify(await (await fetch(u)).json()))
  }
  const body = JSON.parse(readFileSync(file, 'utf8'))
  const list = Array.isArray(body) ? body : [body]
  list.forEach((l, i) => {
    const k = l.hourly.time.indexOf(hour)
    points.push({ ...t.points[i], low: l.hourly.cloud_cover_low[k], mid: l.hourly.cloud_cover_mid[k], high: l.hourly.cloud_cover_high[k] })
  })
}
/* sat=<ISO frame>: the satellite's cold tops at each point at that frame (GIBS GOES-East band 13), kept beside the tiles. */
const satArg = rest.find((a) => a.startsWith('sat='))?.slice(4) ?? null
let satNote = 'no satellite'
if (satArg !== null) {
  const file = `${dir}/goes-${satArg.replace(/[:]/g, '')}.json`
  if (fetching || !existsSync(file)) {
    const { satAtPoints } = await import('../src/lib/goesNowcast.ts')
    writeFileSync(file, JSON.stringify({ frame: satArg, points: points.map((p) => ({ lat: p.lat, lon: p.lon })), c: await satAtPoints(points, new Date(satArg)) }))
  }
  const kept = JSON.parse(readFileSync(file, 'utf8'))
  const known = kept.c.filter((c) => c !== null)
  const ground = Math.max(...known)
  kept.c.forEach((c, i) => {
    points[i].satPatch = c === null ? null : c < ground - 12
  })
  satNote = `satellite frame ${satArg}, ${kept.c.filter((c) => c !== null && c < ground - 12).length} of ${known.length} points cold`
}
const grid = scoreGrid(points, az)
const ranked = rankSpots(grid, STARTER_SPOTS, az, centre)
const L = [
  `# Where's the color, replayed: ${kind} ${date}`,
  '',
  `Run ${new Date().toISOString()} · node scripts/measure-bestsky-replay.mjs ${process.argv.slice(2).join(' ')} · ${tiles.length} tiles, ${points.length} points, hour ${hour} GMT, sun ${az.toFixed(0)}° · ${satNote} · Open-Meteo's latest runs for that hour (kept in ${dir}/) · ranked by rankSpots from ${centre.lat}, ${centre.lon}: score to the hundredth, then aim (10° steps), patch in view (tenths), water, distance`,
  '',
  '| rank | spot | score | word | sees the sun | aim ° | patch in view | water | km | why | low/mid/high at the nearest point |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...ranked.map((r, i) => {
    const near = points.reduce((m, q) => (m === null || Math.hypot(q.lat - r.spot.at.lat, q.lon - r.spot.at.lon) < Math.hypot(m.lat - r.spot.at.lat, m.lon - r.spot.at.lon) ? q : m), null)
    return `| ${i + 1} | ${r.spot.name} | ${r.score.toFixed(2)} | ${r.word} | ${r.seesSun ? 'yes' : 'no'} | ${r.tie.aimDeg.toFixed(0)} | ${r.tie.inView.toFixed(2)} | ${r.tie.water ? 'yes' : 'no'} | ${r.tie.km?.toFixed(1) ?? '—'} | ${r.why.join(', ')} | ${near === null ? '—' : `${near.low}/${near.mid}/${near.high}`} |`
  }),
  '',
]
writeFileSync(`measurements/${date}-bestsky-${kind}.md`, L.join('\n'))
console.log(L.join('\n'))
