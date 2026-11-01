/*
 * WHAT THE STATIONS SAW AGAINST WHAT THE CHIP SAID, for one moment at one
 * place. Run by hand after a field report; never by the gate (it reads a live
 * archive once and writes what it read).
 *
 * Usage:  node scripts/measure-station-vs-forecast.mjs <name> <utc-from> <utc-to> <stations,comma> "<chip as reported>" "<sky as seen>"
 *   e.g.  node scripts/measure-station-vs-forecast.mjs pier-sky-0845 2026-11-01T12:00 2026-11-01T14:00 ORF,NTU "0·1·3" "scattered low and mid cumulus, thin cloud near the sun"
 *
 * The METARs come from the Iowa Environmental Mesonet's ASOS archive
 * (mesonet.agron.iastate.edu), which keeps every report as sent. Written to
 * measurements/<date>-<name>.md with the run's parameters.
 */
import { writeFileSync } from 'node:fs'
import { layersWords, parseMetarSky, chipSky } from '../src/core/metar.ts'

const [name, from, to, stations, chip, seen] = process.argv.slice(2)
if (!name || !from || !to || !stations) {
  console.error('usage: measure-station-vs-forecast.mjs <name> <utc-from> <utc-to> <stations> "<chip>" "<seen>"')
  process.exit(2)
}
const a = new Date(`${from}Z`)
const b = new Date(`${to}Z`)
const q = new URLSearchParams({ data: 'metar', tz: 'Etc/UTC', format: 'onlycomma', latlon: 'no', missing: 'M', trace: 'T', direct: 'no', report_type: '3' })
for (const s of stations.split(',')) q.append('station', s)
for (const [k, d] of [['1', a], ['2', b]]) {
  q.set(`year${k}`, String(d.getUTCFullYear()))
  q.set(`month${k}`, String(d.getUTCMonth() + 1))
  q.set(`day${k}`, String(d.getUTCDate()))
  q.set(`hour${k}`, String(d.getUTCHours()))
  q.set(`minute${k}`, String(d.getUTCMinutes()))
}
const url = `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?${q}`
const text = await (await fetch(url)).text()
const rows = text.trim().split('\n').slice(1).map((l) => {
  const [station, valid, ...rest] = l.split(',')
  const metar = rest.join(',')
  const sky = parseMetarSky(metar)
  return { station, valid, metar, words: sky === null ? '—' : layersWords(sky), chip: sky === null ? '—' : chipSky(sky) }
})
const day = from.slice(0, 10)
const out = `# Station against forecast: ${name}

Run: ${new Date().toISOString()} · node scripts/measure-station-vs-forecast.mjs ${process.argv.slice(2).map((x) => JSON.stringify(x)).join(' ')}
Source: ${url}

## As reported from the phone

- The Cloud chip (forecast, L·M·H %): ${chip ?? '—'}
- The sky as seen: ${seen ?? '—'}

## What the stations sent, ${from} to ${to} UTC

| station | time (UTC) | layers | the chip would read | METAR |
|---|---|---|---|---|
${rows.map((r) => `| ${r.station} | ${r.valid} | ${r.words} | ${r.chip} | \`${r.metar}\` |`).join('\n')}
`
const file = `measurements/${day}-${name}.md`
writeFileSync(file, out)
console.log(`wrote ${file}: ${rows.length} reports`)
