/*
 * A SUNRISE OR SUNSET REPLAYED AS IT WAS CALLED (Batch NOW, Section 0; the
 * method of scripts/measure-sunrise-replay.mjs, Batch TRUTH), with the
 * opposite sky (src/core/afterglow.ts).
 *
 * Usage:  node scripts/measure-stage-replay.mjs <date> <sunrise|sunset> [fetch] [at=<ISO>]
 *         e.g. 2026-11-13 sunrise fetch; at=2026-11-12T14:40:00Z adds that
 *         moment as a stage of its own (12 Nov 9:40 AM, Section 1.2)
 *         With "fetch": asks Open-Meteo's single-runs API, for each model,
 *         for the run that was out at each stage (the publication delays
 *         below are this script's assumption), at the points the app asks
 *         now (firePathsUrl: the sun's line and the opposite sky), and keeps
 *         them in tests/data/stages-<date>-<event>/. Without it: replays.
 * Writes: measurements/<date>-<event>-stages.md
 *
 * Three stages: T-12 h, T-3 h, T-30 min, at the Virginia Beach Fishing Pier
 * (facing 100°). The station is KNTU's latest report at the stage, and only
 * counts within 2 h of the event (fireOutlook.ts STATION_HOURS), from
 * tests/data/metars-2026-11-12-13.txt. Not replayed: the satellite and the
 * stations' gap watch (not kept for these stages).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { getPosition, getTimes } from 'suncalc'
import { FIRE_MODELS, MODEL_LABEL } from '../src/core/skyFire.ts'
import { afterglowWords, fireVerdict } from '../src/core/fireOutlook.ts'
import { eventCall } from '../src/core/briefing.ts'
import { parseMetarSky } from '../src/core/metar.ts'
import { formatClock } from '../src/core/timezone.ts'
import { firePathsUrl, nearestHour, parseFirePaths, pathsAt } from '../src/lib/skyFireData.ts'

const [date, kind] = process.argv.slice(2)
const fetching = process.argv.includes('fetch')
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const FACING = 100
const DIR = `tests/data/stages-${date}-${kind}`
const event = getTimes(new Date(`${date}T12:00:00Z`), PIER.lat, PIER.lon)[kind]
const azimuth = getPosition(event, PIER.lat, PIER.lon).azimuth
const atArg = process.argv.find((a) => a.startsWith('at='))?.slice(3) ?? null
const STAGES = [
  ['T-12h', 12 * 3_600_000],
  ...(atArg === null ? [] : [[`at-${atArg.slice(11, 16).replace(':', '')}Z`, event.getTime() - new Date(atArg).getTime()]]),
  ['T-3h', 3 * 3_600_000],
  ['T-30min', 30 * 60_000],
]
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
mkdirSync(DIR, { recursive: true })

async function pathsFor(name, now) {
  const file = `${DIR}/paths-${name}.json`
  if (fetching) {
    const q = new URL(firePathsUrl(PIER, azimuth, date)).searchParams
    const lats = q.get('latitude').split(',')
    const lons = q.get('longitude').split(',')
    const locs = lats.map(() => ({ hourly: { time: null } }))
    const runs = {}
    for (const model of FIRE_MODELS) {
      /* Best match over the US is HRRR's run. */
      const asked = model === 'best_match' ? 'gfs_hrrr' : model
      let run = runAt(model, now)
      let r
      let body
      for (let tries = 0; tries < 7; tries += 1) {
        const u = new URL('https://single-runs-api.open-meteo.com/v1/forecast')
        u.searchParams.set('latitude', lats.join(','))
        u.searchParams.set('longitude', lons.join(','))
        u.searchParams.set('hourly', 'cloud_cover_low,cloud_cover_mid,cloud_cover_high')
        u.searchParams.set('models', asked)
        u.searchParams.set('run', stamp(run))
        u.searchParams.set('forecast_hours', '48')
        u.searchParams.set('timezone', 'GMT')
        r = await fetch(u)
        body = await r.json()
        if (r.ok) break
        run = new Date(run.getTime() - 3_600_000)
      }
      runs[model] = stamp(run)
      const list = Array.isArray(body) ? body : [body]
      if (!r.ok || list.length !== lats.length) {
        runs[model] = `${stamp(run)} (not available: ${body?.reason ?? r.status})`
        continue
      }
      list.forEach((l, i) => {
        locs[i].hourly.time ??= l.hourly.time
        for (const v of ['cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high']) {
          const at = locs[i].hourly.time.map((t) => l.hourly.time.indexOf(t))
          locs[i].hourly[`${v}_${model}`] = at.map((j) => (j < 0 ? null : l.hourly[v][j]))
        }
      })
    }
    writeFileSync(file, JSON.stringify({ stage: name, now: now.toISOString(), runs, payload: locs }, null, 1) + '\n')
  }
  return JSON.parse(readFileSync(file, 'utf8'))
}

const metars = readFileSync('tests/data/metars-2026-11-12-13.txt', 'utf8')
  .split('\n')
  .filter((l) => l.startsWith('NTU,'))
  .map((l) => l.split(','))
  .map(([, t, m]) => ({ at: new Date(`${t.replace(' ', 'T')}:00Z`), sky: parseMetarSky(m), raw: m }))
  .filter((m) => m.sky !== null)
const clock = (d) => formatClock(d, 'America/New_York', 12)
const L = [
  `# ${kind} ${date}, replayed as it was called at the Virginia Beach Fishing Pier`,
  '',
  `Run ${new Date().toISOString()} · node scripts/measure-stage-replay.mjs ${process.argv.slice(2).join(' ')} · ${kind} ${clock(event)} (${event.toISOString()}), sun ${azimuth.toFixed(0)}° · Open-Meteo single-runs, the run out at each stage (assumed delays: HRRR 1.5 h, GFS 5 h, ECMWF 7 h, ICON 4 h, GEM 6 h), kept in ${DIR}/ · station KNTU's latest at the stage (tests/data/metars-2026-11-12-13.txt) · no satellite, no gap watch`,
  '',
  '| stage | runs | station | toward the sun | afterglow | verdict | call | why | words |',
  '|---|---|---|---|---|---|---|---|---|',
]
const out = []
for (const [name, before] of STAGES) {
  const now = new Date(event.getTime() - before)
  const kept = await pathsFor(name, now)
  const paths = pathsAt(parseFirePaths(kept.payload), nearestHour(event))
  const st = metars.filter((m) => m.at <= now).sort((a, b) => b.at - a.at)[0] ?? null
  const station = st === null ? null : { sky: st.sky, at: st.at }
  const v = fireVerdict(paths, { event, kind, venue: PIER, station, facing: FACING })
  const call = eventCall(v, kind, event, now)
  const runs = Object.entries(kept.runs).filter(([m]) => m !== 'best_match').map(([m, r]) => `${MODEL_LABEL[m]} ${r.slice(5)}`).join(', ')
  out.push({ name, word: v?.word, call: call.call })
  L.push(`| ${name} | ${runs} | ${st === null ? '—' : st.raw.split(' ').slice(0, 7).join(' ')} | ${v?.agree ?? 0} of ${v?.of ?? 0} | ${v?.afterglow?.agree ?? 0} of ${v?.afterglow?.of ?? 0}${v?.afterglow?.best ? ', best match' : ''} | ${v?.line ?? '—'} | ${call.call ?? '—'} | ${call.why} | ${afterglowWords(v, clock) ?? '—'} |`)
}
L.push('')
writeFileSync(`measurements/${date}-${kind}-stages.md`, L.join('\n'))
console.log(L.join('\n'))
