/*
 * SKY FIRE FROM THE FORECAST: one place, one sunrise or sunset.
 *
 * Usage:  node scripts/measure-sky-fire.mjs [lat lon YYYY-MM-DD sunrise|sunset name]
 *         (defaults: the Virginia Beach Fishing Pier, 29 Oct 2026, sunrise)
 * Writes: measurements/<date>-sky-fire.md (the run, every model's cover along
 *         the sun's line, the three checks and the verdict) and
 *         tests/data/sky-fire-<date>-<event>.json (Open-Meteo's answer, as
 *         received), which tests/skyFire.test.ts replays.
 *
 * The same request the app makes (src/lib/skyFireData.ts firePathsUrl): the
 * eight points rounded to 2 decimals, six models, the day in GMT.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { getPosition, getTimes } from 'suncalc'
import { firePathsUrl, nearestHour, parseFirePaths, pathsAt } from '../src/lib/skyFireData.ts'
import { layersLine, MODEL_LABEL, PATH_KM, pathPoints } from '../src/core/skyFire.ts'
import { agreementLine, checkWords, fireVerdict } from '../src/core/fireOutlook.ts'
import { LAYER_WORD } from '../src/core/skyColour.ts'

const [lat = '36.8435575', lon = '-75.9713104', date = '2026-10-29', kind = 'sunrise', ...rest] = process.argv.slice(2)
const name = rest.join(' ') || 'Virginia Beach Fishing Pier'
const venue = { lat: Number(lat), lon: Number(lon) }
const event = getTimes(new Date(`${date}T12:00:00Z`), venue.lat, venue.lon)[kind]
const azimuth = getPosition(event, venue.lat, venue.lon).azimuth
const url = firePathsUrl(venue, azimuth, date)
const ran = new Date().toISOString()
const response = await fetch(url)
if (!response.ok) {
  console.log(`could not look: Open-Meteo answered ${response.status}`)
  process.exit(2)
}
const payload = await response.json()
const data = parseFirePaths(payload)
const hour = nearestHour(event)
const paths = data === null ? [] : pathsAt(data, hour)
if (paths.length === 0) {
  console.log(`could not look: no cloud figures for ${hour}`)
  process.exit(2)
}
/* No station and the clean-air haze: the forecast's own read (tests/skyFireReplays.test.ts adds the station). */
const verdict = fireVerdict(paths, { event, kind, venue, aod: null })
mkdirSync('tests/data', { recursive: true })
const fixture = `tests/data/sky-fire-${date}-${kind}.json`
writeFileSync(fixture, JSON.stringify({ ran, url, venue, date, kind, event: event.toISOString(), azimuth, hour, payload }, null, 1) + '\n')

const rows = [
  `# Sky fire from the forecast: ${name}, ${kind} ${date}`,
  '',
  `Run: ${ran} · node scripts/measure-sky-fire.mjs ${lat} ${lon} ${date} ${kind} · Open-Meteo forecast API (the hours are past, so these are the latest runs' figures for them, not what was forecast the evening before) · ${kind} ${event.toISOString()}, sun azimuth ${azimuth.toFixed(1)}° · hour used ${hour} GMT · raw answer kept in ${fixture}`,
  '',
  `Points toward the sun, km: ${PATH_KM.join(', ')} (${pathPoints(venue, azimuth).map((p) => `${p.at.lat},${p.at.lon}`).join(' · ')})`,
  '',
  '## Cover along the sun\'s line, low / mid / high %',
  '',
  `| model | ${PATH_KM.map((k) => `${k} km`).join(' | ')} |`,
  `|---|${PATH_KM.map(() => '---').join('|')}|`,
  ...paths.map((p) => `| ${MODEL_LABEL[p.model]} | ${p.samples.map((s) => `${s.low ?? '—'} / ${s.mid ?? '—'} / ${s.high ?? '—'}`).join(' | ')} |`),
  '',
  '## The three checks, per model and layer (src/core/fireOutlook.ts)',
  '',
  '| model | layer | canvas | gap | not blocked | fires |',
  '|---|---|---|---|---|---|',
  ...[verdict?.sky, ...(verdict?.models ?? [])].filter(Boolean).flatMap((m) =>
    m.layers.filter((l) => l.canvas).map((l) => {
      const w = checkWords(l)
      return `| ${m.model === 'sky' ? 'mean (the clock)' : MODEL_LABEL[m.model]} | ${LAYER_WORD[l.layer]} | ${w.canvas} | ${w.gap} | ${w.notBlocked} | ${l.fires ? 'yes' : 'no'} |`
    }),
  ),
  '',
  `Overhead, best match: ${layersLine(paths[0].samples[0])}`,
  '',
  `## Verdict: ${verdict?.line ?? 'none'}, ${verdict?.agree} of ${verdict?.of} models · ${verdict === null ? '' : agreementLine(verdict)}`,
  '',
]
writeFileSync(`measurements/${date}-sky-fire.md`, rows.join('\n'))
console.log(rows.join('\n'))
