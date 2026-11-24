/*
 * THE FOG, RAIN AND WIND FIXTURES, READ BACK (Batch SIMPLE-3, Sections 1, 1b
 * and 1c).
 *
 * Usage:  node scripts/measure-fog-fixtures.mjs
 * Writes: measurements/2026-11-24-fog-fixtures.md
 *
 * Reads only the recording scripts/capture-fog-fixtures.mjs made
 * (tests/data/wx-2026-11-21-24-vb/); no network. Records that run's
 * parameters (every URL asked, its status and size, the User-Agent), then
 * the fog before and after at the beach and inland for each field miss, the
 * rain nowcast at 11:14 PM on 23 Nov, and the two winds of Section 1c.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { getTimes } from 'suncalc'
import { BEACH, INLAND, DIR, TZ, fogSpot, fogHoursOf, waterAt, hourlyOf, capeHenry, radarAt, gridAt, rainStations, quartersOf, metars } from '../tests/wxFixture.ts'
import { fogAt, fogLine, fogSkyCall, stationsAt } from '../src/core/fogRisk.ts'
import { fogRule } from '../src/core/specialLight.ts'
import { skyCallNow } from '../src/core/skyCall.ts'
import { formatClock } from '../src/core/timezone.ts'
import { radarSample, rainNow, rainPhrase, dbzAt } from '../src/core/rainNow.ts'
import { normalizeWind } from '../src/core/stationWind.ts'
import { droneWindAt, windAt, modelWindAt } from '../src/lib/windNow.ts'
import { hourlyAt } from '../src/lib/tideSheetData.ts'

const OUT = 'measurements/2026-11-24-fog-fixtures.md'
const KT = 0.514444
const k = (m) => (m == null ? '—' : (m / KT).toFixed(1))
const F = (c) => (c * 9) / 5 + 32
const clock = (d) => formatClock(d, TZ)
const md = []
const say = (s = '') => md.push(s)

say('# Fog, rain and wind fixtures, 21-23 Nov 2026, Virginia Beach')
say()
say(`Written by \`node scripts/measure-fog-fixtures.mjs\` from the recording in \`${DIR}/\`. Times America/New_York unless marked Z.`)
say()
say('## The capture run (scripts/capture-fog-fixtures.mjs)')
say()
for (const f of ['fetch-log.json', 'fetch-log-radar-truth.json']) {
  if (!existsSync(`${DIR}/${f}`)) continue
  const log = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
  say(`${f}: fetched ${log.fetched}, User-Agent \`${log.userAgent}\` and no other identifying header; ${log.requests.length} requests.`)
  say()
  say('| status | bytes | url |')
  say('|---|---|---|')
  for (const r of log.requests) say(`| ${r.status} | ${r.bytes} | ${r.url} |`)
  say()
}
say(`Spots: ${BEACH.name} (${BEACH.lat}, ${BEACH.lon}, facing ${BEACH.facing}°) and ${INLAND.name} (${INLAND.lat}, ${INLAND.lon}). Water at the beach: Open-Meteo Marine sea_surface_temperature (the app's source there: no station within 15 km). Stations: KNTU, KORF, KNFE, KCPK, KPVG (IEM ASOS, routine and special reports); Cape Henry CO-OPS 8638999 wind. Cape Henry answered "No data was found" for visibility: no station on the water near the beach reports visibility in this recording.`)
say()

/* ------------------------------------------------------------- fog */
const sunrise21 = getTimes(new Date('2026-11-21T17:00:00Z'), BEACH.lat, BEACH.lon).sunrise
const sunset23 = getTimes(new Date('2026-11-23T17:00:00Z'), BEACH.lat, BEACH.lon).sunset
const rows = [
  ['21 Nov 6:30 AM', new Date('2026-11-21T11:30:00Z'), null],
  ['21 Nov sunrise', sunrise21, 'sunrise'],
  ['21 Nov 7:30 AM', new Date('2026-11-21T12:30:00Z'), null],
  ['23 Nov 8 AM', new Date('2026-11-23T13:00:00Z'), null],
  ['23 Nov 11 AM', new Date('2026-11-23T16:00:00Z'), null],
  ['23 Nov 4:20 PM', new Date('2026-11-23T21:20:00Z'), null],
  ['23 Nov sunset', sunset23, 'sunset'],
  ['23 Nov 4:55 PM', new Date('2026-11-23T21:55:00Z'), null],
]
say('## Fog, before and after')
say()
say('Before: the app\'s two fog signals. The sky word says "Fog" only when the nearest fresh airport reads under 1 mile (src/core/skyWord.ts); the Sky page\'s special-light fog rule reads the forecast hour (src/core/specialLight.ts fogRule). After: src/core/fogRisk.ts with the station reports made by then. The sky call column feeds a Go into fogSkyCall.')
say()
say('| moment | spot | before: sky word | before: special-light rule | after: level, kind | after: line | Go becomes |')
say('|---|---|---|---|---|---|---|')
for (const [label, now, kind] of rows) {
  for (const p of [BEACH, INLAND]) {
    const s = fogSpot(p, now)
    const st = stationsAt(s.stations, now)[0]
    const before = st !== undefined && st.visMi !== null && st.visMi < 1 ? `Fog (${st.id} ${st.visMi} mi)` : `none (${st?.id ?? '—'} ${st?.visMi ?? '—'} mi)`
    const m = fogHoursOf(p).reduce((a, b) => (Math.abs(b.at - now) < Math.abs(a.at - now) ? b : a))
    const rule = fogRule({ tempF: m.tempC === null ? null : F(m.tempC), dewF: m.dewC === null ? null : F(m.dewC), windKt: m.windMps === null ? null : m.windMps / KT, seaC: p.facing === null ? null : waterAt(now) })
    const f = fogAt(s, now)
    const line = fogLine(s, now, TZ).line
    let call = '—'
    if (kind !== null) {
      const read = { kind, event: now, call: 'Go', why: '', confirmed: false, colorFrom: null, colorTo: null, setUp: null, agree: 4, of: 5 }
      const c = skyCallNow([{ events: { sunrise: kind === 'sunrise' ? now : null, sunset: kind === 'sunset' ? now : null }, reads: { sunrise: kind === 'sunrise' ? read : null, sunset: kind === 'sunset' ? read : null } }], new Date(now.getTime() - 3_600_000), p)
      const got = fogSkyCall(c, s)
      call = `${got.call.call}${got.line ? ` · "${got.line}"` : ''}`
    }
    say(`| ${label} (${clock(now)}) | ${p === BEACH ? 'beach' : 'inland'} | ${before} | ${rule === null ? 'could not say' : rule ? 'fog' : 'none'} | ${f.level ?? '—'}, ${f.kind ?? '—'} | ${line ?? '—'} | ${call} |`)
  }
}
say()
say('Why, at the beach:')
say()
for (const [label, now] of rows) say(`- ${label}: ${fogAt(fogSpot(BEACH, now), now).reasons.join('; ') || 'no rule held, nothing seen'}`)
say()

/* The decision in src/core/fogRisk.ts: only a station on the water steps sea fog down. Read strictly (every visibility can), the beach at sunset: */
{
  const strict = { ...fogSpot(BEACH, sunset23), stations: fogSpot(BEACH, sunset23).stations.map((x) => ({ ...x, onWater: true })) }
  const f = fogAt(strict, sunset23)
  say(`Read strictly, with every visibility allowed to step sea fog down (the airports' 10 mi and the forecast's), the beach at sunset is ${f.level}, ${f.kind}: "${fogLine(strict, sunset23, TZ).line}", and a Go stays ${fogSkyCall(skyCallNow([{ events: { sunrise: null, sunset: sunset23 }, reads: { sunrise: null, sunset: { kind: 'sunset', event: sunset23, call: 'Go', why: '', confirmed: false, colorFrom: null, colorTo: null, setUp: null, agree: 4, of: 5 } } }], new Date(sunset23.getTime() - 3_600_000), BEACH), strict).call.call}. That is the batch's rule word for word, and it misses the fog Jwilly saw; src/core/fogRisk.ts lets only a station on the water step sea fog down (decision logged for Jwilly).`)
  say()
}

/* ------------------------------------------------------------ rain */
const NOW = new Date('2026-11-24T04:14:00Z')
const scan = new Date('2026-11-24T04:10:00Z')
const radar = await radarAt(BEACH, scan)
const grid = await gridAt(BEACH, scan)
const sample = radarSample(grid, BEACH, scan, radar.tracks)
const rain = rainNow({ now: NOW, stations: rainStations(BEACH, NOW), radar: sample, quarters: quartersOf(BEACH) })
say('## Rain at 11:14 PM, 23 Nov, at the beach')
say()
say(`Radar scans read: ${radar.scans} (03:50, 04:00, 04:10Z). Motion of the tracked cells: toward ${sample.motion?.towardDeg.toFixed(0)}° at ${sample.motion?.kmh.toFixed(1)} km/h. At the spot: ${sample.spotDbz ?? 'no echo'}; 10 mi upstream: ${sample.upstreamDbz ?? 'no echo'}; nearest rain (20 dBZ or more): ${sample.nearest === null ? 'none' : `${sample.nearest.km.toFixed(1)} km at ${sample.nearest.bearingDeg.toFixed(0)}°`}.`)
say()
const reports = metars().filter((m) => m.valid >= new Date('2026-11-24T03:00:00Z') && m.valid <= new Date('2026-11-24T05:00:00Z') && /RA|DZ|SH/.test(m.raw.split(' RMK')[0]))
say(`Station reports with rain, 10 PM to midnight: ${reports.map((m) => `${m.id} ${clock(m.valid)} \`${m.raw.split(' RMK')[0]}\``).join('; ') || 'none'}.`)
say()
const q = quartersOf(BEACH).filter((x) => x.at > NOW && x.at <= new Date(NOW.getTime() + 2 * 3_600_000))
say(`Open-Meteo minutely_15 precipitation for the next 2 h at the beach (archive): ${q.map((x) => x.mm).join(', ')} mm.`)
say()
const truth = []
for (const s of ['202611240420', '202611240430', '202611240440', '202611240450', '202611240500']) {
  const g = await gridAt(BEACH, new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10)}:00Z`))
  truth.push(`${s.slice(8, 10)}:${s.slice(10)}Z ${g === null ? 'no tiles' : (dbzAt(g, BEACH) ?? 'no echo')}`)
}
say(`What the radar did at the beach afterwards (centre tile, recorded for this check; the 3 x 3 grid is not recorded for these times, so a scan reads only the centre tile): ${truth.join('; ')}.`)
say()
say(`Nowcast: state ${rain.state}; line "${rainPhrase(rain, TZ)}"; by: ${rain.by.join('; ')}.`)
say()
say('**The archive does not show rain at Atlantic Park Surf at 11:14 PM.** No station within 15 mi reported rain by then (KORF began at 11:17 PM), the composite had no echo over the beach from 11:10 PM to midnight, and the archived minutely_15 forecast was dry. The light rain Jwilly was told of fell near, not over, this spot: the nowcast says "Showers nearby", not "Light rain now". The "Light rain now · ends ~…" phrase is tested on made-up reads (tests/rainNow.test.ts), not on this fixture.')
say()

/* ------------------------------------------------------------ wind */
const wx = hourlyOf(BEACH)
const r = capeHenry().find((x) => x.at.toISOString() === '2026-11-24T04:12:00.000Z')
const n = normalizeWind({ id: '8638999', kind: 'coastal', mps: r.kt * KT, gustMps: r.gustKt * KT, fromDeg: r.fromDeg }, BEACH.facing)
const obs = { at: r.at, mps: n.mps, gustMps: n.gustMps, fromDeg: r.fromDeg }
const surface = windAt(wx, NOW, obs, NOW)
const after = droneWindAt(wx, NOW, obs, NOW)
say('## The two winds at 11:14 PM (Section 1c)')
say()
say(`- Cape Henry at 11:12 PM: ${r.kt} kt gusting ${r.gustKt} from ${r.fromDeg}° at its anemometer; carried to 10 m over the beach: ${k(n.mps)} kt gusting ${k(n.gustMps)} (factor ${n.factor.toFixed(3)}). The front reached it at 10:42 PM (3.7 kt SW at 10:36, 20.6 kt N at 10:42).`)
say(`- The model at 10 m for the half hour: ${k(modelWindAt(wx, NOW)?.mps)} kt.`)
say(`- Home Wind (windAt, leaned to the station): ${k(surface?.mps)} kt gusting ${k(surface?.gustMps)}.`)
say(`- Home Drone tile before: the briefing's day hours end at 8:30 PM, so at 11:14 PM it read 8:30 PM's model 120 m: ${k(hourlyAt(wx, 'wind_speed_120m', new Date('2026-11-24T01:30:00Z')))} kt, with no station in it.`)
say(`- Drone page before: the model's 120 m at the hour nearest now, no station: ${k(hourlyAt(wx, 'wind_speed_120m', NOW))} kt.`)
say(`- After (droneWindAt, both screens): ${k(after?.mps)} kt at 400 ft, model 120 m ${k(after?.modelMps)} kt, floored ${after?.floored}; at least 0.9 of the surface ${k(surface?.mps)} kt.`)
say()
say('The archive\'s run has the front at 11 PM (120 m 22 kt); the phone\'s run that night evidently did not (it drew 8 kt). Either way the tile read the wrong hour and no station; tests/windAloft.test.ts holds both cases.')
say()

writeFileSync(OUT, md.join('\n'))
console.log(md.join('\n'))
process.exit(0)
