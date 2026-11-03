/*
 * TRUTH CASE #5 REPLAYED, BEFORE AND AFTER BATCH J.
 *
 * Usage:  node scripts/measure-truth-5.mjs
 * Reads:  tests/data/sky-fire-2026-11-02-sunset.json and
 *         tests/data/truth5-2026-11-02-sunset/ (scripts/capture-truth-5.mjs)
 * Writes: measurements/2026-11-02-truth-5-replay.md
 *
 * The 2 Nov sunset at Chix Beach, at T-90, T-60 and T-30: what the app
 * would have said with the models alone (before) and with the reports, the
 * satellite and the gap watch (after): the layer's name, the gap line, the
 * colour window and the call. It fired; the observed window is 5:00-5:20 PM.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { eventCall } from '../src/core/briefing.ts'
import { agreementLine, fireVerdict, leadLayer, lookWindow } from '../src/core/fireOutlook.ts'
import { satRead } from '../src/core/goesNowcast.ts'
import { stationsAlong } from '../src/core/gapWatch.ts'
import { layerWords } from '../src/core/layerTruth.ts'
import { parseMetarSky } from '../src/core/metar.ts'
import { LAYER_WORD } from '../src/core/skyColour.ts'
import { formatClock } from '../src/core/timezone.ts'
import { ASOS_STATIONS } from '../src/data/asosStations.ts'
import { parseFirePaths, pathsAt } from '../src/lib/skyFireData.ts'
import { gapFrom, parseProfile, truthFrom } from '../src/lib/skyObsData.ts'
import { afdSkyLine, airRead, contrailsLikely, runsLine } from '../src/core/vivid.ts'
import { parseAir, parseRuns } from '../src/lib/vividData.ts'

const DIR = 'tests/data/truth5-2026-11-02-sunset'
const fx = JSON.parse(readFileSync('tests/data/sky-fire-2026-11-02-sunset.json', 'utf8'))
const EVENT = new Date(fx.event)
const VENUE = fx.venue
const paths = pathsAt(parseFirePaths(fx.payload), fx.hour)
const metars = readFileSync(`${DIR}/metars.csv`, 'utf8').split('\n').filter((l) => /^[A-Z0-9]{3,4},2026/.test(l)).map((l) => {
  const f = l.split(',')
  return { id: f[0], at: new Date(`${f[1].replace(' ', 'T')}:00Z`), text: f.slice(4).join(',') }
})
const latest = (id, t) => {
  const r = metars.filter((m) => m.id === id && m.at <= t).sort((a, b) => b.at - a.at)[0]
  return r === undefined ? null : { sky: parseMetarSky(r.text), at: r.at }
}
const profile = parseProfile(JSON.parse(readFileSync(`${DIR}/profile.json`, 'utf8')).payload, EVENT)
const goes = JSON.parse(readFileSync(`${DIR}/goes.json`, 'utf8')).frames
const nexrad = JSON.parse(readFileSync(`${DIR}/nexrad.json`, 'utf8')).frames
const line = stationsAlong(VENUE, fx.azimuth, ASOS_STATIONS)
const clock = (d) => (d == null ? '—' : formatClock(d, 'America/New_York', 12))

const rows = []
for (const lead of [90, 60, 30]) {
  const now = new Date(EVENT.getTime() - lead * 60_000)
  const station = latest('NTU', now)
  const v = fireVerdict(paths, { event: EVENT, kind: 'sunset', venue: VENUE, aod: 0.11, station })
  const before = eventCall(v, 'sunset', EVENT, now)
  const bw = lookWindow(v)
  /* The satellite frame GIBS had 20 minutes before now; radar likewise. */
  const frames = Object.keys(goes).filter((f) => new Date(f) <= new Date(now.getTime() - 20 * 60_000)).sort()
  const frame = frames[frames.length - 1]
  const sat = frame === undefined ? null : satRead(goes[frame], new Date(frame), profile?.airC ?? null)
  const radar = Object.keys(nexrad).sort().filter((k) => k <= now.toISOString().replace(/[-:T]/g, '').slice(0, 12)).pop()
  const echoes = radar === undefined ? null : nexrad[radar].filter((x) => (x.rgba?.[3] ?? 0) > 0).map((x) => x.km)
  const reports = new Map(line.flatMap((s) => {
    const r = latest(s.id.slice(1), now)
    return r === null || r.sky === null ? [] : [[s.id, r.sky]]
  }))
  const truth = truthFrom({ station: station?.sky ?? null, pireps: [], sounding: null, profile, sat, modelLayer: leadLayer(v).layer })
  const gap = gapFrom({ azimuthDeg: fx.azimuth, line, reports, station: station?.sky ?? null, sat, echoesKm: echoes })
  const after = eventCall(v, 'sunset', EVENT, now, null, { venue: VENUE, truth, gap })
  rows.push(
    `| T-${lead} (${clock(now)}) | before | ${agreementLine(v)} | — | ${bw === null ? '—' : `${clock(bw.from)}–${clock(bw.to)}`}, deepest ${clock(leadLayer(v).times?.deepest)} | ${before.call} |`,
    `| | after | ${agreementLine(v, (l) => layerWords(l, truth, LAYER_WORD))} | ${gap.line}${gap.slotEdgeKm === null ? '' : ` (edge ${Math.round(gap.slotEdgeKm)} km)`} | ${clock(after.colorFrom)}–${clock(after.colorTo)}, deepest ${clock(after.peak ?? leadLayer(v).times?.deepest)} | ${after.call} |`,
  )
}

/* Section 4, how vivid, for the event's hour. */
const air = parseAir(JSON.parse(readFileSync(`${DIR}/air.json`, 'utf8')).payload, EVENT)
const runs = parseRuns(JSON.parse(readFileSync(`${DIR}/ensemble.json`, 'utf8')).payload, EVENT)
const afdText = readFileSync(`${DIR}/afd.txt`, 'utf8')
const afd231 = afdText.slice(afdText.indexOf('FXUS61 KAKQ 021931'), afdText.indexOf('FXUS61 KAKQ 021758'))
const vivid = [
  `Air: ${air === null ? '—' : `${airRead(air.aod, air.dust, air.pm25, 0)?.line} (AOD ${air.aod}, dust ${air.dust}, PM2.5 ${air.pm25})`}`,
  `GFS ensemble: ${runs === null ? '—' : runsLine(runs)?.line}`,
  `Contrails: ${profile !== null && contrailsLikely(profile.levels) ? 'may streak the sky' : 'no ice supersaturation at 300 or 250 hPa'}`,
  `AFD (NWS Wakefield, 2:31 PM; context only): "${afdSkyLine(afd231)}"`,
]
const ran = new Date().toISOString()
const out = [
  '# Truth case #5 replayed: 2 Nov 2026 sunset, Chix Beach, before and after Batch J',
  '',
  `Run: ${ran} · node scripts/measure-truth-5.mjs · venue ${VENUE.lat}, ${VENUE.lon} · sunset ${clock(EVENT)} (${EVENT.toISOString()}), azimuth ${fx.azimuth.toFixed(1)}° · KNTU the station over you · satellite the GIBS frame 20 min before each time, radar likewise · the forecast is the latest run's figures for the hour (captured after the fact), so "before" is not the 4:28 PM run's "3 of 5 see lit high cirrus", 5:14-5:23.`,
  '',
  'Observed (Jwilly\'s drone photos): a mid-level altocumulus deck lit orange from underneath while the sun sat in a clear slot on the WSW horizon, about 5:03-5:08 PM, then pink overhead, fading by about 5:25. FIRED. Observed window until the photo times come: 5:00-5:20 PM.',
  '',
  '| when | | layer | gap | colour | call |',
  '|---|---|---|---|---|---|',
  ...rows,
  '',
  '## How vivid (Section 4)',
  '',
  ...vivid.map((v) => `- ${v}`),
  '',
  `Line stations (within 25 km of the line, out to 300 km): ${line.map((s) => `${s.id} ${s.name} ${Math.round(s.alongKm)} km`).join(', ')}.`,
  '',
]
writeFileSync('measurements/2026-11-02-truth-5-replay.md', out.join('\n'))
console.log(out.join('\n'))
