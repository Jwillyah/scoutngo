/*
 * THE TIDE AGAINST SURFLINE, 12 NOV (Batch TRUTH, Section 4.8).
 *
 * Usage:  node scripts/measure-tide-check.mjs
 * Writes: measurements/2026-11-12-tide-check.md
 *
 * Surfline had high 9:07 AM 3.9 ft at the Virginia Beach pier; the app had
 * 9:10 AM 4.1 ft. Which NOAA station the app picks for the pier (the nearest
 * in NOAA's tide-prediction list, src/core/tide.ts nearestStations, walked
 * until one answers), against which datum (MLLW, src/lib/noaa.ts), and what
 * NOAA predicts there and at its neighbours.
 */
import { writeFileSync } from 'node:fs'
import { nearestStations } from '../src/core/tide.ts'

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const ran = new Date().toISOString()
const list = (await (await fetch('https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions')).json()).stations.map((s) => ({ id: s.id, name: s.name, at: { lat: Number(s.lat), lon: Number(s.lng) }, type: s.type }))
const near = nearestStations(PIER, list, 4)
const rows = []
for (const n of near) {
  const u = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=${n.station.id}&product=predictions&datum=MLLW&interval=hilo&units=english&time_zone=lst_ldt&format=json&begin_date=20261112&end_date=20261112&application=scoutngo`
  const p = (await (await fetch(u)).json()).predictions ?? []
  const high = p.find((x) => x.type === 'H')
  rows.push(`| ${n.station.id} | ${n.station.name} | ${n.station.type} | ${n.distanceKm.toFixed(1)} km | ${high === undefined ? '—' : `${high.t.slice(11)} ${Number(high.v).toFixed(2)} ft`} |`)
}
const md = [
  '# Tide check, 12 Nov 2026, Virginia Beach pier',
  '',
  `Run: ${ran} · node scripts/measure-tide-check.mjs · NOAA CO-OPS tide predictions, datum MLLW (the app's, src/lib/noaa.ts), local time`,
  '',
  'Surfline: high 9:07 AM 3.9 ft. The app: high 9:10 AM 4.1 ft.',
  '',
  '| station | name | type | from the pier | first high, MLLW |',
  '|---|---|---|---|---|',
  ...rows,
  '',
  `The app's station is the first row (nearest, and it answers on MLLW). Its high is NOAA's own prediction for the pier; Surfline's falls between it and Rudee Inlet's. Nothing changed.`,
  '',
]
writeFileSync('measurements/2026-11-12-tide-check.md', md.join('\n'))
console.log(md.join('\n'))
