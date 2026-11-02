/*
 * SPECIAL LIGHT FOR A WEEK, KEPT AS A FIXTURE (Batch G, Section 5).
 *
 * Usage:  node scripts/measure-special-week.mjs [lat lon name]
 *         (default: the Virginia Beach Fishing Pier)
 *         node scripts/measure-special-week.mjs --replay tests/data/special-<date>.json
 *         (no network: the kept answers through today's rules, written to
 *         measurements/<date>-special-week-replay.md)
 * Writes: tests/data/special-<today>.json (Open-Meteo's three answers as
 *         received: the nine-point week, the venue's mid and high cloud, the
 *         sea temperature) and measurements/<today>-special-week.md (every
 *         window the rules give, its length and its sun), which
 *         tests/specialWeek.test.ts replays.
 *
 * The same requests the app makes (src/lib/specialLightData.ts specialUrl,
 * thinUrl; the marine request as src/lib/tideSheetData.ts asks it).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { getPosition } from 'suncalc'
import { parseSpecial, parseThin, specialsFrom, specialUrl, thinUrl } from '../src/lib/specialLightData.ts'
import { MARINE_URL } from '../src/lib/tideSheetData.ts'
import { formatClock } from '../src/core/timezone.ts'

const replay = process.argv[2] === '--replay' ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : null
const [lat = '36.8435575', lon = '-75.9713104', ...rest] = replay === null ? process.argv.slice(2) : [String(replay.venue.lat), String(replay.venue.lon)]
const name = rest.join(' ') || 'Virginia Beach Fishing Pier'
const venue = { lat: Number(lat), lon: Number(lon) }
const marineUrl = `${MARINE_URL}?${new URLSearchParams({ latitude: venue.lat.toFixed(2), longitude: venue.lon.toFixed(2), hourly: 'sea_surface_temperature', forecast_days: '7', timezone: 'GMT' })}`
const ran = replay?.ran ?? new Date().toISOString()
const get = async (u) => {
  const r = await fetch(u)
  if (!r.ok) {
    console.log(`could not look: ${u.slice(0, 60)} answered ${r.status}`)
    process.exit(2)
  }
  return r.json()
}
const [week, thin, marine] = replay === null ? await Promise.all([get(specialUrl(venue)), get(thinUrl(venue)), get(marineUrl)]) : [replay.week, replay.thin, replay.marine]
const fixture = `tests/data/special-${ran.slice(0, 10)}.json`
if (replay === null) {
  mkdirSync('tests/data', { recursive: true })
  writeFileSync(fixture, JSON.stringify({ ran, venue, urls: [specialUrl(venue), thinUrl(venue), marineUrl], week, thin, marine }) + '\n')
}

const parsed = parseSpecial(week)
const w = { ...parsed, thin: parseThin(thin, parsed.hours) }
const sea = new Map((marine.hourly?.time ?? []).map((t, i) => [new Date(`${t}:00Z`).getTime(), marine.hourly.sea_surface_temperature[i]]))
const list = specialsFrom(w, venue, (t) => sea.get(t.getTime()) ?? null)
const clock = (d) => formatClock(d, 'America/New_York', 12)
const day = (d) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', day: 'numeric', month: 'short' }).format(d)
const alt = (d) => getPosition(d, venue.lat, venue.lon).altitude
const rows = [
  `# Special light, the week from ${ran.slice(0, 10)}: ${name}`,
  '',
  `Run: ${replay === null ? ran : `${new Date().toISOString()}, replaying the answers of ${ran}`} · node scripts/measure-special-week.mjs ${replay === null ? `${lat} ${lon}` : `--replay ${process.argv[3]}`} · Open-Meteo forecast (five models, nine points), mid and high cloud, sea temperature · raw answers kept in ${fixture}`,
  '',
  '| kind | day | from | to | hours | sun at start | sun at end | agree |',
  '|---|---|---|---|---|---|---|---|',
  ...list.sort((a, b) => a.from - b.from).map((s) => `| ${s.kind} | ${day(s.from)} | ${clock(s.from)} | ${clock(s.to)} | ${((s.to - s.from) / 3_600_000).toFixed(0)} | ${alt(s.from).toFixed(0)}° | ${alt(s.to).toFixed(0)}° | ${s.agree} of ${s.of} |`),
  '',
]
writeFileSync(`measurements/${ran.slice(0, 10)}-special-week${replay === null ? '' : '-replay'}.md`, rows.join('\n'))
console.log(rows.join('\n'))
process.exit(0)
