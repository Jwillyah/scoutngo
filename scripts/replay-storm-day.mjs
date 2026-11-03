/*
 * A REAL STORM DAY REPLAYED (Batch K, Section 2): 4 Aug 2026 at Norfolk
 * airport (KORF), where the METAR has thunder from 17:20Z (TSB20) and heavy
 * rain from 17:43Z (RAB43), and a second round of rain from 18:55Z.
 *
 * Usage:  node scripts/replay-storm-day.mjs
 * Reads:  live archive: Iowa State's composite radar tiles for the day
 *         (ridge::USCOMP-N0Q-<time>), and KORF's METARs from IEM
 * Writes: measurements/2026-08-04-storm-replay.md
 *
 * The same code as the phone (src/lib/stormData.ts fetchRadar with a fixed
 * scan time, src/core/stormCells.ts): at each lead before the rain began,
 * the first cell said to arrive at KORF, and when.
 *
 * Batch L, Section 3: and the "storms forming nearby" signal
 * (src/core/stormForming.ts) at each scan, from the radar's new cells, the
 * HRRR's archived forecast reflectivity for the hour ahead (fetchHrrr with
 * the scan time as now) and the day's HRRR CAPE and CIN at KORF (Open-Meteo
 * previous runs, the forecast for that day). Lead time before and after:
 * the earliest scan that said anything about a storm at KORF.
 */
import { writeFileSync } from 'node:fs'
import { fetchRadar } from '../src/lib/stormData.ts'
import { cellCalls, cellLine } from '../src/core/stormCells.ts'
import { fetchHrrr } from '../src/lib/stormData.ts'
import { forming, formingLine, formingWhy } from '../src/core/stormForming.ts'

const KORF = { lat: 36.8946, lon: -76.2012 }
const RAIN = [new Date('2026-08-04T17:43:00Z'), new Date('2026-08-04T18:55:00Z')]
const THUNDER = new Date('2026-08-04T17:20:00Z')
const clock = (d) => d.toISOString().slice(11, 16) + 'Z'
/* The day's HRRR CAPE and CIN at KORF, as the forecast had them: the most CAPE and the least CIN from 12Z to 20Z. */
const ing = await (await fetch('https://previous-runs-api.open-meteo.com/v1/forecast?latitude=36.89&longitude=-76.20&hourly=cape,convective_inhibition&models=gfs_hrrr&start_date=2026-08-04&end_date=2026-08-04&timezone=GMT')).json()
const span = ing.hourly.time.map((t, i) => ({ t, cape: ing.hourly.cape[i], cin: ing.hourly.convective_inhibition[i] })).filter((h) => h.t >= '2026-08-04T12:00' && h.t <= '2026-08-04T20:00')
const AIR = { cape: Math.max(...span.map((h) => h.cape ?? 0)), cin: Math.min(...span.map((h) => Math.abs(h.cin ?? 999))) }
const first = { tracker: null, forming: null }
const onAt = []
let before = 0
const lines = ['# Storm day replay: 4 Aug 2026, KORF (Norfolk airport)', '', 'Command: node scripts/replay-storm-day.mjs', `Run: ${new Date().toISOString()}`, '',
  'METAR (IEM archive): thunder began 17:20Z (TSB20); heavy rain began 17:43Z (RAB43); rain again from 18:55Z (RAB1855).', '',
  'Radar: Iowa State national composite, scans 20, 10 and 0 minutes before each time below, tracked by src/core/stormCells.ts.', '',
  `Forming signal (Batch L): radar cells new in the last two scans within 30 mi, backed by the HRRR's forecast reflectivity for the next hour or by the day's HRRR CAPE ${AIR.cape} J/kg and CIN ${AIR.cin} J/kg (12-20Z at KORF, Open-Meteo previous runs).`, '',
  '| scan | lead to rain | first cell said to reach KORF | arrives | error vs METAR | forming signal |', '|---|---|---|---|---|---|']
for (const [rain, leads] of [[RAIN[0], [75, 60, 45, 30, 15]], [RAIN[1], [60, 45, 30, 15]]]) {
  for (const lead of leads) {
    const at = new Date(Math.round((rain.getTime() - lead * 60_000) / 300_000) * 300_000)
    const r = await fetchRadar(KORF, fetch, at)
    if (r === null) { lines.push(`| ${clock(at)} | ${lead} min | radar did not answer | — | — | — |`); continue }
    const hrrr = await fetchHrrr(KORF, at, fetch)
    const f = forming(KORF, r.tracks, hrrr, AIR)
    const formSaid = f === null ? 'nothing' : `${formingLine(f, 'mi')}${formingWhy(f, 'mi', clock) === null ? '' : ` (${formingWhy(f, 'mi', clock)})`}`
    const calls = cellCalls(KORF, r.tracks, r.scanAt)
    const hit = calls.find((c) => c.over || c.arrives !== null)
    const said = hit === undefined ? (calls[0] ? `none arriving; nearest: ${cellLine(calls[0], { dist: 'mi', clock })}` : 'no cells') : cellLine(hit, { dist: 'mi', clock })
    const arr = hit?.over ? at : hit?.arrives ?? null
    const err = arr === null ? '—' : `${Math.round((arr.getTime() - rain.getTime()) / 60_000)} min`
    lines.push(`| ${clock(at)} | ${lead} min to ${clock(rain)} | ${said} | ${arr === null ? '—' : clock(arr)} | ${err} | ${formSaid} |`)
    if (rain === RAIN[0]) {
      before += 1
      if (f !== null) onAt.push(clock(at))
      if (hit !== undefined && first.tracker === null) first.tracker = { at, lead }
      if ((hit !== undefined || f !== null) && first.forming === null) first.forming = { at, lead }
    }
    console.log(lines.at(-1))
  }
}
lines.push('', `Thunder at KORF began ${clock(THUNDER)}, before the rain: the cells' lightning was reported distant west from 17:20.`,
  '', 'Reading it: the first round formed almost in place (cells moving 5-7 mph at T-75 and T-60), which a straight-line track cannot see coming; the tracker said nothing arriving until the cell was over KORF at 17:30Z, 13 min before the METAR\'s rain. KORF had rain without a break from 17:43Z to 18:50Z (RAE50), so the "over you" scans at 18:10Z-18:40Z were right, and the error column against the 18:55Z restart overstates the miss for those rows.')
const leadOf = (x) => (x === null ? 'never' : `${x.lead} min (scan ${clock(x.at)})`)
lines.push('', '## Lead time to the first round of rain (17:43Z)', '', `- before (the tracker alone): ${leadOf(first.tracker)}`, `- after (the tracker or the forming signal): ${leadOf(first.forming)}`, `- the forming signal was on at ${onAt.join(', ') || 'no scan'}: ${onAt.length} of the ${before} scans before the rain. It is not steady: a new cell counts as new for two scans, and a cell that merges or fades takes it away.`)
writeFileSync('measurements/2026-08-04-storm-replay.md', `${lines.join('\n')}\n`)
console.log('wrote measurements/2026-08-04-storm-replay.md')
