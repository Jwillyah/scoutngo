/*
 * THE 12 NOV SUNRISE, REPLAYED AS IT WAS CALLED (Batch TRUTH, Section 0).
 *
 * Usage:  node scripts/measure-sunrise-replay.mjs [fetch]
 *         With "fetch": asks Open-Meteo's single-runs API for each model's run
 *         that was out at each stage, the Iowa Environmental Mesonet for the
 *         METARs, NASA GIBS for the GOES-East frames, and keeps them in
 *         tests/data/sunrise-2026-11-12/. Without it: replays what is kept.
 * Writes: measurements/2026-11-12-sunrise-replay.md (or --out=<file>)
 *
 * Three stages before the sunrise at the Virginia Beach Fishing Pier
 * (11:39 GMT): T-12 h, T-3 h and T-30 min. At each, the models' cover along
 * the sun's line from the latest run each had published by then (the
 * publication delays below are this script's assumption, said in the
 * report), the nearest station's latest METAR (only inside the two hours the
 * app asks), the satellite inside the nowcast window, then the verdict and
 * the call through the app's own code (src/core/fireOutlook.ts,
 * src/core/briefing.ts). Not kept, so not replayed: the soundings, pilots'
 * reports and the 500 hPa wind that drifts the satellite read (the frame is
 * read where it was).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { getPosition, getTimes } from 'suncalc'
import { pathPoints, FIRE_MODELS } from '../src/core/skyFire.ts'
import { fireVerdict } from '../src/core/fireOutlook.ts'
import { eventCall } from '../src/core/briefing.ts'
import { parseMetarSky } from '../src/core/metar.ts'
import { satRead, inNowcast } from '../src/core/goesNowcast.ts'
import { satSamples, SAT_LATENCY_MS } from '../src/lib/goesNowcast.ts'
import { parseFirePaths, pathsAt, nearestHour } from '../src/lib/skyFireData.ts'
import { truthFrom, gapFrom, lineStations } from '../src/lib/skyObsData.ts'
import { feedIds, feedObsFrom } from '../src/lib/feedObs.ts'
import { feedIcs } from '../src/core/calendarFeed.ts'
import { CONFIRM_WITHIN_MS } from '../src/core/briefing.ts'

const DIR = 'tests/data/sunrise-2026-11-12'
/* The feed's server reads the stations this long before an event (api/calendar.ts). */
const FEED_OBS_MS = await import('../api/calendar.ts').then((m) => m.FEED_OBS_MS).catch(() => undefined)
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const event = getTimes(new Date('2026-11-12T12:00:00Z'), PIER.lat, PIER.lon).sunrise
const azimuth = getPosition(event, PIER.lat, PIER.lon).azimuth
const STAGES = [
  ['T-12h', 12 * 3_600_000],
  ['T-3h', 3 * 3_600_000],
  ['T-30min', 30 * 60_000],
]
/* Each model's runs, hours apart, and how long after its run Open-Meteo has it (assumed). */
const RUNS = {
  gfs_hrrr: { every: 1, lagH: 1.5 },
  gfs_seamless: { every: 6, lagH: 5 },
  ecmwf_ifs025: { every: 6, lagH: 7 },
  icon_seamless: { every: 6, lagH: 4 },
  gem_seamless: { every: 12, lagH: 6 },
}
const runAt = (model, now) => {
  const r = RUNS[model === 'best_match' ? 'gfs_hrrr' : model]
  const t = now.getTime() - r.lagH * 3_600_000
  return new Date(Math.floor(t / (r.every * 3_600_000)) * r.every * 3_600_000)
}
const stamp = (d) => d.toISOString().slice(0, 16)

const fetching = process.argv.includes('fetch')
const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? 'measurements/2026-11-12-sunrise-replay.md'
mkdirSync(DIR, { recursive: true })

/* The forecast paths per stage, in the forecast API's own shape so parseFirePaths reads them. */
async function pathsFor(name, now) {
  const file = `${DIR}/paths-${name}.json`
  if (fetching) {
    const pts = pathPoints(PIER, azimuth)
    const locs = pts.map(() => ({ hourly: { time: null } }))
    const runs = {}
    for (const model of FIRE_MODELS) {
      /* Best match over the US is HRRR's run (it matches HRRR figure for figure in the latest answer). */
      const asked = model === 'best_match' ? 'gfs_hrrr' : model
      /* The latest run kept: the archive does not keep every hourly HRRR run, so step back an hour at a time. */
      let run = runAt(model, now)
      let r
      let body
      for (let tries = 0; tries < 7; tries += 1) {
        const u = new URL('https://single-runs-api.open-meteo.com/v1/forecast')
        u.searchParams.set('latitude', pts.map((p) => p.at.lat.toFixed(2)).join(','))
        u.searchParams.set('longitude', pts.map((p) => p.at.lon.toFixed(2)).join(','))
        u.searchParams.set('hourly', 'cloud_cover_low,cloud_cover_mid,cloud_cover_high')
        u.searchParams.set('models', asked)
        u.searchParams.set('run', stamp(run))
        u.searchParams.set('forecast_hours', '30')
        u.searchParams.set('timezone', 'GMT')
        r = await fetch(u)
        body = await r.json()
        if (r.ok) break
        run = new Date(run.getTime() - 3_600_000)
      }
      runs[model] = stamp(run)
      const list = Array.isArray(body) ? body : [body]
      if (!r.ok || list.length !== pts.length) {
        runs[model] = `${stamp(run)} (not available: ${body?.reason ?? r.status})`
        continue
      }
      list.forEach((l, i) => {
        locs[i].hourly.time ??= l.hourly.time
        for (const v of ['cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high']) {
          /* Align to the first model's hours. */
          const at = locs[i].hourly.time.map((t) => l.hourly.time.indexOf(t))
          locs[i].hourly[`${v}_${model}`] = at.map((j) => (j < 0 ? null : l.hourly[v][j]))
        }
      })
    }
    writeFileSync(file, JSON.stringify({ stage: name, now: now.toISOString(), runs, payload: locs }, null, 1) + '\n')
  }
  return JSON.parse(readFileSync(file, 'utf8'))
}

/* The METARs, kept as received. */
const metarFile = `${DIR}/metars.txt`
if (fetching) {
  const u = 'https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=NTU&station=ORF&station=NGU&data=metar&year1=2026&month1=11&day1=11&hour1=22&minute1=0&year2=2026&month2=11&day2=12&hour2=13&minute2=0&tz=Etc/UTC&format=onlycomma&latlon=no&missing=M&trace=T&direct=no&report_type=3&report_type=4'
  const text = await (await fetch(u)).text()
  writeFileSync(metarFile, `# KNTU, KORF, KNGU METARs 11 Nov 22Z to 12 Nov 13Z, Iowa Environmental Mesonet ASOS archive, fetched ${new Date().toISOString()}\n# ${u}\n${text}`)
}
const metars = readFileSync(metarFile, 'utf8')
  .split('\n')
  .filter((l) => /^[A-Z]{3},/.test(l))
  .map((l) => {
    const [st, t, m] = l.split(',')
    return { station: `K${st}`, at: new Date(`${t.replace(' ', 'T')}:00Z`), text: m, sky: parseMetarSky(m) }
  })
/* The nearest station first, as weather.gov lists them for the pier: KNTU, KORF, KNGU. */
const latestOf = (id, now) => metars.filter((m) => m.station === id && m.at <= now && m.sky !== null).at(-1) ?? null

/* The satellite frame each stage would read (20 min behind, on the 10-minute frame). */
async function satFor(name, now) {
  const file = `${DIR}/goes-${name}.json`
  const frame = new Date(Math.floor((now.getTime() - SAT_LATENCY_MS) / 600_000) * 600_000)
  if (fetching) {
    const samples = await satSamples(PIER, azimuth, frame, { eastKm: 0, northKm: 0 })
    writeFileSync(file, JSON.stringify({ stage: name, frame: frame.toISOString(), samples }, null, 1) + '\n')
  }
  if (!existsSync(file)) return null
  const got = JSON.parse(readFileSync(file, 'utf8'))
  return got.samples === null ? null : { frame: new Date(got.frame), samples: got.samples }
}

const ran = new Date().toISOString()
const rows = [
  '# The 12 Nov sunrise at the Virginia Beach Fishing Pier, replayed as called',
  '',
  `Run: ${ran} · node scripts/measure-sunrise-replay.mjs${fetching ? ' fetch' : ''} · sunrise ${event.toISOString()}, azimuth ${azimuth.toFixed(1)}° · forecast hour ${nearestHour(event)} GMT · inputs kept in ${DIR}/`,
  '',
  'Assumed publication delays (run to Open-Meteo): HRRR 1.5 h, GFS 5 h, ECMWF 7 h, ICON 4 h, GEM 6 h. Best match is read as HRRR. Not replayed: soundings, pilot reports, the satellite drift.',
  '',
  '| stage | runs | overhead low/mid/high (each model) | station | satellite | verdict | call | why | calendar |',
  '|---|---|---|---|---|---|---|---|---|',
]
const out = []
for (const [name, lead] of STAGES) {
  const now = new Date(event.getTime() - lead)
  const kept = await pathsFor(name, now)
  const data = parseFirePaths(kept.payload)
  const paths = data === null ? [] : pathsAt(data, nearestHour(event))
  /* The app asks the stations only in the two hours before the event. */
  const soon = lead <= 2 * 3_600_000
  const st = soon ? latestOf('KNTU', now) : null
  const station = st === null ? null : { sky: st.sky, at: st.at }
  const verdict = paths.length === 0 ? null : fireVerdict(paths, { event, kind: 'sunrise', venue: PIER, station })
  const sat0 = inNowcast(event, now) ? await satFor(name, now) : null
  const groundC = st === null ? null : Number(/ (M?\d+)\/(M?\d+) /.exec(st.text)?.[1]?.replace('M', '-') ?? NaN)
  const sat = sat0 === null ? null : satRead(sat0.samples, sat0.frame, Number.isFinite(groundC) ? groundC : null)
  let obs = null
  if (lead <= 3 * 3_600_000) {
    const line = await lineStations(PIER, azimuth)
    const reports = new Map(line.flatMap((s) => {
      const m = latestOf(s.id, now)
      return m === null ? [] : [[s.id, m.sky]]
    }))
    const truth = truthFrom({ station: st?.sky ?? null, pireps: [], sounding: null, profile: null, sat, modelLayer: null })
    const gap = gapFrom({ azimuthDeg: azimuth, line, reports, station: st?.sky ?? null, sat, echoesKm: null })
    obs = { venue: PIER, truth, gap, line }
  }
  const call = eventCall(verdict, 'sunrise', event, now, sat, obs)
  /* The feed's server (api/calendar.ts): the models without a station, the stations' read only in the hour before, no satellite. */
  const FEED_AT = { lat: 36.84, lon: -75.97 }
  const feedWindow = typeof FEED_OBS_MS === 'number' ? FEED_OBS_MS : CONFIRM_WITHIN_MS
  let feedObs = null
  if (lead <= feedWindow) {
    const { own, ids } = feedIds(FEED_AT, event)
    const skies = new Map(ids.flatMap((id) => {
      const m = latestOf(id, now)
      return m === null ? [] : [[id, m.sky]]
    }))
    feedObs = feedObsFrom(FEED_AT, event, skies, own)
  }
  const feedCall = eventCall(paths.length === 0 ? null : fireVerdict(paths, { event, kind: 'sunrise', venue: FEED_AT }), 'sunrise', event, now, null, feedObs)
  const ics = feedIcs([feedCall], FEED_AT, now)
  const feed = ics.includes('BEGIN:VEVENT') ? `event: "${/SUMMARY:(.*)/.exec(ics)?.[1]}"` : null
  out.push({ name, now, verdict, call, feed, obs })
  const over = paths.map((p) => `${p.model.replace('_seamless', '').replace('_ifs025', '')} ${p.samples[0].low}/${p.samples[0].mid}/${p.samples[0].high}`).join(', ')
  rows.push(
    `| ${name} (${stamp(now)}Z) | ${Object.entries(kept.runs).map(([m, r]) => `${m} ${r.slice(11)}Z`).join(', ')} | ${over} | ${st === null ? 'not asked (outside 2 h)' : `${st.text.split(' RMK')[0]}`} | ${sat === null ? (inNowcast(event, now) ? 'no read' : 'outside the window') : `${sat.line} (frame ${stamp(sat.at)}Z)`} | ${verdict?.line ?? 'none'} (${verdict?.agree ?? 0} of ${verdict?.of ?? 0}) | ${call.call ?? '—'} | ${call.why}${obs === null ? '' : ` · deck over you: ${obs.truth?.words ?? 'none'} · ${obs.gap.line}`} | ${feed === null ? 'no event' : feed} |`,
  )
}
rows.push('')
writeFileSync(OUT, rows.join('\n'))
console.log(rows.join('\n'))
