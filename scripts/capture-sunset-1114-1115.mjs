/*
 * THE TWO INLAND SUNSETS, KEPT FOR REPLAY (Batch CORE, Section 1.2).
 *
 * Usage:  node scripts/capture-sunset-1114-1115.mjs
 * Writes: tests/data/sunset-<date>-vb-inland/{paths.json,goes-<stage>.json,metars.txt}
 *
 * 14 Nov (good toward WSW, the app said Little) and 15 Nov (whole-sky deck lit
 * red-pink, the app said Possible for tomorrow): fixtures/truth/. No forecast
 * was kept on those days, so this rebuilds what the app could have had:
 *   paths      Open-Meteo's historical-forecast archive for the app's own
 *              question (src/lib/skyFireData.ts firePathsUrl): eight points
 *              along the sunset line, the five models. The archive holds the
 *              run nearest each hour, not the run the phone had at T-3 h.
 *   goes       GOES-East band 13 from NASA GIBS's archive along the sun's
 *              line at each stage (T-3 h, T-60, T-30), as the app reads it
 *              (src/lib/goesNowcast.ts), with the 2 m air temperature.
 *   metars     KNTU's reports that afternoon, as weather.gov archives them.
 * The place is a city-level point (36.80, -76.10): no one's position.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { getPosition, getTimes } from 'suncalc'
import { firePathsUrl } from '../src/lib/skyFireData.ts'
import { satSamples } from '../src/lib/goesNowcast.ts'

const VB = { lat: 36.8, lon: -76.1 }
const UA = { 'user-agent': 'ScoutNGo (+https://github.com/Jwillyah/scoutngo)', accept: 'application/geo+json' }
const STAGES = { 'T-3h': 180, 'T-60': 60, 'T-30': 30 }
for (const date of ['2026-11-14', '2026-11-15']) {
  const dir = `tests/data/sunset-${date}-vb-inland`
  mkdirSync(dir, { recursive: true })
  const event = getTimes(new Date(`${date}T17:00:00Z`), VB.lat, VB.lon).sunset
  const az = getPosition(event, VB.lat, VB.lon).azimuth
  const url = new URL(firePathsUrl(VB, az, date))
  url.host = 'historical-forecast-api.open-meteo.com'
  const r = await fetch(url)
  const payload = await r.json()
  if (!r.ok) throw new Error(`${date}: Open-Meteo archive ${r.status} ${JSON.stringify(payload).slice(0, 200)}`)
  writeFileSync(`${dir}/paths.json`, JSON.stringify({ date, venue: VB, event: event.toISOString(), azimuthDeg: az, source: url.toString(), fetched: new Date().toISOString(), payload }, null, 1))
  const air = await (await fetch(`https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${VB.lat}&longitude=${VB.lon}&hourly=temperature_2m&start_date=${date}&end_date=${date}&timezone=GMT`)).json()
  for (const [stage, min] of Object.entries(STAGES)) {
    const at = new Date(event.getTime() - min * 60_000)
    const frame = new Date(Math.floor(at.getTime() / 600_000) * 600_000)
    const hour = air.hourly.time.indexOf(frame.toISOString().slice(0, 13) + ':00')
    const airC = hour < 0 ? null : air.hourly.temperature_2m[hour]
    const samples = await satSamples(VB, az, frame, { eastKm: 0, northKm: 0 })
    writeFileSync(`${dir}/goes-${stage}.json`, JSON.stringify({ stage, frame: frame.toISOString(), airC, samples }, null, 1))
    console.log(date, stage, frame.toISOString(), samples === null ? 'no satellite read' : `${samples.filter((s) => s.c !== null).length} samples`, `air ${airC}`)
  }
  const obs = await (await fetch(`https://api.weather.gov/stations/KNTU/observations?start=${date}T17:00:00Z&end=${date}T23:30:00Z`, { headers: UA })).json()
  const lines = (obs.features ?? []).map((f) => `${f.properties.timestamp} ${f.properties.rawMessage ?? ''}`.trim()).sort()
  writeFileSync(`${dir}/metars.txt`, lines.join('\n') + '\n')
  console.log(date, `sunset ${event.toISOString()}`, `az ${az.toFixed(1)}`, `${lines.length} KNTU reports`)
}
process.exit(0)
