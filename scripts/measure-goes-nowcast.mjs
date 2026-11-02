/*
 * THE SATELLITE NOWCAST, REPLAYED ON THE KEPT MORNINGS (Batch H, Section 2.2).
 *
 * Usage:  node scripts/measure-goes-nowcast.mjs
 * Writes: tests/data/goes-<date>.json (the brightness temperatures sampled
 *         along the sun's line, as read) and
 *         measurements/<today>-goes-nowcast.md
 *
 * For each sunrise kept in tests/data/sky-fire-<date>-sunrise.json at the
 * Virginia Beach Fishing Pier: GOES-East band 13 from NASA GIBS's archive, the
 * frame an hour before the sunrise, read every 10 km along the sun's line to
 * 400 km (src/lib/goesNowcast.ts), and the read (src/core/goesNowcast.ts).
 * NOT ADVECTED in this replay: the wind at cloud height for those mornings is
 * not kept, so the cloud is read where it was an hour before.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { getPosition } from 'suncalc'
import { satRead } from '../src/core/goesNowcast.ts'
import { satSamples } from '../src/lib/goesNowcast.ts'

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const DAYS = { '2026-10-29': 'fired (lit low deck)', '2026-11-02': 'fired (lit high cirrus)', '2026-10-30': 'nothing (clear)', '2026-10-11': 'nothing (overcast, rain)' }
const ran = new Date().toISOString()
const rows = []
for (const [date, outcome] of Object.entries(DAYS)) {
  const fx = JSON.parse(readFileSync(`tests/data/sky-fire-${date}-sunrise.json`, 'utf8'))
  const event = new Date(fx.event)
  const frame = new Date(Math.floor((event.getTime() - 3_600_000) / 600_000) * 600_000)
  const az = getPosition(event, PIER.lat, PIER.lon).azimuth
  const samples = await satSamples(PIER, az, frame, { eastKm: 0, northKm: 0 })
  if (samples === null) {
    rows.push(`| ${date} | ${outcome} | could not read | | | | |`)
    continue
  }
    /* The air at 2 m at the frame's hour, from Open-Meteo's recent past, the ground reference. */
  const air = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${PIER.lat.toFixed(2)}&longitude=${PIER.lon.toFixed(2)}&hourly=temperature_2m&past_days=30&forecast_days=1&timezone=GMT`).then((r) => r.json()).catch(() => null)
  const hour = frame.toISOString().slice(0, 13) + ':00'
  const ai = air?.hourly?.time?.indexOf(hour) ?? -1
  const airC = ai < 0 ? null : air.hourly.temperature_2m[ai]
  const r = satRead(samples, frame, airC)
  writeFileSync(`tests/data/goes-${date}.json`, JSON.stringify({ venue: PIER, event: fx.event, frame: frame.toISOString(), azimuthDeg: az, airC, samples }, null, 1))
  const cs = samples.filter((x) => x.c !== null).map((x) => Math.round(x.c))
  rows.push(`| ${date} | ${outcome} | ${frame.toISOString().slice(11, 16)} UTC, air ${airC} °C | ${Math.min(...cs)} to ${Math.max(...cs)} °C | ${r === null ? 'no read' : `${Math.round(r.overCold * 100)}% / ${Math.round(r.farCold * 100)}%`} | ${r === null ? '' : `${r.canvas ? 'canvas' : 'no canvas'}${r.blocked ? ', blocked' : ''}`} | ${r?.line ?? ''} |`)
  console.log(date, r?.line, samples.map((s) => (s.c === null ? '·' : Math.round(s.c))).join(' '))
}
const lines = [
  '# GOES-East infrared along the sun\'s line, an hour before sunrise',
  '',
  `Run ${ran} · node scripts/measure-goes-nowcast.mjs · Virginia Beach Fishing Pier · band 13 from NASA GIBS's archive at zoom 6 · every 10 km to 400 km · not advected · cold is 12 °C under the air at 2 m (Open-Meteo, past_days); deep is under -30 °C.`,
  '',
  '| Sunrise | What the sky did | Frame | Samples, coldest to warmest | Cold 0-50 km / 100-400 km | Read | Line |',
  '|---|---|---|---|---|---|---|',
  ...rows,
  '',
]
mkdirSync('measurements', { recursive: true })
const file = `measurements/${ran.slice(0, 10)}-goes-nowcast.md`
writeFileSync(file, lines.join('\n'))
console.log(lines.join('\n'))
console.log(`wrote ${file}`)
process.exit(0)
