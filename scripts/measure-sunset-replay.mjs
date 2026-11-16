/*
 * THE 14 AND 15 NOV SUNSETS, REPLAYED THROUGH THE CALL (Batch CORE, Section 1.2).
 *
 * Usage:  node scripts/measure-sunset-replay.mjs [label]
 * Writes: measurements/<today>-sunset-replay-<label>.md (label: before, after)
 *
 * The data is tests/data/sunset-<date>-vb-inland/, kept by
 * scripts/capture-sunset-1114-1115.mjs: Open-Meteo's archived models along the
 * sunset line, GOES-East along it at each stage, KNTU's reports. At each stage
 * (T-3 h, T-60, T-30) the call is the app's own (src/core/briefing.ts eventCall)
 * from the verdict (fireVerdict), the satellite read (satRead) and the
 * station's deck (deckTruth), with KNTU's latest report at that minute.
 * The truth is fixtures/truth/2026-11-1{4,5}-vb-sunset.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { eventCall } from '../src/core/briefing.ts'
import { fireVerdict } from '../src/core/fireOutlook.ts'
import { satRead } from '../src/core/goesNowcast.ts'
import { deckTruth, stationDeck } from '../src/core/layerTruth.ts'
import { parseMetarSky } from '../src/core/metar.ts'
import { colorWords } from '../src/core/homeDay.ts'
import { nearestHour, parseFirePaths, pathsAt } from '../src/lib/skyFireData.ts'

const label = process.argv[2] ?? 'run'
const STAGES = { 'T-3h': 180, 'T-60': 60, 'T-30': 30 }
const TRUTH = { '2026-11-14': 'good toward WSW, afterglow ENE (app said Little)', '2026-11-15': 'FIRE: whole-sky deck lit red-pink, lit gap WSW (app said nothing tonight)' }
export function replay(date) {
  const dir = `tests/data/sunset-${date}-vb-inland`
  const kept = JSON.parse(readFileSync(`${dir}/paths.json`, 'utf8'))
  const event = new Date(kept.event)
  const paths = pathsAt(parseFirePaths(kept.payload), nearestHour(event))
  const metars = readFileSync(`${dir}/metars.txt`, 'utf8').trim().split('\n').map((l) => ({ at: new Date(l.slice(0, 25)), raw: l.slice(26) })).filter((m) => m.raw !== '')
  const out = []
  for (const [stage, min] of Object.entries(STAGES)) {
    const now = new Date(event.getTime() - min * 60_000)
    const m = metars.filter((x) => x.at <= now).at(-1) ?? null
    const sky = m === null ? null : parseMetarSky(m.raw)
    const station = sky === null ? null : { sky, at: m.at }
    const g = JSON.parse(readFileSync(`${dir}/goes-${stage}.json`, 'utf8'))
    const sat = g.samples === null ? null : satRead(g.samples, new Date(g.frame), g.airC)
    const v = fireVerdict(paths, { event, kind: 'sunset', venue: kept.venue, station })
    const deck = sky === null ? null : stationDeck(sky)
    const truth = deck === null ? null : deckTruth({ station: deck })
    const r = eventCall(v, 'sunset', event, now, sat, { venue: kept.venue, truth, gap: null, sky: station })
    out.push({ stage, now, metar: m?.raw.split(' ').slice(0, 6).join(' ') ?? 'none', verdict: v === null ? 'none' : `${v.word} (${v.agree} of ${v.of})`, sat: sat === null ? 'no read' : sat.line, call: r.call, word: colorWords(r.call) ?? 'no call', why: r.why })
  }
  return { event, out }
}

if (process.argv[1]?.endsWith('measure-sunset-replay.mjs')) {
  const ran = new Date().toISOString()
  const lines = [`# The 14 and 15 Nov sunsets, replayed (${label})`, '', `Run ${ran} · node scripts/measure-sunset-replay.mjs ${label} · VB inland city point (36.80, -76.10) · models: Open-Meteo historical-forecast archive (the run nearest each hour) · satellite: GOES-East band 13, NASA GIBS · station: KNTU's latest report at each stage`, '']
  for (const date of Object.keys(TRUTH)) {
    const { event, out } = replay(date)
    lines.push(`## ${date} sunset ${event.toISOString().slice(11, 16)} UTC · truth: ${TRUTH[date]}`, '', '| stage | KNTU | models | satellite | call | why |', '|---|---|---|---|---|---|')
    for (const o of out) lines.push(`| ${o.stage} | ${o.metar} | ${o.verdict} | ${o.sat} | **${o.word}** | ${o.why.replace(/\|/g, '/')} |`)
    lines.push('')
  }
  mkdirSync('measurements', { recursive: true })
  const file = `measurements/${ran.slice(0, 10)}-sunset-replay-${label}.md`
  writeFileSync(file, lines.join('\n'))
  console.log(lines.join('\n'))
  console.log(`wrote ${file}`)
  process.exit(0)
}
