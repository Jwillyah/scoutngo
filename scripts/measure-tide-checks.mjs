/*
 * THE TIDE SHEET'S NUMBERS, EACH WORKED OUT TWO WAYS.
 *
 * Usage:  node scripts/measure-tide-checks.mjs
 * Writes: measurements/<today>-tide-checks.md
 * Exits:  0 every check within its tolerance; 1 not; 2 could not look.
 *
 * At Virginia Beach Fishing Pier, from the station the app picks (the nearest
 * publishing one), straight from NOAA and the map tiles:
 *
 *   times      the app's high and low times (NOAA asked in GMT, parsed, put on
 *              the venue's clock by src/core/timezone.ts) against NOAA's own
 *              table asked in the station's local time, on 3 dates. Within 1 min.
 *   rate       ft/h from the six-minute curve's slope against the half cosine
 *              between the turns (src/core/tideRate.ts), every hour of a day.
 *   moon       the phase by suncalc against days since a known new moon, and
 *              the week's line beside NOAA's actual range those days.
 *   facing     which way the beach faces, by the circle of sea points and by
 *              the nearest sea (src/core/coastFacing.ts), at the pier and at
 *              Brew River Dock Bar (inland: no facing), against the hand
 *              figure of about east for the Virginia Beach oceanfront.
 */
import { writeFileSync } from 'node:fs'
import { formatClock } from '../src/core/timezone.ts'
import { localDate } from '../src/core/moonTimes.ts'
import { nearestStations } from '../src/core/tide.ts'
import { parseCurve, parseExtremes, parseStations, PREDICTIONS_URL, STATIONS_URL } from '../src/lib/noaa.ts'
import { rateFromCurve, rateFromTurns, RATE_AGREE_FT_PER_H } from '../src/core/tideRate.ts'
import { PHASE_AGREE, phaseApart, phaseBySuncalc, phaseBySynodic, tideWeek } from '../src/core/moonTides.ts'
import { angleApart, FACING_AGREE_DEG } from '../src/core/coastFacing.ts'
import { coastFacing } from '../src/lib/coast.ts'
import { setVectorLoader } from '../src/lib/vectorTiles.ts'

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const BREW = { lat: 38.364236, lon: -75.605912 }
const TZ = 'America/New_York'
const DATES = ['2026-10-27', '2026-11-03', '2026-11-15']
const lines = []
let ok = true
const fail = (why) => {
  ok = false
  lines.push(`FAIL: ${why}`)
}
const get = async (url) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`)
  return r.json()
}
setVectorLoader(async (url) => {
  const r = await fetch(url)
  return r.ok ? r.arrayBuffer() : null
})

try {
  /* The station the app would pick: the nearest that publishes high and low water on MLLW. */
  const stations = parseStations(await get(STATIONS_URL))
  const candidates = nearestStations(PIER, stations, 5)
  let station = null
  for (const c of candidates) {
    const probe = await get(`${PREDICTIONS_URL}?${new URLSearchParams({ product: 'predictions', application: 'scoutngo', begin_date: '20261027', end_date: '20261027', datum: 'MLLW', station: c.station.id, time_zone: 'gmt', units: 'english', format: 'json', interval: 'hilo' })}`)
    if (parseExtremes(probe).length > 0) {
      station = c
      break
    }
  }
  if (station === null) throw new Error('no station near the pier publishes high and low water')
  lines.push(`Station: ${station.station.name} (${station.station.id}), ${station.distanceKm.toFixed(2)} km from the pier.`, '')

  /* 1. Times. */
  lines.push('## High and low times: the app against NOAA local time', '', '| date | turn | app (GMT parsed, venue clock) | NOAA (lst_ldt) | apart (min) |', '|---|---|---|---|---|')
  let worstMin = 0
  for (const date of DATES) {
    const d = date.replaceAll('-', '')
    const base = { product: 'predictions', application: 'scoutngo', begin_date: d, end_date: d, datum: 'MLLW', station: station.station.id, units: 'english', format: 'json', interval: 'hilo' }
    const local = (await get(`${PREDICTIONS_URL}?${new URLSearchParams({ ...base, time_zone: 'lst_ldt' })}`)).predictions ?? []
    /* GMT for the day either side, so the whole local day is covered. */
    const prev = new Date(Date.parse(date) - 86_400_000).toISOString().slice(0, 10).replaceAll('-', '')
    const next = new Date(Date.parse(date) + 86_400_000).toISOString().slice(0, 10).replaceAll('-', '')
    const app = parseExtremes(await get(`${PREDICTIONS_URL}?${new URLSearchParams({ ...base, begin_date: prev, end_date: next, time_zone: 'gmt' })}`)).filter((e) => localDate(e.at, TZ) === date)
    if (app.length !== local.length) fail(`${date}: the app has ${app.length} turns, NOAA's local table ${local.length}`)
    for (let i = 0; i < Math.min(app.length, local.length); i += 1) {
      const mine = formatClock(app[i].at, TZ, 24)
      const theirs = String(local[i].t).slice(11, 16)
      const apart = Math.abs((Number(mine.slice(0, 2)) * 60 + Number(mine.slice(3))) - (Number(theirs.slice(0, 2)) * 60 + Number(theirs.slice(3))))
      worstMin = Math.max(worstMin, apart)
      lines.push(`| ${date} | ${app[i].kind} ${app[i].feet.toFixed(2)} ft | ${mine} | ${theirs} (${local[i].type} ${Number(local[i].v).toFixed(2)} ft) | ${apart} |`)
    }
  }
  lines.push('', `Largest difference: ${worstMin} min (limit 1).`, '')
  if (worstMin > 1) fail(`a turn is ${worstMin} min from NOAA's own local table`)

  /*
   * 2. Rate, two ways, through 27 Oct. The pier's station publishes only its
   * turns, so the comparison is made at the nearest reference station that
   * publishes the six-minute curve: Chesapeake Bay Bridge Tunnel, 8638863.
   */
  const day = { product: 'predictions', application: 'scoutngo', begin_date: '20261026', end_date: '20261028', datum: 'MLLW', station: station.station.id, units: 'english', format: 'json', time_zone: 'gmt' }
  const pierCurve = parseCurve(await get(`${PREDICTIONS_URL}?${new URLSearchParams(day)}`))
  const ref = pierCurve.length > 0 ? station.station.id : '8638863'
  const curve = pierCurve.length > 0 ? pierCurve : parseCurve(await get(`${PREDICTIONS_URL}?${new URLSearchParams({ ...day, station: ref })}`))
  const turns = parseExtremes(await get(`${PREDICTIONS_URL}?${new URLSearchParams({ ...day, station: ref, interval: 'hilo' })}`))
  lines.push(`## How fast the water moves, 27 Oct (venue clock), ft/h, at station ${ref}`, '')
  if (pierCurve.length === 0) lines.push(`The pier's station publishes no six-minute curve (the app uses its turns alone), so the two methods are compared at ${ref}, the nearest reference station.`, '')
  if (curve.length === 0) {
    fail('no curve to compare the rates against')
  } else {
    lines.push('| time | curve slope | half cosine | apart |', '|---|---|---|---|')
    let worst = 0
    for (let h = 0; h < 24; h += 1) {
      const at = new Date(Date.parse('2026-10-27T04:00:00Z') + h * 3_600_000)
      const a = rateFromCurve(curve, at)
      const b = rateFromTurns(turns, at)
      if (a === null || b === null) continue
      worst = Math.max(worst, Math.abs(a - b))
      lines.push(`| ${formatClock(at, TZ, 24)} | ${a.toFixed(2)} | ${b.toFixed(2)} | ${Math.abs(a - b).toFixed(2)} |`)
    }
    lines.push('', `Largest difference: ${worst.toFixed(2)} ft/h (limit ${RATE_AGREE_FT_PER_H}).`, '')
    if (worst > RATE_AGREE_FT_PER_H) fail(`the two rates are ${worst.toFixed(2)} ft/h apart`)
  }

  /* 3. Moon, two ways, and the range NOAA predicts. */
  lines.push('## The moon and the size of the tides', '', '| date | phase (suncalc) | phase (synodic) | apart (days) | the line | NOAA range that day (ft) |', '|---|---|---|---|---|---|')
  const month = parseExtremes(await get(`${PREDICTIONS_URL}?${new URLSearchParams({ ...day, begin_date: '20261020', end_date: '20261120', interval: 'hilo' })}`))
  const rangeOn = (date) => {
    const t = month.filter((e) => localDate(e.at, TZ) === date)
    return t.length < 2 ? null : Math.max(...t.map((e) => e.feet)) - Math.min(...t.map((e) => e.feet))
  }
  let worstPhase = 0
  const ranges = []
  for (let d = 0; d < 28; d += 3) {
    const date = new Date(Date.parse('2026-10-21T16:00:00Z') + d * 86_400_000)
    const ymd = localDate(date, TZ)
    const a = phaseBySuncalc(date)
    const b = phaseBySynodic(date)
    worstPhase = Math.max(worstPhase, phaseApart(a, b))
    const r = rangeOn(ymd)
    ranges.push({ week: tideWeek(date)?.kind ?? 'between', r })
    lines.push(`| ${ymd} | ${a.toFixed(3)} | ${b.toFixed(3)} | ${(phaseApart(a, b) * 29.530588853).toFixed(2)} | ${tideWeek(date)?.line ?? '(nothing said)'} | ${r === null ? '—' : r.toFixed(2)} |`)
  }
  const mean = (k) => {
    const v = ranges.filter((x) => x.week === k && x.r !== null).map((x) => x.r)
    return v.length === 0 ? null : v.reduce((p, q) => p + q, 0) / v.length
  }
  lines.push('', `Largest phase difference: ${(worstPhase * 29.530588853).toFixed(2)} days (limit ${(PHASE_AGREE * 29.530588853).toFixed(2)}). Mean NOAA range on "big tides" days ${mean('spring')?.toFixed(2) ?? '—'} ft, on "small tides" days ${mean('neap')?.toFixed(2) ?? '—'} ft.`, '')
  if (worstPhase > PHASE_AGREE) fail('the two moon phases disagree past the limit')
  if (mean('spring') !== null && mean('neap') !== null && mean('spring') <= mean('neap')) fail('NOAA\'s range on "big tides" days is not bigger than on "small tides" days')

  /* 4. Facing, two ways. */
  lines.push('## Which way the beach faces', '', '| place | by the circle | by the nearest sea | apart | hand figure |', '|---|---|---|---|---|')
  const pierRaw = await coastFacing(PIER)
  const brewRaw = await coastFacing(BREW)
  if (pierRaw === 'unavailable' || brewRaw === 'unavailable') throw new Error('the map tiles could not be had')
  const pier = pierRaw === 'inland' ? null : pierRaw
  const brew = brewRaw === 'inland' ? null : brewRaw
  const f = (x) => (x === null || x === undefined ? 'none' : `${Math.round(x)}°`)
  lines.push(`| Virginia Beach Fishing Pier | ${f(pier?.byCircle)} | ${f(pier?.byNearest)} | ${pier?.byCircle != null && pier?.byNearest != null ? Math.round(angleApart(pier.byCircle, pier.byNearest)) + '°' : '—'} | about 90° (east) |`)
  lines.push(`| Brew River Dock Bar, Salisbury | ${f(brew?.byCircle)} | ${f(brew?.byNearest)} | — | none (inland) |`, '')
  if (pier === null) fail('no facing found at the pier')
  else {
    if (pier.byCircle !== null && pier.byNearest !== null && angleApart(pier.byCircle, pier.byNearest) > FACING_AGREE_DEG) fail('the two facings at the pier disagree past the limit')
    if (angleApart(pier.facing, 90) > 30) fail(`the pier faces ${Math.round(pier.facing)}°, not about east`)
  }
  if (brew !== null) fail('Brew River, inland, was given a beach facing')
} catch (error) {
  console.log(`=== TIDE CHECKS ABORTED: ${error instanceof Error ? error.message : String(error)} ===`)
  process.exit(2)
}

const out = ['# The tide sheet\'s numbers, each worked out two ways', '', `Run: ${new Date().toISOString()} · node scripts/measure-tide-checks.mjs · Virginia Beach Fishing Pier ${PIER.lat}, ${PIER.lon} · venue clock ${TZ} · NOAA CO-OPS predictions (MLLW, feet) · OpenFreeMap ocean polygons, zoom 12`, '', ...lines, ok ? 'Pass.' : 'FAIL.', '']
const file = `measurements/${new Date().toISOString().slice(0, 10)}-tide-checks.md`
writeFileSync(file, out.join('\n'))
console.log(out.join('\n'))
process.exit(ok ? 0 : 1)
