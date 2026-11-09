/*
 * THE WIND NOWCAST, BEFORE AND AFTER, AGAINST THE STATIONS (Batch MAP2,
 * Section 2). Live public data, run by hand, never in the gate:
 *
 *   truth    IEM's ASOS archive, KNTU (Oceana NAS) and KFFA (First Flight),
 *            the last 7 days, the routine hourly reports
 *   model    Open-Meteo's historical forecast (best match), hourly, at each
 *            station's point: what the app shows with no station nearby
 *   after    src/core/nowcast.ts on the model: at each report, lean to it,
 *            and score the next 0, 1, 2 and 3 hours against the reports then
 *
 * Writes measurements/<date>-wind-nowcast.md with the parameters.
 */
import { writeFileSync } from 'node:fs'
import { nowcastAt } from '../src/core/nowcast.ts'

const KT = 0.514444
const STATIONS = [
  { id: 'NTU', name: 'KNTU, Oceana NAS', lat: 36.82, lon: -76.03 },
  { id: 'FFA', name: 'KFFA, First Flight', lat: 36.02, lon: -75.67 },
]
const end = new Date()
const start = new Date(end.getTime() - 7 * 86_400_000)
const ymd = (d) => [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]

async function reports(id) {
  const [y1, m1, d1] = ymd(start)
  const [y2, m2, d2] = ymd(end)
  const u = `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=${id}&data=sknt&data=drct&data=gust&year1=${y1}&month1=${m1}&day1=${d1}&year2=${y2}&month2=${m2}&day2=${d2}&tz=Etc/UTC&format=onlycomma&latlon=no&missing=M&trace=T&direct=no&report_type=3&report_type=4`
  /* IEM answers a quick second request with a refusal: a pause, and once more if the first comes back empty. */
  await new Promise((r) => setTimeout(r, 3000))
  let text = await (await fetch(u)).text()
  if (!text.startsWith('station')) {
    await new Promise((r) => setTimeout(r, 10000))
    text = await (await fetch(u)).text()
  }
  return text
    .trim()
    .split('\n')
    .slice(1)
    .map((l) => l.split(','))
    .filter((f) => f[2] !== 'M')
    .map((f) => ({ at: new Date(`${f[1].replace(' ', 'T')}:00Z`), mps: Number(f[2]) * KT, fromDeg: f[3] === 'M' || f[3] === 'VRB' ? null : Number(f[3]), gustMps: f[4] === 'M' ? null : Number(f[4]) * KT }))
}

async function model(lat, lon) {
  const s = start.toISOString().slice(0, 10)
  const e = end.toISOString().slice(0, 10)
  const u = `https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=ms&start_date=${s}&end_date=${e}&timezone=GMT`
  const j = await (await fetch(u)).json()
  const times = j.hourly.time.map((t) => Date.parse(`${t}:00Z`))
  return (t) => {
    const x = t.getTime()
    const i = Math.floor((x - times[0]) / 3_600_000)
    if (i < 0 || i >= times.length - 1) return null
    const f = (x - times[i]) / 3_600_000
    const lerp = (a) => (a[i] === null || a[i + 1] === null ? null : a[i] + (a[i + 1] - a[i]) * f)
    const mps = lerp(j.hourly.wind_speed_10m)
    return mps === null ? null : { mps, fromDeg: j.hourly.wind_direction_10m[i], gustMps: lerp(j.hourly.wind_gusts_10m) }
  }
}

const rows = []
for (const s of STATIONS) {
  const obs = await reports(s.id)
  console.log(`${s.id}: ${obs.length} reports`)
  const m = await model(s.lat, s.lon)
  for (const lead of [0, 1, 2, 3]) {
    let n = 0
    let before = 0
    let after = 0
    for (const o of obs) {
      const target = obs.find((x) => Math.abs(x.at.getTime() - (o.at.getTime() + lead * 3_600_000)) < 20 * 60_000)
      if (target === undefined) continue
      const b = m(target.at)
      const a = nowcastAt(m, o, target.at)
      if (b === null || a === null) continue
      n += 1
      before += Math.abs(b.mps - target.mps)
      after += Math.abs(a.mps - target.mps)
    }
    rows.push({ station: s.name, lead, n, before: before / n / KT, after: after / n / KT })
  }
}

const date = end.toISOString().slice(0, 10)
const md = `# Wind nowcast, before and after, against the stations

Batch MAP2, Section 2. Run ${end.toISOString()} by scripts/measure-wind-nowcast.mjs.

Parameters: ${start.toISOString().slice(0, 10)} to ${date}, the routine
reports (IEM ASOS archive, report types 3 and 4: KFFA is an AWOS that files every 20 minutes) at KNTU and KFFA; the model is
Open-Meteo's historical forecast, best match, at each station's point; the
nowcast is src/core/nowcast.ts (fade ${3} h). For every report, the forecast
for 0, 1, 2 and 3 hours later is scored against the report then: mean
absolute speed error, knots.

| Station | Hours after the report | Pairs | Model alone (kt) | With the nowcast (kt) |
|---|---|---|---|---|
${rows.map((r) => `| ${r.station} | ${r.lead} | ${r.n} | ${r.before.toFixed(2)} | ${r.after.toFixed(2)} |`).join('\n')}

At 0 hours the nowcast leans fully on a report at, or within 20 minutes
of, the one it is scored against, so it is near 0 by construction; 1 to 3
hours are the test, and at 3 hours the lean has faded back to the model.
`
const path = `measurements/${date}-wind-nowcast.md`
writeFileSync(path, md)
console.log(md)
console.log(`wrote ${path}`)
