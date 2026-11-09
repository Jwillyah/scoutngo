/*
 * HOW CLOSE THE HOME SCREEN CAME, LAST WEEK (Batch M, Section 5).
 *
 * Usage:  node scripts/measure-accuracy.mjs [--end YYYY-MM-DD] [--days 7]
 *                                           [--out measurements/<file>.md]
 *                                           [--sunset-log <truth or fire log export>]
 * Reads:  live, public, keyless: Open-Meteo previous runs and Marine, Iowa
 *         State's ASOS archive (KNTU, KORF), NDBC realtime2 (44099, 44100),
 *         NOAA CO-OPS predictions and observed water levels.
 * Writes: measurements/<YYYY-MM>-accuracy.md by default (the batch's name),
 *         or --out.
 *
 * Every number the Today briefing shows, at three spots (VB Pier, Sandbridge,
 * Chix), for the days ending yesterday at the venue, against what was
 * observed:
 *
 *   air, wind, gust   the briefing's own question (tideSheetData
 *                     BRIEF_WIND_NAMES: Open-Meteo's default model, m/s)
 *                     asked of the previous-runs API: d0 is the newest run
 *                     before the hour, d1 the run a day before. Against the
 *                     nearest of KNTU and KORF (blendData skillStations),
 *                     each hour 5 AM to 8 PM (the briefing's hours), and the
 *                     day's strongest wind and gust over those hours (the
 *                     numbers on the day's row).
 *   sea               Open-Meteo Marine as the Surf page asks it, against the
 *                     nearer of NDBC 44099 and 44100: wave height vs WVHT,
 *                     the app's period (swell, else combined) vs DPD, and the
 *                     app's surf face (surfDay.surfAt) vs the same formula
 *                     (surf.surfEstimate) run on the buoy's WVHT, DPD, MWD.
 *   tide              the app's station (useTide: the nearest NOAA station
 *                     that answers) and its predicted highs and lows, against
 *                     the nearest water-level gauge's observed turns: NOAA's
 *                     verified highs and lows when published, else turns
 *                     found in the preliminary 6-minute levels
 *                     (core/accuracy extremesFromLevels). The gauge's own
 *                     prediction against its own observation is a second row:
 *                     how good the prediction is where it is measured.
 *   sunset call       against a log of what happened, only when one is given
 *                     (--sunset-log) or is in the repo. No log, no row: "no
 *                     log supplied". An outcome is never made up.
 *
 * NOT IN THE GATE: it reaches live hosts, which the gate and the tests never
 * do (docs/gate.md). docs/accuracy.md says how it is meant to run nightly.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

/* blendData and tideSheetData keep things on the phone; here, in memory. */
const mem = new Map()
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) }

const { HIT, score, agreement, parseNdbcWaves, nearestInTime, extremesFromLevels, matchExtremes, worstRows } = await import('../src/core/accuracy.ts')
const { asosUrl, parseAsos } = await import('../src/core/asos.ts')
const { errorOf, obsNear } = await import('../src/core/sharedSkill.ts')
const { kt } = await import('../src/core/briefing.ts')
const { surfEstimate, surfSize } = await import('../src/core/surf.ts')
const { nearestStations, STATION_USABLE_KM } = await import('../src/core/tide.ts')
const { distanceMeters } = await import('../src/core/geo.ts')
const { zonedTimeToUtc, formatClock } = await import('../src/core/timezone.ts')
const { venueToday } = await import('../src/core/eventDay.ts')
const { skillStations, PREVIOUS_RUNS_URL } = await import('../src/lib/blendData.ts')
const { BRIEF_WIND_NAMES, MARINE_URL, MARINE_NAMES, parseHourly, hourlyAt } = await import('../src/lib/tideSheetData.ts')
const { surfAt } = await import('../src/lib/surfDay.ts')
const { metresToFeet } = await import('../src/lib/tideWords.ts')
const { STATIONS_URL, PREDICTIONS_URL, APPLICATION, parseStations, parseExtremes, parseNoaaTime } = await import('../src/lib/noaa.ts')
const { COAST_CAMS } = await import('../src/data/coastCams.ts')
const { NDBC_BUOYS } = await import('../src/data/ndbc.ts')
const { STATION_ATTEMPTS } = await import('../src/lib/useTide.ts')

/* ------------------------------------------------------------ parameters */

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i < 0 ? undefined : process.argv[i + 1]
}
const TZ = 'America/New_York'
const now = new Date()
const isoDay = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const END = arg('end') ?? isoDay(venueToday(now, TZ), -1)
const DAYS = Number(arg('days') ?? 7)
const DATES = Array.from({ length: DAYS }, (_, i) => isoDay(END, i - DAYS + 1))
const OUT = arg('out') ?? `measurements/${venueToday(now, TZ).slice(0, 7)}-accuracy.md`
const SUNSET_LOG = arg('sunset-log')
const HOURS = Array.from({ length: 16 }, (_, i) => 5 + i)
const BUOYS = ['44099', '44100']
const sha = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
})()

/* THE SPOTS, from the app's own records: the coast cams' pier and beach, and truth case #5's venue for Chix. */
const cam = (id) => {
  const c = COAST_CAMS.find((x) => x.id === id)
  if (c === undefined) throw new Error(`coast cam ${id} is not in src/data/coastCams.ts`)
  return c
}
const chix = JSON.parse(readFileSync('tests/data/sky-fire-2026-11-02-sunset.json', 'utf8')).venue
const SPOTS = [
  { key: 'vb', name: 'VB Pier', at: cam('va-virginia-beach-pier').at, facing: cam('va-virginia-beach-pier').facing, from: "src/data/coastCams.ts 'va-virginia-beach-pier'" },
  { key: 'sb', name: 'Sandbridge', at: cam('va-sandbridge').at, facing: cam('va-sandbridge').facing, from: "src/data/coastCams.ts 'va-sandbridge'" },
  { key: 'chix', name: 'Chix', at: { lat: chix.lat, lon: chix.lon }, facing: null, from: 'tests/data/sky-fire-2026-11-02-sunset.json (truth case #5 venue)',
    /* Chick's Beach faces the bay. Both buoys are on the ocean: scoring the bay's waves against them would measure the wrong water (failure-modes C). */
    noBuoy: 'Chix is on the Chesapeake Bay; 44099 and 44100 are both on the ocean side, so neither measures its water' },
]

const notes = []
const couldNot = []
const say = (s) => console.log(s)

async function getText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'scoutngo-measure-accuracy' } })
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`)
  return r.text()
}
const getJson = async (url) => JSON.parse(await getText(url))

const hourAt = (date, h) => zonedTimeToUtc(date, `${String(h).padStart(2, '0')}:00`, TZ)
const windowStart = zonedTimeToUtc(DATES[0], '00:00', TZ)
const windowEnd = zonedTimeToUtc(isoDay(END, 1), '00:00', TZ)
const inWindow = (d) => d >= windowStart && d < windowEnd
const ymd = (iso) => iso.replaceAll('-', '')

/* --------------------------------------------------------------- weather */

const rows = []
/* `pool`: rows with one pool key are the same pairs (three spots, one gauge) and count once in the summary. */
const addRow = (spot, item, lead, unit, s, tolWords, source, pool = `${spot.name}|${item}|${lead}`) => rows.push({ spot: spot.name, item, lead, unit, score: s, tolWords, source, pool, label: `${spot.name} · ${item}${lead === '' ? '' : ` (${lead})`}` })

const asosIds = ['KNTU', 'KORF']
let asos = []
try {
  const csv = await getText(asosUrl(asosIds, new Date(windowStart.getTime() - 3_600_000), new Date(windowEnd.getTime() + 3_600_000)))
  asos = parseAsos(csv, asosIds)
  say(`ASOS: ${asos.length} reports (${asosIds.map((id) => `${id} ${asos.filter((o) => o.station === id).length}`).join(', ')})`)
} catch (e) {
  couldNot.push(`ASOS (KNTU, KORF): ${e.message}`)
}
const asObs = (o) => ({ at: o.at, temp: o.tempC, dew: o.dewC, wind: o.windMps, gust: o.gustMps, dir: o.dirDeg, cloud: o.cloudPct, wet: o.wet })

const WX = ['temperature_2m', 'wind_speed_10m', 'wind_gusts_10m']
/* The briefing asks for these, and more: the three it shows a number for are scored. */
for (const v of WX) if (!BRIEF_WIND_NAMES.includes(v)) throw new Error(`${v} is no longer in the briefing's question (tideSheetData BRIEF_WIND_NAMES)`)

const spotStation = new Map()
for (const spot of SPOTS) {
  const near = skillStations(spot.at, 2).filter((s) => asosIds.includes(s.id))
  const st = near[0]
  if (st === undefined) {
    couldNot.push(`${spot.name}: neither KNTU nor KORF within reach`)
    continue
  }
  spotStation.set(spot.key, st)
  const obs = asos.filter((o) => o.station === st.id).map(asObs)
  const p = new URLSearchParams({
    latitude: spot.at.lat.toFixed(2),
    longitude: spot.at.lon.toFixed(2),
    hourly: WX.flatMap((v) => [v, `${v}_previous_day1`]).join(','),
    wind_speed_unit: 'ms',
    start_date: DATES[0],
    end_date: isoDay(END, 1),
    timezone: 'GMT',
  })
  let fc
  try {
    const payload = await getJson(`${PREVIOUS_RUNS_URL}?${p}`)
    fc = parseHourly(payload, WX.flatMap((v) => [v, `${v}_previous_day1`]))
    if (fc === null) throw new Error('no hourly series')
    const cellKm = distanceMeters(spot.at, { lat: payload.latitude, lon: payload.longitude }) / 1000
    notes.push(`${spot.name}: Open-Meteo answered for its grid cell at ${payload.latitude.toFixed(3)}, ${payload.longitude.toFixed(3)}, ${cellKm.toFixed(1)} km from the spot.`)
    /* d1 must be a different run from d0, or the d1 rows would be d0 twice (failure-modes C). */
    const same = fc.values.temperature_2m.every((x, i) => x === fc.values.temperature_2m_previous_day1[i])
    if (same) throw new Error('the day-before temperatures are identical to the newest run: no separate run came back')
  } catch (e) {
    couldNot.push(`${spot.name} forecast (Open-Meteo previous runs): ${e.message}`)
    continue
  }
  for (const [lead, suffix] of [['d0', ''], ['d1', '_previous_day1']]) {
    const err = { temp: [], wind: [], gust: [], windMax: [], gustMax: [] }
    for (const date of DATES) {
      let fcWindMax = null
      let fcGustMax = null
      let obWindMax = null
      let obGustMax = null
      let obHours = 0
      for (const h of HOURS) {
        const at = hourAt(date, h)
        const o = obsNear(obs, at)
        const fT = hourlyAt(fc, `temperature_2m${suffix}`, at)
        const fW = hourlyAt(fc, `wind_speed_10m${suffix}`, at)
        const fG = hourlyAt(fc, `wind_gusts_10m${suffix}`, at)
        if (fW !== null) fcWindMax = Math.max(fcWindMax ?? 0, fW)
        if (fG !== null) fcGustMax = Math.max(fcGustMax ?? 0, fG)
        if (o === null) continue
        if (o.wind !== null) {
          obHours += 1
          obWindMax = Math.max(obWindMax ?? 0, o.wind)
          obGustMax = Math.max(obGustMax ?? 0, o.gust ?? o.wind)
        }
        if (fT !== null) err.temp.push(errorOf('temp', fT, o))
        if (fW !== null) err.wind.push(kt(errorOf('wind', fW, o)))
        if (fG !== null) err.gust.push(kt(errorOf('gust', fG, o)))
      }
      /* The day's row is the strongest of 16 hours: a day with a quarter of them unreported is not scored. */
      if (obHours >= 12 && fcWindMax !== null && obWindMax !== null) err.windMax.push(kt(fcWindMax - obWindMax))
      if (obHours >= 12 && fcGustMax !== null && obGustMax !== null) err.gustMax.push(kt(fcGustMax - obGustMax))
    }
    const clean = (xs) => xs.filter((x) => x !== null)
    const src = `Open-Meteo default model vs ${st.id} (${st.km.toFixed(1)} km)`
    addRow(spot, 'air temperature', lead, '°F', { ...score(clean(err.temp), HIT.tempC), unitScale: 9 / 5 }, `±${HIT.tempC} °C (${(HIT.tempC * 9) / 5} °F)`, src)
    addRow(spot, 'wind, hourly', lead, 'kt', score(clean(err.wind), HIT.windKt), `±${HIT.windKt} kt`, src)
    addRow(spot, 'gust, hourly', lead, 'kt', score(clean(err.gust), HIT.gustKt), `±${HIT.gustKt} kt`, src)
    addRow(spot, "day's strongest wind", lead, 'kt', score(clean(err.windMax), HIT.windKt), `±${HIT.windKt} kt`, src)
    addRow(spot, "day's strongest gust", lead, 'kt', score(clean(err.gustMax), HIT.gustKt), `±${HIT.gustKt} kt`, src)
  }
}

/* ------------------------------------------------------------------- sea */

const buoyObs = new Map()
for (const id of BUOYS) {
  try {
    const txt = await getText(`https://www.ndbc.noaa.gov/data/realtime2/${id}.txt`)
    const waves = parseNdbcWaves(txt).filter((w) => w.at >= new Date(windowStart.getTime() - 3_600_000) && w.at < new Date(windowEnd.getTime() + 3_600_000))
    if (waves.length === 0) throw new Error('no wave rows in the window')
    buoyObs.set(id, waves)
    say(`NDBC ${id}: ${waves.length} wave reports in the window`)
  } catch (e) {
    couldNot.push(`NDBC ${id}: ${e.message}`)
  }
}

const marineNames = ['wave_height', 'wave_period', 'wave_direction', 'swell_wave_height', 'swell_wave_period', 'swell_wave_direction', 'wind_wave_height']
for (const v of marineNames) if (!MARINE_NAMES.includes(v)) throw new Error(`${v} is no longer in the Surf page's question (tideSheetData MARINE_NAMES)`)
for (const spot of SPOTS) {
  if (spot.noBuoy !== undefined) {
    couldNot.push(`${spot.name} sea: ${spot.noBuoy}`)
    continue
  }
  const buoys = NDBC_BUOYS.filter(([id]) => BUOYS.includes(id) && buoyObs.has(id))
    .map(([id, lat, lon, name]) => ({ id, name, km: distanceMeters(spot.at, { lat, lon }) / 1000 }))
    .sort((a, b) => a.km - b.km)
  const buoy = buoys[0]
  if (buoy === undefined) {
    couldNot.push(`${spot.name} sea: no buoy answered`)
    continue
  }
  const p = new URLSearchParams({ latitude: spot.at.lat.toFixed(2), longitude: spot.at.lon.toFixed(2), hourly: [...marineNames, 'wave_height_previous_day1'].join(','), start_date: DATES[0], end_date: isoDay(END, 1), timezone: 'GMT' })
  let marine
  try {
    const payload = await getJson(`${MARINE_URL}?${p}`)
    marine = parseHourly(payload, [...marineNames, 'wave_height_previous_day1'])
    if (marine === null || marine.values.wave_height.every((x) => x === null)) throw new Error('no wave heights for this cell')
    const cellKm = distanceMeters(spot.at, { lat: payload.latitude, lon: payload.longitude }) / 1000
    notes.push(`${spot.name}: Open-Meteo Marine answered for its cell at ${payload.latitude.toFixed(3)}, ${payload.longitude.toFixed(3)}, ${cellKm.toFixed(1)} km from the spot; buoy ${buoy.id} ${buoy.name}, ${buoy.km.toFixed(0)} km.`)
    /* d1 must be a different run, or the d1 row is d0 twice (failure-modes C). */
    if (marine.values.wave_height.every((x, i) => x === marine.values.wave_height_previous_day1[i])) throw new Error('the day-before wave heights are identical to the newest run: no separate run came back')
  } catch (e) {
    couldNot.push(`${spot.name} sea forecast (Open-Meteo Marine): ${e.message}`)
    continue
  }
  const obs = buoyObs.get(buoy.id)
  const err = { wave: [], waveD1: [], period: [], face: [] }
  const words = []
  for (const date of DATES) {
    for (const h of HOURS) {
      const at = hourAt(date, h)
      const o = nearestInTime(obs, at, 30)
      if (o === null) continue
      const fH = hourlyAt(marine, 'wave_height', at)
      if (fH !== null) err.wave.push(metresToFeet(fH) - metresToFeet(o.waveM))
      const fH1 = hourlyAt(marine, 'wave_height_previous_day1', at)
      if (fH1 !== null) err.waveD1.push(metresToFeet(fH1) - metresToFeet(o.waveM))
      const app = surfAt(marine, at, spot.facing)
      if (app === null) continue
      if (o.periodS !== null) err.period.push(app.periodS - o.periodS)
      if (o.periodS !== null && o.fromDeg !== null) {
        const seen = surfEstimate(o.waveM, o.periodS, o.fromDeg, spot.facing)
        err.face.push(app.estimate.faceFt - seen.faceFt)
        words.push([app.estimate.size, surfSize(seen.faceFt)])
      }
    }
  }
  const src = `Open-Meteo Marine vs NDBC ${buoy.id} (${buoy.km.toFixed(0)} km)`
  addRow(spot, 'wave height (Hs)', 'd0', 'ft', score(err.wave, HIT.waveFt), `±${HIT.waveFt} ft`, src)
  addRow(spot, 'wave height (Hs)', 'd1', 'ft', score(err.waveD1, HIT.waveFt), `±${HIT.waveFt} ft`, src)
  addRow(spot, 'wave period', 'd0', 's', score(err.period, HIT.periodS), `±${HIT.periodS} s`, src)
  addRow(spot, 'surf face', 'd0', 'ft', score(err.face, HIT.faceFt), `±${HIT.faceFt} ft`, src)
  addRow(spot, 'surf size word', 'd0', '', agreement(words), 'same word', src)
}
notes.push("The surf face is the app's number (surfDay.surfAt): the swell's height and period when Open-Meteo gives them, else the whole sea's. The buoy's WVHT and DPD are the whole sea, wind waves included, put through the same formula (surf.surfEstimate). Part of a low face bias can be that choice; the wave height (Hs) row compares the whole sea with the whole sea.")
notes.push("The wave height is scored at d0 and d1 (Open-Meteo Marine's wave_height_previous_day1). The period, the surf face and its word are scored at d0 only: the day-before run of the swell they are made from was not asked for.")

/* ------------------------------------------------------------------ tide */

const noaaUrl = (q) => `${PREDICTIONS_URL}?${new URLSearchParams({ application: APPLICATION, datum: 'MLLW', time_zone: 'gmt', units: 'english', format: 'json', ...q })}`
const tideSpan = { begin_date: ymd(isoDay(DATES[0], -1)), end_date: ymd(isoDay(END, 1)) }
let tidePredStations = []
let gauges = []
try {
  tidePredStations = parseStations(await getJson(STATIONS_URL))
  gauges = parseStations(await getJson('https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels'))
  say(`NOAA: ${tidePredStations.length} prediction stations, ${gauges.length} water-level gauges`)
} catch (e) {
  couldNot.push(`NOAA station lists: ${e.message}`)
}

async function predictedAt(id) {
  const list = parseExtremes(await getJson(noaaUrl({ product: 'predictions', interval: 'hilo', station: id, ...tideSpan })))
  return list
}

/** Observed turns at a gauge: verified when published, else found in the preliminary 6-minute levels. */
const observedCache = new Map()
async function observedAt(id) {
  if (observedCache.has(id)) return observedCache.get(id)
  let got = null
  try {
    const hl = await getJson(noaaUrl({ product: 'high_low', station: id, ...tideSpan }))
    if (Array.isArray(hl.data) && hl.data.length > 0) {
      const turns = hl.data.map((r) => ({ at: parseNoaaTime(r.t), feet: Number(r.v), kind: /H/.test(r.ty ?? '') ? 'high' : 'low' })).filter((r) => r.at !== null && Number.isFinite(r.feet))
      /* Verified only up to some day: a partial week is not the week, so the levels below are used instead. */
      if (turns.filter((e) => inWindow(e.at)).length >= DAYS * 3) got = { turns, how: 'NOAA verified highs and lows (high_low)' }
      else notes.push(`gauge ${id}: verified highs and lows cover only ${turns.filter((e) => inWindow(e.at)).length} turns of the week, so its preliminary levels are used`)
    }
  } catch {
    /* not published yet: the levels below */
  }
  if (got === null) {
    try {
      const wl = await getJson(noaaUrl({ product: 'water_level', station: id, ...tideSpan }))
      const levels = (wl.data ?? []).map((r) => ({ at: parseNoaaTime(r.t), feet: r.v === '' ? NaN : Number(r.v) })).filter((r) => r.at !== null && Number.isFinite(r.feet))
      if (levels.length > 0) got = { turns: extremesFromLevels(levels), how: `turns in NOAA's preliminary 6-minute water levels (${levels.length} samples; verified highs and lows not yet published)` }
    } catch {
      /* no levels either */
    }
  }
  observedCache.set(id, got)
  return got
}

let gaugeUsed = null
for (const spot of SPOTS) {
  /* The app's station: useTide's rule, the nearest of STATION_ATTEMPTS that answers. */
  let app = null
  for (const c of nearestStations(spot.at, tidePredStations, STATION_ATTEMPTS)) {
    if (c.proximity === 'none') break
    try {
      const list = await predictedAt(c.station.id)
      if (list.length > 0) {
        app = { ...c, list: list.filter((e) => inWindow(e.at)) }
        break
      }
    } catch {
      /* next */
    }
  }
  if (app === null) {
    couldNot.push(`${spot.name} tide: no NOAA prediction station within ${STATION_USABLE_KM} km answered`)
    continue
  }
  /* The nearest gauge with observed turns: at least one a day, or it was not seen. */
  let gauge = null
  for (const g of nearestStations(spot.at, gauges, 6)) {
    const obs = await observedAt(g.station.id)
    if (obs !== null && obs.turns.filter((e) => inWindow(e.at)).length >= DAYS * 3) {
      gauge = { ...g, obs }
      break
    }
  }
  if (gauge === null) {
    couldNot.push(`${spot.name} tide: no water-level gauge among the six nearest had observed turns for the week`)
    continue
  }
  /*
   * NO GAUGE STANDS AT ANY OF THE SPOTS. The app's station there is a
   * subordinate one: NOAA's prediction at a reference gauge moved by a fixed
   * time and height offset. Its turns set against a gauge kilometres away
   * measure the water between them as much as the prediction (VB Pier
   * against the CBBT gauge in the bay: half an hour; Sandbridge: more), so
   * that comparison is printed for information and not scored. What is
   * scored is the prediction where it IS measured: the nearest gauge's own
   * predicted turns against its own observed ones.
   */
  const between = matchExtremes(app.list, gauge.obs.turns)
  const s = (xs) => score(xs, 1)
  const t = s(between.pairs.map((p) => p.minutes))
  const h = s(between.pairs.map((p) => p.feet))
  let own
  try {
    own = matchExtremes((await predictedAt(gauge.station.id)).filter((e) => inWindow(e.at)), gauge.obs.turns)
  } catch (e) {
    couldNot.push(`${spot.name} tide: gauge ${gauge.station.id} published no predictions (${e.message})`)
    continue
  }
  const src = `NOAA prediction at gauge ${gauge.station.id} ${gauge.station.name} (${gauge.distanceKm.toFixed(1)} km) vs its observed turns`
  addRow(spot, 'tide turn time', 'NOAA', 'min', score(own.pairs.map((p) => p.minutes), HIT.tideMin), `±${HIT.tideMin} min`, src, `tide-time|${gauge.station.id}`)
  addRow(spot, 'tide turn height', 'NOAA', 'ft', score(own.pairs.map((p) => p.feet), HIT.tideFt), `±${HIT.tideFt} ft`, src, `tide-height|${gauge.station.id}`)
  notes.push(`${spot.name} tide: the app's station is ${app.station.id} ${app.station.name}, ${app.distanceKm.toFixed(1)} km (${app.list.length} predicted turns in the week). Nearest gauge with observed turns: ${gauge.station.id} ${gauge.station.name}, ${gauge.distanceKm.toFixed(1)} km, from ${gauge.obs.how}; ${own.pairs.length} of its own predicted turns paired. Not scored, for information: the app's ${app.station.name} turns against that gauge's observed ones differ by ${t.mae === null ? '—' : t.mae.toFixed(1)} min on average (bias ${t.bias === null ? '—' : t.bias.toFixed(1)} min) and ${h.mae === null ? '—' : h.mae.toFixed(2)} ft, over ${t.n} pairs: the water between them, not only the prediction.`)
  if (gaugeUsed === null) gaugeUsed = gauge
}

/* --------------------------------------------------------------- sunset */

const sunsetLines = []
const needLog = []
let logEntries = []
if (SUNSET_LOG !== undefined) {
  const raw = JSON.parse(readFileSync(SUNSET_LOG, 'utf8'))
  logEntries = Array.isArray(raw) ? raw : (raw.entries ?? [])
  say(`sunset log: ${logEntries.length} entries from ${SUNSET_LOG}`)
}
/* Truth case #5 is the one sunset outcome in the repo; it is quoted from its own file, not restated. */
const REPLAY = 'measurements/2026-11-02-truth-5-replay.md'
const replay = existsSync(REPLAY) ? readFileSync(REPLAY, 'utf8') : ''
const replayObserved = replay.split('\n').find((l) => /^Observed/.test(l) && /FIRED/.test(l)) ?? null
const replayRows = replay.split('\n').filter((l) => /^\| (T-\d+|\s*\|)/.test(l))
const sameDay = (iso, date) => typeof iso === 'string' && venueToday(new Date(iso), TZ) === date
for (const spot of SPOTS) {
  for (const date of DATES) {
    const fromLog = logEntries.filter((e) => {
      if (e.date === date && e.event === 'sunset' && typeof e.place === 'string') return new RegExp(spot.name.split(' ')[0], 'i').test(e.place)
      if (typeof e.lat === 'number' && sameDay(e.at, date) && e.said?.event === 'sunset') return distanceMeters(spot.at, { lat: e.lat, lon: e.lon }) <= 5000
      return false
    })
    if (fromLog.length > 0) {
      for (const e of fromLog) sunsetLines.push(`| ${spot.name} | ${date} | ${e.forecast ?? e.said?.fire ?? '— (the log does not say what the app said)'} | ${e.outcome ?? '— (no outcome logged)'} | ${SUNSET_LOG} |`)
      continue
    }
    if (spot.key === 'chix' && date === '2026-11-02' && replayObserved !== null) {
      const t30 = replayRows.findIndex((l) => l.startsWith('| T-30'))
      const call = (l) => l?.split('|').map((x) => x.trim()).filter((x) => x !== '').at(-1) ?? '—'
      sunsetLines.push(`| Chix | 2026-11-02 | T-30, models alone: ${call(replayRows[t30])}; with reports and satellite: ${call(replayRows[t30 + 1])} (replayed after the fact) | FIRED, 5:00-5:20 PM by eye | ${REPLAY} |`)
      continue
    }
    sunsetLines.push(`| ${spot.name} | ${date} | — | no log supplied | — |`)
    needLog.push(`${spot.name} ${date}`)
  }
}

/* --------------------------------------------------------------- report */

const scored = rows.filter((r) => r.score.n > 0)
if (scored.length === 0) {
  console.error('MEASURE ACCURACY: nothing could be scored. ' + couldNot.join('; '))
  process.exit(2)
}
const f = (x, d = 1) => (x === null || x === undefined ? '—' : x.toFixed(d))
const pct = (x) => (x === null ? '—' : `${Math.round(x * 100)}%`)
/* The air is scored in °C (the tolerance); it is shown in °F, as the app's default units. */
const shown = (r, x) => (x === null ? null : x * (r.score.unitScale ?? 1))
const line = (r) => `| ${r.spot} | ${r.item} | ${r.lead} | ${r.score.n} | ${r.unit === '' ? '—' : `${f(shown(r, r.score.mae))} ${r.unit}`} | ${r.unit === '' ? '—' : `${f(shown(r, r.score.bias), 1)} ${r.unit}`} | ${pct(r.score.hit)} | ${r.tolWords} |`

const L = []
L.push(`# Accuracy: the home screen against what happened, ${DATES[0]} to ${END}`)
L.push('')
L.push(`Run ${now.toISOString()} at ${sha} · \`node scripts/measure-accuracy.mjs${process.argv.slice(2).length > 0 ? ` ${process.argv.slice(2).join(' ')}` : ''}\``)
L.push('')
L.push('## Run parameters')
L.push('')
L.push(`- days: ${DAYS}, ${DATES[0]} to ${END} (${TZ}), ending yesterday at the venue`)
L.push(`- hours scored: ${HOURS[0]}:00 to ${HOURS.at(-1)}:00 local, the briefing's hours; an observation counts within 30 min of the hour`)
for (const s of SPOTS) L.push(`- ${s.name}: ${s.at.lat}, ${s.at.lon}${s.facing === null ? '' : `, faces ${s.facing}°`} — ${s.from}`)
L.push('- weather: Open-Meteo previous runs, the briefing\'s variables (temperature_2m, wind_speed_10m, wind_gusts_10m), default model, coordinates to 2 decimals as the app asks; d0 the newest run before the hour, d1 the run a day earlier')
L.push(`- weather observed: Iowa State ASOS archive, routine reports, ${asosIds.join(' and ')}; the nearer to each spot (${SPOTS.map((s) => `${s.name} ${spotStation.get(s.key)?.id ?? '—'}`).join(', ')})`)
L.push(`- sea: Open-Meteo Marine (the Surf page's variables) vs NDBC realtime2 ${BUOYS.join(' and ')}, the nearer to each spot`)
L.push('- tide: NOAA CO-OPS predictions (hilo, MLLW) at the station the app picks, vs the nearest water-level gauge with observed turns')
L.push(`- hit: air within ${HIT.tempC} °C (${(HIT.tempC * 9) / 5} °F), wind and gust within ${HIT.windKt} kt, wave height and surf face within ${HIT.waveFt} ft, period within ${HIT.periodS} s, surf size the same word (Flat, Small, Fun, Solid, Big), tide turn within ${HIT.tideMin} min and ${HIT.tideFt} ft`)
L.push('- errors are forecast minus observed: a positive bias is a forecast too high, or a tide turn said later than it came')
L.push('')
L.push('## Summary')
L.push('')
L.push('All spots together, the newest forecast (d0) and the tide predictions. Hit rate pooled over every pair; a pair two spots share (one tide gauge) is counted once.')
L.push('')
L.push('| item | pairs | MAE | bias | hit rate | hit is |')
L.push('|---|---|---|---|---|---|')
const items = [...new Set(rows.map((r) => r.item))]
for (const item of items) {
  const rs = rows.filter((r) => r.item === item && (r.lead === 'd0' || r.lead === 'NOAA') && r.score.n > 0).filter((r, i, all) => all.findIndex((o) => o.pool === r.pool) === i)
  const n = rs.reduce((a, r) => a + r.score.n, 0)
  if (n === 0) {
    L.push(`| ${item} | 0 | — | — | — | could not measure |`)
    continue
  }
  const w = (k) => (rs.some((r) => r.score[k] === null) ? null : rs.reduce((a, r) => a + (k === 'hit' ? r.score.hit : shown(r, r.score[k])) * r.score.n, 0) / n)
  const unit = rs[0].unit
  L.push(`| ${item} | ${n} | ${unit === '' ? '—' : `${f(w('mae'))} ${unit}`} | ${unit === '' ? '—' : `${f(w('bias'))} ${unit}`} | ${pct(w('hit'))} | ${rs[0].tolWords} |`)
}
L.push('')
L.push('## Per spot, per item')
L.push('')
L.push('| spot | item | lead | pairs | MAE | bias | hit rate | hit is |')
L.push('|---|---|---|---|---|---|---|---|')
for (const r of rows) L.push(line(r))
L.push('')
L.push('Sources per row:')
L.push('')
for (const r of rows.filter((x, i, all) => all.findIndex((y) => y.spot === x.spot && y.source === x.source) === i)) L.push(`- ${r.spot}: ${r.source}`)
L.push('')
L.push('## Worst 3 items')
L.push('')
L.push('Lowest hit rate among the d0 and tide rows at the three spots (ties: the larger mean error).')
L.push('')
const worst = worstRows(rows.filter((r) => r.lead === 'd0' || r.lead === 'NOAA').filter((r, i, all) => all.findIndex((o) => o.pool === r.pool) === i), 3)
worst.forEach((r, i) => L.push(`${i + 1}. ${r.label}: hit ${pct(r.score.hit)} of ${r.score.n}${r.unit === '' ? '' : `, MAE ${f(shown(r, r.score.mae))} ${r.unit}, bias ${f(shown(r, r.score.bias))} ${r.unit}`} (${r.source})`))
L.push('')
L.push('## Sunset call against the log')
L.push('')
L.push('| spot | date | what the app said | what happened | from |')
L.push('|---|---|---|---|---|')
L.push(...sunsetLines)
L.push('')
if (needLog.length > 0) L.push(`Needs Jwilly's log (${needLog.length} sunsets): ${needLog.join(', ')}. The app keeps the log on the phone (src/lib/truthLog.ts, src/lib/fireLog.ts); export it and run again with \`--sunset-log <file>\`. No outcome is filled in without it.`, '')
L.push('## Notes')
L.push('')
for (const n of notes) L.push(`- ${n}`)
L.push('')
L.push('## Could not measure')
L.push('')
if (couldNot.length === 0) L.push('- nothing beyond the sunset log above')
for (const c of couldNot) L.push(`- ${c}`)
L.push('')
L.push(`Times are ${TZ}. The first observed turn found at gauge ${gaugeUsed?.station.id ?? '—'}: ${(() => {
  const g = gaugeUsed?.obs.turns.find((e) => inWindow(e.at))
  return g === undefined ? '—' : `${g.kind} at ${formatClock(g.at, TZ, 12)} on ${venueToday(g.at, TZ)}, ${g.feet.toFixed(2)} ft MLLW`
})()}.`)

writeFileSync(OUT, `${L.join('\n')}\n`)
say(L.join('\n'))
say(`wrote ${OUT}`)
/* A row of each kind must have been scored, or the report is of something else (failure-modes B). */
const missingKinds = ['air temperature', 'wind, hourly', 'wave height (Hs)', 'tide turn time'].filter((k) => !scored.some((r) => r.item === k))
if (missingKinds.length > 0) {
  console.error(`MEASURE ACCURACY: nothing scored for ${missingKinds.join(', ')}`)
  process.exit(1)
}
