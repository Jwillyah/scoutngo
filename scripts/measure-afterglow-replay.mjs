/*
 * THE OPPOSITE SKY, REPLAYED (Batch NOW, Section 0): the 12 Nov sunset at
 * the Virginia Beach Fishing Pier (fixtures/truth/2026-11-12-vb-sunset.json:
 * clear west horizon, cumulus lit gold overhead, pink on the clouds over the
 * ocean; the app said "Unlikely").
 *
 * Usage:  node scripts/measure-afterglow-replay.mjs [fetch]
 *         With "fetch": asks Open-Meteo's forecast API (the latest runs for
 *         that hour) the Sky fire question as the app asks it now
 *         (firePathsUrl: the sun's line and the opposite sky) and keeps it in
 *         tests/data/sky-fire-2026-11-12-sunset.json. Without it: replays.
 *         Best Sky's tiles are tests/data/bestsky-2026-11-12-sunset/
 *         (scripts/measure-bestsky-replay.mjs ... tag=sunset fetch).
 * Writes: measurements/2026-11-12-afterglow-replay.md
 *
 * The station is KNTU's report nearest the sunset (tests/data/
 * metars-2026-11-12-13.txt, the Iowa Environmental Mesonet's archive), as
 * the Sky fire page reads the nearest station; also run without it.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { getPosition, getTimes } from 'suncalc'
import { afterglowWords, fireVerdict } from '../src/core/fireOutlook.ts'
import { eventCall } from '../src/core/briefing.ts'
import { parseMetarSky } from '../src/core/metar.ts'
import { MODEL_LABEL } from '../src/core/skyFire.ts'
import { formatClock } from '../src/core/timezone.ts'
import { firePathsUrl, nearestHour, parseFirePaths, pathsAt } from '../src/lib/skyFireData.ts'
import { modelAfterglow } from '../src/core/fireOutlook.ts'
import { rankSpots, scoreGrid } from '../src/core/bestSky.ts'
import { STARTER_SPOTS } from '../src/data/bestSkySpots.ts'

const FILE = 'tests/data/sky-fire-2026-11-12-sunset.json'
const truth = JSON.parse(readFileSync('fixtures/truth/2026-11-12-vb-sunset.json', 'utf8'))
const venue = { lat: truth.place.lat, lon: truth.place.lon }
const event = getTimes(new Date('2026-11-12T12:00:00Z'), venue.lat, venue.lon).sunset
const azimuth = getPosition(event, venue.lat, venue.lon).azimuth
const hour = nearestHour(event)
if (process.argv.includes('fetch') || !existsSync(FILE)) {
  const url = firePathsUrl(venue, azimuth, '2026-11-12')
  const payload = await (await fetch(url)).json()
  writeFileSync(FILE, JSON.stringify({ ran: new Date().toISOString(), url, venue, date: '2026-11-12', kind: 'sunset', event: event.toISOString(), azimuth, hour, payload }))
}
const fx = JSON.parse(readFileSync(FILE, 'utf8'))
const paths = pathsAt(parseFirePaths(fx.payload), fx.hour)
const metars = readFileSync('tests/data/metars-2026-11-12-13.txt', 'utf8').split('\n').filter((l) => l.startsWith('NTU,'))
const near = metars
  .map((l) => l.split(','))
  .map(([, t, m]) => ({ at: new Date(`${t.replace(' ', 'T')}:00Z`), sky: parseMetarSky(m), raw: m }))
  .filter((m) => m.sky !== null)
  .sort((a, b) => Math.abs(a.at - event) - Math.abs(b.at - event))[0]
const clock = (d) => formatClock(d, 'America/New_York', 12)
const L = [
  '# The opposite sky, replayed: sunset 12 Nov 2026, the Virginia Beach Fishing Pier',
  '',
  `Run ${new Date().toISOString()} · node scripts/measure-afterglow-replay.mjs · sunset ${clock(event)} (${event.toISOString()}), sun ${azimuth.toFixed(0)}° · Sky fire: ${FILE} (Open-Meteo's latest runs for ${hour} GMT, fetched ${fx.ran}) · station ${near.raw.split(' ').slice(0, 7).join(' ')} · facing ${truth.place.facingDeg}°`,
  '',
  '## Sky fire',
  '',
  '| read | verdict | afterglow models | call | why | words |',
  '|---|---|---|---|---|---|',
]
for (const [label, station] of [['models only', null], ['with KNTU', { sky: near.sky, at: near.at }]]) {
  const v = fireVerdict(paths, { event, kind: 'sunset', venue, station, facing: truth.place.facingDeg })
  const call = eventCall(v, 'sunset', event, new Date(event.getTime() - 3 * 3_600_000))
  L.push(`| ${label} | ${v.line} (${v.agree} of ${v.of} toward the sun) | ${v.afterglow?.agree ?? 0} of ${v.afterglow?.of ?? 0}${v.afterglow?.best ? ', best match' : ''} | ${call.call} | ${call.why} | ${afterglowWords(v, clock) ?? '—'} |`)
}
L.push('', '| model | opposite cover % | light in | pink | belt |', '|---|---|---|---|---|')
for (const p of paths) {
  const r = modelAfterglow(p, { event, kind: 'sunset', venue })
  L.push(`| ${MODEL_LABEL[p.model]} | ${r?.cover?.toFixed(0) ?? '—'} | ${r === null ? '—' : r.gap.toFixed(2)} | ${r?.fires ? 'yes' : 'no'} | ${r?.belt ? 'yes' : 'no'} |`)
}
/* Best Sky: the tiles as scripts/measure-bestsky-replay.mjs keeps them. */
const { gridTiles } = await import('../src/core/bestSky.ts')
const { readTile } = await import('../src/lib/bestSkyData.ts')
const VB = { lat: 36.85, lon: -75.98 }
const bsEvent = getTimes(new Date('2026-11-12T12:00:00Z'), VB.lat, VB.lon).sunset
const bsAz = getPosition(bsEvent, VB.lat, VB.lon).azimuth
const pts = []
for (const t of gridTiles(VB, 15)) pts.push(...(readTile(JSON.parse(readFileSync(`tests/data/bestsky-2026-11-12-sunset/tile-${t.spacing}-${t.south}-${t.west}.json`, 'utf8')), t.points, nearestHour(bsEvent)) ?? []))
const ranked = rankSpots(scoreGrid(pts, bsAz), STARTER_SPOTS, bsAz, VB)
L.push('', `## Where's the color (15 mi round ${VB.lat}, ${VB.lon}; tests/data/bestsky-2026-11-12-sunset/, best match)`, '', '| rank | spot | score | word | why |', '|---|---|---|---|---|')
ranked.forEach((r, i) => L.push(`| ${i + 1} | ${r.spot.name} | ${r.score.toFixed(2)} | ${r.word} | ${r.why.join(', ')} |`))
L.push('')
writeFileSync('measurements/2026-11-12-afterglow-replay.md', L.join('\n'))
console.log(L.join('\n'))
