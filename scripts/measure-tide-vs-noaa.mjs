/*
 * THE TIDE AT VIRGINIA BEACH, OURS AGAINST NOAA'S PUBLISHED TURNS (Batch
 * MAP2, Section 2: the field check said we were 6 to 9 minutes late and
 * about 0.3 ft high). Live public data, run by hand, never in the gate.
 *
 *   ours     the app's own choice of station (src/core/tide.ts
 *            nearestStations then openCoastFirst, the first three tried in
 *            order as src/lib/useTide.ts does) and the turns that station
 *            publishes, as the app reads them (src/lib/noaa.ts parseExtremes),
 *            printed by the app's clock (src/core/timezone.ts formatClock)
 *   NOAA     the published high and low waters for Virginia Beach, 8639168,
 *            as NOAA's own page prints them (local time)
 *
 * Also the station the old rule (the nearest that publishes) would take,
 * and the one the inlet would give, for comparison.
 */
import { writeFileSync } from 'node:fs'
import { nearestStations, openCoastFirst } from '../src/core/tide.ts'
import { parseExtremes } from '../src/lib/noaa.ts'
import { formatClock } from '../src/core/timezone.ts'

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const TZ = 'America/New_York'
const API = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
const today = new Date()
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '')
const begin = ymd(today)
const end = ymd(new Date(today.getTime() + 2 * 86_400_000))

const list = (await (await fetch('https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions')).json()).stations.map((s) => ({ id: s.id, name: s.name, at: { lat: Number(s.lat), lon: Number(s.lng) } }))

async function hilo(id, tz) {
  const p = new URLSearchParams({ product: 'predictions', application: 'scoutngo-measure', begin_date: begin, end_date: end, datum: 'MLLW', station: id, time_zone: tz, units: 'english', format: 'json', interval: 'hilo' })
  return (await fetch(`${API}?${p}`)).json()
}

const nearest = nearestStations(PIER, list, 6)
const ordered = openCoastFirst(nearest)
let ours = null
for (const c of ordered.slice(0, 3)) {
  const j = await hilo(c.station.id, 'gmt')
  if (Array.isArray(j.predictions) && j.predictions.length > 0) {
    ours = { station: c.station, km: c.distanceKm, turns: parseExtremes(j) }
    break
  }
}
const noaa = (await hilo('8639168', 'lst_ldt')).predictions
const inlet = parseExtremes(await hilo('8639207', 'gmt'))

const rows = noaa.map((n, i) => {
  const o = ours?.turns[i]
  const ins = inlet[i]
  const oursClock = o === undefined ? '—' : formatClock(o.at, TZ)
  return `| ${n.t.slice(5, 10)} | ${n.type === 'H' ? 'High' : 'Low'} | ${n.t.slice(11)} | ${Number(n.v).toFixed(2)} | ${oursClock} | ${o === undefined ? '—' : o.feet.toFixed(2)} | ${ins === undefined ? '—' : formatClock(ins.at, TZ)} | ${ins === undefined ? '—' : ins.feet.toFixed(2)} |`
})

const md = `# The tide at Virginia Beach: ours against NOAA's published turns

Batch MAP2, Section 2. Run ${today.toISOString()} by scripts/measure-tide-vs-noaa.mjs.

Parameters: the Virginia Beach Fishing Pier (36.8436, -75.9713); ${begin} to
${end}; NOAA's tide predictions, MLLW, feet; NOAA's own times in local time
(lst_ldt); ours read in GMT and printed in America/New_York by the app's
clock.

The app's station: ${ours === null ? 'none answered' : `${ours.station.id} ${ours.station.name}, ${ours.km.toFixed(2)} km`}.
The nearest six, nearest first: ${nearest.map((c) => `${c.station.id} ${c.station.name} (${c.distanceKm.toFixed(1)} km)`).join('; ')}.
In the app's order (open coast first): ${ordered.map((c) => c.station.id).join(', ')}.

| Date | Turn | NOAA 8639168 time | NOAA ft | Ours time | Ours ft | Rudee Inlet interior 8639207 time | its ft |
|---|---|---|---|---|---|---|---|
${rows.join('\n')}
`
const path = `measurements/${today.toISOString().slice(0, 10)}-tide-vs-noaa.md`
writeFileSync(path, md)
console.log(md)
console.log(`wrote ${path}`)
